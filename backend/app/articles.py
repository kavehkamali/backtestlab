from __future__ import annotations
"""
SEO-oriented articles (learn hub). Public read; admin CRUD via Bearer token.
"""

import os
import re
import sqlite3
import xml.sax.saxutils as xml_esc
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from .analytics import get_db, verify_admin

PUBLIC_SITE_URL = (os.environ.get("EQUILIMA_PUBLIC_URL") or "https://equilima.com").rstrip("/")

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

public_router = APIRouter(prefix="/api", tags=["articles"])
admin_router = APIRouter(prefix="/api/admin/articles", tags=["admin-articles"])


def init_articles_db():
    conn = get_db()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                meta_description TEXT NOT NULL DEFAULT '',
                excerpt TEXT NOT NULL DEFAULT '',
                body_html TEXT NOT NULL DEFAULT '',
                og_image_url TEXT,
                author_name TEXT NOT NULL DEFAULT 'Equilima',
                cluster_key TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'draft',
                published_at TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_articles_status_pub ON articles(status, published_at DESC);
            CREATE INDEX IF NOT EXISTS idx_articles_cluster ON articles(cluster_key);
            """
        )
        conn.commit()
    finally:
        conn.close()


init_articles_db()


def _now_sqlite() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _validate_slug(slug: str) -> str:
    s = (slug or "").strip().lower()
    if not s or not _SLUG_RE.match(s):
        raise HTTPException(status_code=400, detail="Invalid slug (use lowercase letters, numbers, hyphens)")
    if len(s) > 120:
        raise HTTPException(status_code=400, detail="Slug too long")
    return s


def _row_to_public(row: sqlite3.Row, include_body: bool) -> dict[str, Any]:
    slug = row["slug"]
    url = f"{PUBLIC_SITE_URL}/learn/{slug}"
    published = row["published_at"] or ""
    modified = row["updated_at"] or published
    title = row["title"]
    desc = row["meta_description"] or ""
    author = row["author_name"] or "Equilima"
    img = (row["og_image_url"] or "").strip() or f"{PUBLIC_SITE_URL}/og-image.png"
    json_ld = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": title,
        "description": desc,
        "datePublished": published or modified,
        "dateModified": modified,
        "author": {"@type": "Organization", "name": author},
        "publisher": {
            "@type": "Organization",
            "name": "Equilima",
            "logo": {"@type": "ImageObject", "url": f"{PUBLIC_SITE_URL}/og-image.png"},
        },
        "mainEntityOfPage": {"@type": "WebPage", "@id": url},
        "url": url,
        "image": img,
    }
    out: dict[str, Any] = {
        "slug": slug,
        "title": title,
        "meta_description": desc,
        "excerpt": row["excerpt"] or "",
        "author_name": author,
        "og_image_url": row["og_image_url"] or "",
        "cluster_key": row["cluster_key"] or "",
        "published_at": published,
        "updated_at": row["updated_at"] or "",
        "canonical_url": url,
        "json_ld": json_ld,
    }
    if include_body:
        out["body_html"] = row["body_html"] or ""
    return out


@public_router.get("/articles")
def list_published_articles(cluster: str = ""):
    """Published articles for hub listing (newest first)."""
    conn = get_db()
    try:
        ck = (cluster or "").strip()
        if ck:
            rows = conn.execute(
                """
                SELECT slug, title, meta_description, excerpt, author_name, cluster_key,
                       published_at, updated_at, og_image_url
                FROM articles
                WHERE status = 'published' AND published_at IS NOT NULL AND cluster_key = ?
                ORDER BY datetime(published_at) DESC
                """,
                (ck,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT slug, title, meta_description, excerpt, author_name, cluster_key,
                       published_at, updated_at, og_image_url
                FROM articles
                WHERE status = 'published' AND published_at IS NOT NULL
                ORDER BY datetime(published_at) DESC
                """
            ).fetchall()
        return {
            "articles": [
                {
                    "slug": r["slug"],
                    "title": r["title"],
                    "meta_description": r["meta_description"] or "",
                    "excerpt": r["excerpt"] or "",
                    "author_name": r["author_name"] or "",
                    "cluster_key": r["cluster_key"] or "",
                    "published_at": r["published_at"] or "",
                    "updated_at": r["updated_at"] or "",
                    "og_image_url": r["og_image_url"] or "",
                    "url": f"{PUBLIC_SITE_URL}/learn/{r['slug']}",
                }
                for r in rows
            ],
            "site_url": PUBLIC_SITE_URL,
        }
    finally:
        conn.close()


@public_router.get("/articles/{slug}")
def get_published_article(slug: str, response: Response):
    """Single published article with JSON-LD for SEO."""
    response.headers["Cache-Control"] = "public, max-age=120"
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM articles WHERE slug = ? AND status = 'published' AND published_at IS NOT NULL",
            (slug.strip().lower(),),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        return _row_to_public(row, include_body=True)
    finally:
        conn.close()


@public_router.get("/sitemap-articles.xml")
def articles_sitemap_xml():
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT slug, updated_at, published_at FROM articles
            WHERE status = 'published' AND published_at IS NOT NULL
            ORDER BY slug
            """
        ).fetchall()
        lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ]
        for r in rows:
            loc = f"{PUBLIC_SITE_URL}/learn/{xml_esc.escape(r['slug'])}"
            lastmod = (r["updated_at"] or r["published_at"] or "")[:10]
            lines.append("  <url>")
            lines.append(f"    <loc>{loc}</loc>")
            if lastmod:
                lines.append(f"    <lastmod>{xml_esc.escape(lastmod)}</lastmod>")
            lines.append("    <changefreq>weekly</changefreq>")
            lines.append("    <priority>0.7</priority>")
            lines.append("  </url>")
        lines.append("</urlset>")
        return Response("\n".join(lines), media_type="application/xml")
    finally:
        conn.close()


@admin_router.get("")
def admin_list_articles(
    q: str = "",
    status: str = "",
    limit: int = 200,
    _ok: bool = Depends(verify_admin),
):
    conn = get_db()
    try:
        lim = max(1, min(500, int(limit)))
        qn = (q or "").strip().lower()
        st = (status or "").strip().lower()
        if qn and st in ("draft", "published"):
            rows = conn.execute(
                """
                SELECT id, slug, title, status, cluster_key, published_at, updated_at
                FROM articles
                WHERE status = ? AND (lower(title) LIKE ? OR lower(slug) LIKE ?)
                ORDER BY datetime(updated_at) DESC
                LIMIT ?
                """,
                (st, f"%{qn}%", f"%{qn}%", lim),
            ).fetchall()
        elif qn:
            rows = conn.execute(
                """
                SELECT id, slug, title, status, cluster_key, published_at, updated_at
                FROM articles
                WHERE lower(title) LIKE ? OR lower(slug) LIKE ?
                ORDER BY datetime(updated_at) DESC
                LIMIT ?
                """,
                (f"%{qn}%", f"%{qn}%", lim),
            ).fetchall()
        elif st in ("draft", "published"):
            rows = conn.execute(
                """
                SELECT id, slug, title, status, cluster_key, published_at, updated_at
                FROM articles WHERE status = ?
                ORDER BY datetime(updated_at) DESC
                LIMIT ?
                """,
                (st, lim),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, slug, title, status, cluster_key, published_at, updated_at
                FROM articles
                ORDER BY datetime(updated_at) DESC
                LIMIT ?
                """,
                (lim,),
            ).fetchall()
        return {
            "articles": [
                {
                    "id": r["id"],
                    "slug": r["slug"],
                    "title": r["title"],
                    "status": r["status"],
                    "cluster_key": r["cluster_key"] or "",
                    "published_at": r["published_at"] or "",
                    "updated_at": r["updated_at"] or "",
                }
                for r in rows
            ]
        }
    finally:
        conn.close()


@admin_router.get("/{article_id:int}")
def admin_get_article(article_id: int, _ok: bool = Depends(verify_admin)):
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM articles WHERE id = ?", (int(article_id),)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        return {
            "id": row["id"],
            "slug": row["slug"],
            "title": row["title"],
            "meta_description": row["meta_description"] or "",
            "excerpt": row["excerpt"] or "",
            "body_html": row["body_html"] or "",
            "og_image_url": row["og_image_url"] or "",
            "author_name": row["author_name"] or "",
            "cluster_key": row["cluster_key"] or "",
            "status": row["status"],
            "published_at": row["published_at"] or "",
            "created_at": row["created_at"] or "",
            "updated_at": row["updated_at"] or "",
            "public_url": f"{PUBLIC_SITE_URL}/learn/{row['slug']}",
        }
    finally:
        conn.close()


@admin_router.post("")
async def admin_create_article(request: Request, _ok: bool = Depends(verify_admin)):
    body = await request.json()
    slug = _validate_slug(body.get("slug", ""))
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title required")
    meta_description = (body.get("meta_description") or "").strip()
    excerpt = (body.get("excerpt") or "").strip()
    body_html = body.get("body_html") or ""
    if isinstance(body_html, str) is False:
        body_html = str(body_html)
    og_image_url = (body.get("og_image_url") or "").strip()
    author_name = (body.get("author_name") or "Equilima").strip() or "Equilima"
    cluster_key = (body.get("cluster_key") or "").strip()
    status = (body.get("status") or "draft").strip().lower()
    if status not in ("draft", "published"):
        raise HTTPException(status_code=400, detail="status must be draft or published")
    published_at = (body.get("published_at") or "").strip()
    if status == "published" and not published_at:
        published_at = _now_sqlite()
    if status == "draft":
        published_at = None
    now = _now_sqlite()
    conn = get_db()
    try:
        conn.execute(
            """
            INSERT INTO articles (
                slug, title, meta_description, excerpt, body_html, og_image_url,
                author_name, cluster_key, status, published_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                slug,
                title,
                meta_description,
                excerpt,
                body_html,
                og_image_url or None,
                author_name,
                cluster_key,
                status,
                published_at,
                now,
            ),
        )
        conn.commit()
        new_id = conn.execute("SELECT last_insert_rowid() as id").fetchone()["id"]
        return {"ok": True, "id": new_id}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Slug already exists")
    finally:
        conn.close()


@admin_router.patch("/{article_id:int}")
async def admin_patch_article(article_id: int, request: Request, _ok: bool = Depends(verify_admin)):
    body = await request.json()
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM articles WHERE id = ?", (int(article_id),)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        slug = row["slug"]
        if "slug" in body and body["slug"] is not None:
            slug = _validate_slug(body["slug"])
        title = row["title"]
        if "title" in body:
            title = (body["title"] or "").strip()
            if not title:
                raise HTTPException(status_code=400, detail="title required")
        meta_description = body.get("meta_description", row["meta_description"])
        if meta_description is None:
            meta_description = ""
        meta_description = str(meta_description).strip()
        excerpt = body.get("excerpt", row["excerpt"])
        if excerpt is None:
            excerpt = ""
        excerpt = str(excerpt).strip()
        body_html = body.get("body_html", row["body_html"])
        if body_html is None:
            body_html = ""
        body_html = str(body_html)
        og_image_url = body.get("og_image_url", row["og_image_url"])
        og_image_url = (str(og_image_url).strip() if og_image_url else "") or None
        author_name = body.get("author_name", row["author_name"])
        author_name = (str(author_name).strip() if author_name else "") or "Equilima"
        cluster_key = body.get("cluster_key", row["cluster_key"])
        cluster_key = str(cluster_key or "").strip()
        status = body.get("status", row["status"])
        status = str(status or "draft").strip().lower()
        if status not in ("draft", "published"):
            raise HTTPException(status_code=400, detail="status must be draft or published")
        published_at = row["published_at"]
        if "published_at" in body:
            published_at = (body["published_at"] or "").strip() or None
        if status == "published" and not published_at:
            published_at = _now_sqlite()
        if status == "draft":
            published_at = None
        now = _now_sqlite()
        try:
            conn.execute(
                """
                UPDATE articles SET
                    slug = ?, title = ?, meta_description = ?, excerpt = ?, body_html = ?,
                    og_image_url = ?, author_name = ?, cluster_key = ?, status = ?,
                    published_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    slug,
                    title,
                    meta_description,
                    excerpt,
                    body_html,
                    og_image_url,
                    author_name,
                    cluster_key,
                    status,
                    published_at,
                    now,
                    int(article_id),
                ),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="Slug already exists")
        return {"ok": True}
    finally:
        conn.close()


@admin_router.delete("/{article_id:int}")
def admin_delete_article(article_id: int, _ok: bool = Depends(verify_admin)):
    conn = get_db()
    try:
        conn.execute("DELETE FROM articles WHERE id = ?", (int(article_id),))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()

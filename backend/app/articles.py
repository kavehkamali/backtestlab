from __future__ import annotations
"""
SEO-oriented articles (learn hub). Public read; admin CRUD via Bearer token.
"""

import json
import os
import re
import sqlite3
import threading
import time
import xml.sax.saxutils as xml_esc
from datetime import datetime, timedelta, timezone
from html import escape as html_escape
from pathlib import Path
from typing import Any
try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from .analytics import get_db, verify_admin

PUBLIC_SITE_URL = (os.environ.get("EQUILIMA_PUBLIC_URL") or "https://equilima.com").rstrip("/")
AGENT_URL = os.getenv("EQUILIMA_AGENT_URL", "http://localhost:8888").rstrip("/")
DAILY_ARTICLE_TIMEZONE = os.getenv("EQUILIMA_DAILY_ARTICLE_TZ", "America/Toronto")
DAILY_ARTICLE_HOUR = int(os.getenv("EQUILIMA_DAILY_ARTICLE_HOUR", "7") or "7")
DAILY_ARTICLE_MIN_WORDS = int(os.getenv("EQUILIMA_DAILY_ARTICLE_MIN_WORDS", "2500") or "2500")

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

public_router = APIRouter(prefix="/api", tags=["articles"])
admin_router = APIRouter(prefix="/api/admin/articles", tags=["admin-articles"])

_LEARN_AI_DATA = Path(__file__).resolve().parent.parent / "data" / "learn_ai_agent_articles"
_LEARN_AI_SEED_ID = "learn_ai_agent_series_v1"
_LEARN_TOOL_HUBS_DATA = Path(__file__).resolve().parent.parent / "data" / "learn_tool_hubs"
_LEARN_TOOL_HUBS_SEED_ID = "equilima_learn_tool_hubs_v1"

DAILY_FIELDS = [
    {
        "key": "research",
        "cluster": "Equilima — Research",
        "label": "Research",
        "tickers": ["AAPL", "MSFT", "GOOGL", "NVDA", "JPM"],
        "image": "/learn/hubs/hero-03.jpg",
    },
    {
        "key": "macro",
        "cluster": "Equilima — Macro",
        "label": "Macro",
        "tickers": ["SPY", "QQQ", "TLT", "GLD", "USO", "FXI"],
        "image": "/learn/hubs/hero-02.jpg",
    },
    {
        "key": "crypto",
        "cluster": "Equilima — Crypto",
        "label": "Crypto",
        "tickers": ["BTC-USD", "ETH-USD", "COIN", "MSTR"],
        "image": "/learn/hubs/hero-06.jpg",
    },
    {
        "key": "screener",
        "cluster": "Equilima — Screener",
        "label": "Screener",
        "tickers": ["SPY", "IWM", "NVDA", "JPM", "XOM", "XLK"],
        "image": "/learn/hubs/hero-01.jpg",
    },
    {
        "key": "backtest",
        "cluster": "Equilima — Backtest",
        "label": "Backtest",
        "tickers": ["SPY", "QQQ", "IWM", "TLT", "GLD"],
        "image": "/learn/hubs/hero-04.jpg",
    },
    {
        "key": "markets",
        "cluster": "Equilima — Markets",
        "label": "Markets",
        "tickers": ["SPY", "QQQ", "DIA", "TLT", "GLD", "USO", "UUP"],
        "image": "/learn/hubs/hero-08.jpg",
    },
]


def _seed_learn_ai_agent_articles(conn: sqlite3.Connection) -> None:
    """
    One-time bundled import of the AI agent Learn series: insert any manifest slugs still missing,
    then mark seed complete. Admin edits/deletes persist; we never bulk re-import again (even if a
    slug was deleted). To force a full re-import, remove the row from eq_app_seeds for this seed_id.
    """
    manifest_path = _LEARN_AI_DATA / "manifest.json"
    if not manifest_path.is_file():
        return
    if conn.execute(
        "SELECT 1 FROM eq_app_seeds WHERE seed_id = ?", (_LEARN_AI_SEED_ID,)
    ).fetchone():
        return
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        return
    articles = manifest.get("articles")
    if not isinstance(articles, list):
        return
    # Staggered publish dates (UTC) — finalized April 2026 window
    base_time = datetime(2026, 4, 1, 14, 0, 0, tzinfo=timezone.utc)
    for i, row in enumerate(articles):
        if not isinstance(row, dict):
            continue
        slug = (row.get("slug") or "").strip().lower()
        title = (row.get("title") or "").strip()
        if not slug or not title:
            continue
        if conn.execute("SELECT 1 FROM articles WHERE slug = ?", (slug,)).fetchone():
            continue
        body_path = _LEARN_AI_DATA / f"{slug}.html"
        if not body_path.is_file():
            continue
        body_html = body_path.read_text(encoding="utf-8")
        meta_description = (row.get("meta_description") or "").strip()
        excerpt = (row.get("excerpt") or "").strip()
        cluster_key = (row.get("cluster_key") or "").strip()
        published_at = (base_time + timedelta(days=i)).strftime("%Y-%m-%d %H:%M:%S")
        now = published_at
        conn.execute(
            """
            INSERT INTO articles (
                slug, title, meta_description, excerpt, body_html, og_image_url,
                author_name, cluster_key, status, published_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)
            """,
            (
                slug,
                title,
                meta_description,
                excerpt,
                body_html,
                None,
                "Equilima Research",
                cluster_key,
                published_at,
                now,
            ),
        )
    applied = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        "INSERT OR REPLACE INTO eq_app_seeds (seed_id, applied_at) VALUES (?, ?)",
        (_LEARN_AI_SEED_ID, applied),
    )


def _seed_learn_tool_hubs(conn: sqlite3.Connection) -> None:
    """
    Sync Equilima topic hub articles from data/learn_tool_hubs (manifest + HTML).
    Upserts by slug so regenerated long-form content deploys on restart. Skips rows
    where slug exists but cluster_key is not an Equilima —* hub (avoids clobbering admin retargets).
    """
    manifest_path = _LEARN_TOOL_HUBS_DATA / "manifest.json"
    if not manifest_path.is_file():
        return
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        return
    articles = manifest.get("articles")
    if not isinstance(articles, list):
        return
    base_time = datetime(2026, 4, 20, 12, 0, 0, tzinfo=timezone.utc)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    for i, row in enumerate(articles):
        if not isinstance(row, dict):
            continue
        slug = (row.get("slug") or "").strip().lower()
        title = (row.get("title") or "").strip()
        if not slug or not title:
            continue
        body_path = _LEARN_TOOL_HUBS_DATA / f"{slug}.html"
        if not body_path.is_file():
            continue
        body_html = body_path.read_text(encoding="utf-8")
        meta_description = (row.get("meta_description") or "").strip()
        excerpt = (row.get("excerpt") or "").strip()
        cluster_key = (row.get("cluster_key") or "").strip()
        published_at = (base_time + timedelta(hours=i)).strftime("%Y-%m-%d %H:%M:%S")
        existing = conn.execute(
            "SELECT cluster_key FROM articles WHERE slug = ?", (slug,)
        ).fetchone()
        if existing:
            prev_ck = (existing[0] or "").strip()
            if prev_ck and not prev_ck.startswith("Equilima —"):
                continue
            conn.execute(
                """
                UPDATE articles SET
                    title = ?, meta_description = ?, excerpt = ?, body_html = ?,
                    cluster_key = ?, status = 'published', updated_at = ?
                WHERE slug = ?
                """,
                (title, meta_description, excerpt, body_html, cluster_key, now, slug),
            )
        else:
            conn.execute(
                """
                INSERT INTO articles (
                    slug, title, meta_description, excerpt, body_html, og_image_url,
                    author_name, cluster_key, status, published_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)
                """,
                (
                    slug,
                    title,
                    meta_description,
                    excerpt,
                    body_html,
                    None,
                    "Equilima Research",
                    cluster_key,
                    published_at,
                    now,
                ),
            )
    if not conn.execute(
        "SELECT 1 FROM eq_app_seeds WHERE seed_id = ?", (_LEARN_TOOL_HUBS_SEED_ID,)
    ).fetchone():
        conn.execute(
            "INSERT OR REPLACE INTO eq_app_seeds (seed_id, applied_at) VALUES (?, ?)",
            (_LEARN_TOOL_HUBS_SEED_ID, now),
        )


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

            CREATE TABLE IF NOT EXISTS eq_app_seeds (
                seed_id TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS article_generation_runs (
                run_date TEXT NOT NULL,
                field_key TEXT NOT NULL,
                article_id INTEGER,
                status TEXT NOT NULL DEFAULT 'pending',
                message TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY(run_date, field_key)
            );
            """
        )
        conn.commit()
        _seed_learn_ai_agent_articles(conn)
        _seed_learn_tool_hubs(conn)
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


def _slugify(value: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    s = re.sub(r"-+", "-", s)
    return s[:110].strip("-") or "article"


def _word_count_html(html: str) -> int:
    plain = re.sub(r"<[^>]+>", " ", html or "")
    plain = re.sub(r"&[a-z]+;|&#\d+;|&#x[0-9a-f]+;", " ", plain, flags=re.I)
    plain = re.sub(r"\s+", " ", plain).strip()
    return len(plain.split()) if plain else 0


def _today_local() -> datetime:
    if ZoneInfo:
        try:
            return datetime.now(ZoneInfo(DAILY_ARTICLE_TIMEZONE))
        except Exception:
            pass
    return datetime.now(timezone.utc)


def _article_market_context(field: dict[str, Any]) -> dict[str, Any]:
    context: dict[str, Any] = {"tickers": [], "headlines": [], "macro": []}
    try:
        import yfinance as yf
        for sym in field.get("tickers", [])[:8]:
            try:
                ticker = yf.Ticker(sym)
                hist = ticker.history(period="6mo", interval="1d")
                info = ticker.info or {}
                price = float(hist["Close"].iloc[-1]) if hist is not None and len(hist) else info.get("regularMarketPrice")
                prev = float(hist["Close"].iloc[-22]) if hist is not None and len(hist) > 22 else None
                change_1m = round((price / prev - 1) * 100, 2) if price and prev else None
                context["tickers"].append({
                    "symbol": sym,
                    "name": info.get("shortName") or info.get("longName") or sym,
                    "price": round(float(price), 2) if price else None,
                    "change_1m": change_1m,
                    "market_cap": info.get("marketCap"),
                    "forward_pe": info.get("forwardPE"),
                    "revenue_growth": info.get("revenueGrowth"),
                    "profit_margin": info.get("profitMargins"),
                    "recommendation": info.get("recommendationKey"),
                })
                for item in (ticker.news or [])[:3]:
                    content = item.get("content", {}) if isinstance(item, dict) else {}
                    title = content.get("title") or item.get("title")
                    url = content.get("canonicalUrl", {}).get("url") if isinstance(content.get("canonicalUrl"), dict) else item.get("link")
                    if title and title not in {h["title"] for h in context["headlines"]}:
                        context["headlines"].append({"symbol": sym, "title": title, "url": url or ""})
            except Exception:
                continue
    except Exception:
        pass
    try:
        import pandas as pd
        for label, series_id in [
            ("Fed Funds", "FEDFUNDS"),
            ("Unemployment", "UNRATE"),
            ("CPI", "CPIAUCSL"),
            ("10Y Treasury", "DGS10"),
            ("Job Openings", "JTSJOL"),
        ]:
            try:
                df = pd.read_csv(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}")
                date_col = "DATE" if "DATE" in df.columns else "observation_date"
                df[series_id] = pd.to_numeric(df[series_id], errors="coerce")
                df = df.dropna()
                if not df.empty:
                    context["macro"].append({"label": label, "latest": round(float(df[series_id].iloc[-1]), 3), "date": str(df[date_col].iloc[-1])[:10]})
            except Exception:
                continue
    except Exception:
        pass
    return context


def _daily_article_fallback_body(field: dict[str, Any], title: str, context: dict[str, Any], today: str) -> str:
    image = field.get("image") or "/learn/hubs/hero-01.jpg"
    headlines = context.get("headlines", [])[:8]
    tickers = context.get("tickers", [])[:8]
    macro = context.get("macro", [])[:8]
    lead_ticker = tickers[0] if tickers else {}
    lead_symbol = lead_ticker.get("symbol") or field.get("tickers", ["the market"])[0]
    lead_change = lead_ticker.get("change_1m")
    lead_price = lead_ticker.get("price")
    headline_items = "".join(
        f"<li><strong>{html_escape(h.get('symbol') or '')}</strong>: {html_escape(h.get('title') or '')}</li>"
        for h in headlines
    ) or "<li>The tape is quiet enough that price, rates, and fundamentals deserve more attention than headlines.</li>"
    ticker_items = "".join(
        f"<li><strong>{html_escape(t.get('symbol') or '')}</strong>: price {html_escape(str(t.get('price') or 'n/a'))}, 1M {html_escape(str(t.get('change_1m') or 'n/a'))}%, forward P/E {html_escape(str(t.get('forward_pe') or 'n/a'))}, margin {html_escape(str(t.get('profit_margin') or 'n/a'))}.</li>"
        for t in tickers
    ) or "<li>The clean read starts with the index tape, then moves into fundamentals and risk appetite.</li>"
    macro_items = "".join(
        f"<li><strong>{html_escape(m.get('label') or '')}</strong>: {html_escape(str(m.get('latest') or 'n/a'))} as of {html_escape(m.get('date') or '')}</li>"
        for m in macro
    ) or "<li>Rates, inflation, labor, and liquidity still set the background temperature for risk assets.</li>"
    field_label = field.get("label", "Markets")
    base = f"""
<figure class="eq-figure my-10">
  <img class="eq-figure-img w-full rounded-lg shadow-md" src="{html_escape(image)}" alt="{html_escape(title)}" loading="lazy" decoding="async" />
  <figcaption class="eq-caption mt-2 text-sm text-neutral-500">Free finance image from the bundled Equilima Unsplash image set.</figcaption>
</figure>
<div class="eq-takeaways rounded-2xl p-6 sm:p-7 mb-10">
  <p class="eq-kicker text-xs font-semibold uppercase tracking-wider text-violet-800 mb-1">{html_escape(field.get('cluster') or '')}</p>
  <h2 class="eq-h2">The Setup Before The Bell</h2>
  <ul class="eq-ul list-disc pl-5 space-y-3">
    <li class="eq-li">The first move is to separate real signal from noisy price action.</li>
    <li class="eq-li">The second move is to ask which fundamentals actually changed.</li>
    <li class="eq-li">The final move is to decide what would invalidate the story.</li>
  </ul>
</div>
<h2 class="eq-h2">The Morning Scene</h2>
<p class="eq-p">The screen does not open with a thesis. It opens with pressure. {html_escape(str(lead_symbol))} sits near {html_escape(str(lead_price or 'its latest print'))}{f', after a one-month move of {html_escape(str(lead_change))}%' if lead_change is not None else ''}, and that single line already asks the question every serious reader has to answer: is this strength, exhaustion, or just a crowded trade looking for a reason to keep moving?</p>
<p class="eq-p">You do not need a dramatic forecast to read the morning well. You need a clean sequence. First, see where money is flowing. Then test whether earnings power, balance-sheet quality, valuation, and macro conditions support that flow. If the story is good but the numbers are not, be patient. If the numbers are strong but the tape is breaking, respect the market&apos;s warning.</p>
<ul class="eq-ul list-disc pl-6 mb-6">{ticker_items}</ul>
<h2 class="eq-h2">The Macro Weather</h2>
<p class="eq-p">Rates are the weather system above the whole market. They decide how much investors pay for distant growth, how forgiving they are toward leverage, and how quickly they rotate when a company misses. A business can sound healthy and still trade poorly when the macro backdrop raises the cost of waiting.</p>
<ul class="eq-ul list-disc pl-6 mb-6">{macro_items}</ul>
<h2 class="eq-h2">What The Headlines Are Really Asking</h2>
<p class="eq-p">A headline is rarely the answer. It is usually the first clue. The useful question is whether the headline changes revenue, margins, capital costs, regulation, liquidity, or investor positioning. If it changes none of those, it may still move price for a few hours, but it has not earned a place in the thesis.</p>
<ul class="eq-ul list-disc pl-6 mb-6">{headline_items}</ul>
"""
    sections = [
        ("The Fundamentals Under The Story", "Price can make a weak story look persuasive for a while, but fundamentals decide whether the story can survive the next earnings call. Revenue growth, gross margin, operating leverage, debt load, and free cash flow are the places where excitement becomes evidence or falls apart."),
        ("The Tape Beneath The Headline", "A chart is not a prophecy. It is a record of what buyers and sellers have already accepted. When price rises on broad participation and holds above prior resistance, the market is giving the story room. When price jumps and fades, the market is telling you the story still has doubters."),
        ("The Macro Pressure Point", "Every field has a macro pressure point. Growth needs liquidity. Banks need credit quality and a usable curve. Energy needs demand. Crypto needs risk appetite. Real estate needs financing relief. The right question is not whether macro matters, but which macro variable matters first."),
        ("The Practical Move", "A good reader does not chase every green candle or flee every red one. The practical move is to build a watchlist, define the trigger, define the invalidation point, and wait for the market to confirm or reject the setup. That discipline matters more than sounding early."),
        ("The Risk That Would Change The Story", "Every strong market story has a fracture line. It may be a rate shock, a margin miss, an earnings revision, a regulatory surprise, a failed breakout, or a liquidity squeeze. If you cannot name the fracture line, the thesis is not finished."),
    ]
    paragraphs = []
    for idx in range(80):
        head, seed = sections[idx % len(sections)]
        if idx % 8 == 0:
            paragraphs.append(f"<h2 class=\"eq-h2\">{html_escape(head)}</h2>")
        paragraphs.append(
            "<p class=\"eq-p\">"
            + html_escape(
                f"{seed} On {today}, the {field_label} read is strongest when you treat each data point as part of a scene rather than a verdict. Look at what moved, ask who benefits, test the numbers, then decide what would prove the market wrong. The goal is not to predict every tick. The goal is to avoid being pulled into a story before the evidence is strong enough to deserve your attention."
            )
            + "</p>"
        )
        if _word_count_html(base + "\n".join(paragraphs)) >= DAILY_ARTICLE_MIN_WORDS:
            break
    return base + "\n".join(paragraphs)


def _call_agent_article(field: dict[str, Any], title: str, context: dict[str, Any], today: str) -> str:
    if os.getenv("EQUILIMA_DAILY_ARTICLE_USE_AGENT", "1") == "0":
        return ""
    prompt = (
        f"Write a long-form Equilima Learn article for the {field['label']} field with an eye-catching storytelling style. "
        f"Title: {title}. Today: {today}. Minimum {DAILY_ARTICLE_MIN_WORDS} words. "
        "Speak directly to the reader as if they are looking at the market with you. Do not explain what you are doing. "
        "Never write phrases like 'this article', 'this note', 'I did the research', 'generated', 'data pull', or 'what this article is about'. "
        "Open with a vivid market scene, then move into practical analysis using current macro, news, and fundamentals from the JSON. "
        "Be specific, concise, and practical, with strong section headings and clear takeaways. "
        "Return clean HTML only using h2, h3, p, ul, li, strong. No markdown fences. "
        "Do not give personalized financial advice. Do not invent unsupported facts. "
        f"Context JSON: {json.dumps(context, default=str)[:14000]}"
    )
    try:
        import httpx
        with httpx.Client(timeout=600.0) as client:
            resp = client.post(f"{AGENT_URL}/quick", json={"message": prompt, "ticker": "", "history": []})
            if resp.is_success:
                data = resp.json()
                text = str(data.get("response") or data.get("message") or data.get("content") or "").strip()
                text = re.sub(r"^```(?:html)?|```$", "", text, flags=re.I | re.M).strip()
                if _word_count_html(text) >= 900:
                    return text
    except Exception as e:
        print(f"[articles] agent article generation failed for {field.get('key')}: {e}")
    return ""


def _upsert_daily_article(field: dict[str, Any], run_date: str) -> int:
    slug = _validate_slug(_slugify(f"{field['key']} morning market brief {run_date}"))
    title = f"{field['label']} Morning Brief: Macro, News, Fundamentals, And Market Setup ({run_date})"
    meta = f"Daily {field['label']} Learn article using current macro data, recent market headlines, and fundamental checks for {run_date}."
    context = _article_market_context(field)
    body = _call_agent_article(field, title, context, run_date)
    fallback = _daily_article_fallback_body(field, title, context, run_date)
    body_html = (
        f"""
<figure class="eq-figure my-10">
  <img class="eq-figure-img w-full rounded-lg shadow-md" src="{html_escape(field.get('image') or '/learn/hubs/hero-01.jpg')}" alt="{html_escape(title)}" loading="lazy" decoding="async" />
  <figcaption class="eq-caption mt-2 text-sm text-neutral-500">Free finance image from the bundled Equilima Unsplash image set.</figcaption>
</figure>
"""
        + body
        if body
        else fallback
    )
    if _word_count_html(body_html) < DAILY_ARTICLE_MIN_WORDS:
        body_html += fallback
    now = _now_sqlite()
    conn = get_db()
    try:
        existing = conn.execute("SELECT id FROM articles WHERE slug = ?", (slug,)).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE articles SET title = ?, meta_description = ?, excerpt = ?, body_html = ?,
                    og_image_url = ?, author_name = ?, cluster_key = ?, status = 'published',
                    published_at = COALESCE(published_at, ?), updated_at = ?
                WHERE slug = ?
                """,
                (
                    title,
                    meta,
                    meta,
                    body_html,
                    field.get("image"),
                    "Equilima Research",
                    field["cluster"],
                    now,
                    now,
                    slug,
                ),
            )
            article_id = int(existing["id"])
        else:
            conn.execute(
                """
                INSERT INTO articles (
                    slug, title, meta_description, excerpt, body_html, og_image_url,
                    author_name, cluster_key, status, published_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'Equilima Research', ?, 'published', ?, ?)
                """,
                (slug, title, meta, meta, body_html, field.get("image"), field["cluster"], now, now),
            )
            article_id = int(conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"])
        conn.execute(
            """
            INSERT OR REPLACE INTO article_generation_runs
                (run_date, field_key, article_id, status, message, updated_at)
            VALUES (?, ?, ?, 'ok', ?, datetime('now'))
            """,
            (run_date, field["key"], article_id, f"{_word_count_html(body_html)} words"),
        )
        conn.commit()
        return article_id
    finally:
        conn.close()


def generate_daily_learn_articles(force: bool = False) -> dict[str, Any]:
    local_now = _today_local()
    if not force and (local_now.hour, local_now.minute) < (DAILY_ARTICLE_HOUR, 0):
        return {"ok": True, "skipped": "before_schedule", "time": local_now.isoformat()}
    run_date = local_now.strftime("%Y-%m-%d")
    result = {"ok": True, "date": run_date, "generated": [], "skipped": []}
    for field in DAILY_FIELDS:
        conn = get_db()
        try:
            row = conn.execute(
                "SELECT status, article_id FROM article_generation_runs WHERE run_date = ? AND field_key = ?",
                (run_date, field["key"]),
            ).fetchone()
            if row and row["status"] == "ok" and not force:
                result["skipped"].append(field["key"])
                continue
            conn.execute(
                """
                INSERT OR REPLACE INTO article_generation_runs
                    (run_date, field_key, article_id, status, message, updated_at)
                VALUES (?, ?, COALESCE((SELECT article_id FROM article_generation_runs WHERE run_date = ? AND field_key = ?), NULL), 'running', '', datetime('now'))
                """,
                (run_date, field["key"], run_date, field["key"]),
            )
            conn.commit()
        finally:
            conn.close()
        try:
            article_id = _upsert_daily_article(field, run_date)
            result["generated"].append({"field": field["key"], "article_id": article_id})
        except Exception as e:
            conn = get_db()
            try:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO article_generation_runs
                        (run_date, field_key, article_id, status, message, updated_at)
                    VALUES (?, ?, NULL, 'error', ?, datetime('now'))
                    """,
                    (run_date, field["key"], str(e)[:500]),
                )
                conn.commit()
            finally:
                conn.close()
            result.setdefault("errors", []).append({"field": field["key"], "error": str(e)})
    return result


def _daily_article_scheduler_loop():
    time.sleep(45)
    while True:
        try:
            generate_daily_learn_articles(force=False)
        except Exception as e:
            print(f"[articles] daily scheduler failed: {e}")
        time.sleep(60 * 60)


def start_daily_article_scheduler():
    if os.getenv("EQUILIMA_DISABLE_DAILY_ARTICLES", "0") == "1":
        return
    if getattr(start_daily_article_scheduler, "_started", False):
        return
    start_daily_article_scheduler._started = True
    t = threading.Thread(target=_daily_article_scheduler_loop, name="daily-learn-articles", daemon=True)
    t.start()


start_daily_article_scheduler()


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


@admin_router.post("/generate-daily")
def admin_generate_daily_articles(force: bool = False, _ok: bool = Depends(verify_admin)):
    """Generate today's Learn articles directly into the backend database."""
    return generate_daily_learn_articles(force=bool(force))

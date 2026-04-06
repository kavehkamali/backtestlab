from __future__ import annotations
"""
Visitor analytics: tracks page views, unique visitors, sessions, locations.
Stores in SQLite. Admin-only access.
"""

import sqlite3
import json
import os
import ipaddress
from datetime import datetime, timedelta
from pathlib import Path
from collections import Counter

from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

DB_PATH = Path.home() / ".equilima_data" / "equilima.db"

# Admin credentials (hashed in production, simple check for now)
ADMIN_USER = os.environ.get("EQUILIMA_ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("EQUILIMA_ADMIN_PASS", "changeme")

router = APIRouter(prefix="/api/admin", tags=["admin"])
security = HTTPBearer(auto_error=False)


def _get_cache_stats():
    try:
        from .shared_cache import cache_stats
        return cache_stats()
    except Exception:
        return []


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_analytics_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS page_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            path TEXT NOT NULL,
            tab TEXT,
            user_agent TEXT,
            referer TEXT,
            country TEXT,
            city TEXT,
            timestamp TEXT DEFAULT (datetime('now')),
            session_id TEXT,
            user_id INTEGER
        );

        CREATE TABLE IF NOT EXISTS admin_sessions (
            token TEXT PRIMARY KEY,
            created_at TEXT DEFAULT (datetime('now')),
            expires_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_pv_timestamp ON page_views(timestamp);
        CREATE INDEX IF NOT EXISTS idx_pv_ip ON page_views(ip);
        CREATE INDEX IF NOT EXISTS idx_pv_path ON page_views(path);

        CREATE TABLE IF NOT EXISTS analytics_excluded_ips (
            ip TEXT PRIMARY KEY
        );
    """)
    conn.commit()
    conn.close()


init_analytics_db()


def _normalize_ip(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        raise ValueError("empty IP")
    return str(ipaddress.ip_address(s))


def _normalize_ip_loose(s: str | None) -> str | None:
    """Canonical IP string, or None if empty, or stripped raw if not parseable."""
    if s is None:
        return None
    t = str(s).strip()
    if not t:
        return None
    try:
        return str(ipaddress.ip_address(t))
    except ValueError:
        return t


def _load_excluded_ips(conn: sqlite3.Connection) -> list[str]:
    return [r["ip"] for r in conn.execute("SELECT ip FROM analytics_excluded_ips ORDER BY ip").fetchall()]


def _resolve_excluded_ip_literals(conn: sqlite3.Connection, excluded: list[str]) -> list[str]:
    """
    Every distinct `page_views.ip` value that represents an ignored address (same
    canonical form as an entry in `excluded`). Ensures charts match legacy rows
    even if the DB string differs from the normalized ignore list.
    """
    if not excluded:
        return []
    norm_targets: set[str] = set()
    for x in excluded:
        n = _normalize_ip_loose(x)
        if n:
            norm_targets.add(n)
    if not norm_targets:
        return []
    literals: set[str] = set(excluded)
    for row in conn.execute("SELECT DISTINCT ip FROM page_views"):
        raw = row["ip"]
        n = _normalize_ip_loose(raw)
        if n and n in norm_targets:
            literals.add(raw)
    return sorted(literals)


def _sql_ip_not_in(literals: list[str]) -> tuple[str, tuple]:
    if not literals:
        return "", ()
    ph = ",".join("?" * len(literals))
    return f" AND ip NOT IN ({ph})", tuple(literals)


def _client_ip_for_storage(raw: str | None) -> str:
    """Store canonical IP when possible so filters and ignores stay consistent."""
    if raw is None:
        return ""
    n = _normalize_ip_loose(raw)
    return n if n else str(raw).strip()


def _track_ip_is_excluded(conn: sqlite3.Connection, client_ip: str) -> bool:
    """True if this request should not be tracked (matches any ignored address)."""
    raw = client_ip.strip()
    canon = _normalize_ip_loose(client_ip)
    rows = conn.execute("SELECT ip FROM analytics_excluded_ips").fetchall()
    for r in rows:
        e = r["ip"]
        if e == raw or (canon and e == canon):
            return True
        en = _normalize_ip_loose(e)
        if canon and en and en == canon:
            return True
    return False


# ─── Admin auth ───
import secrets
from jose import jwt

ADMIN_SECRET = secrets.token_hex(32)


def create_admin_token():
    exp = datetime.utcnow() + timedelta(hours=24)
    return jwt.encode({"role": "admin", "exp": exp}, ADMIN_SECRET, algorithm="HS256")


def verify_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Admin login required")
    try:
        payload = jwt.decode(credentials.credentials, ADMIN_SECRET, algorithms=["HS256"])
        if payload.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Not admin")
        return True
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired admin token")


# ─── Tracking endpoint (called by frontend) ───
@router.post("/track")
async def track_pageview(request: Request):
    """Track a page view. Called by frontend on each navigation."""
    try:
        body = await request.json()
    except Exception:
        body = {}

    ip = request.client.host or ""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    ip = _client_ip_for_storage(ip)

    path = body.get("path", "/")
    tab = body.get("tab", "")
    session_id = body.get("session_id", "")
    user_id = body.get("user_id")

    ua = request.headers.get("user-agent", "")
    referer = request.headers.get("referer", "")

    conn = get_db()
    try:
        if _track_ip_is_excluded(conn, ip):
            return {"ok": True}
    finally:
        conn.close()

    # Simple IP geolocation (free, no API key)
    country = ""
    city = ""
    try:
        import urllib.request
        geo_url = f"http://ip-api.com/json/{ip}?fields=country,city"
        with urllib.request.urlopen(geo_url, timeout=2) as resp:
            geo = json.loads(resp.read())
            country = geo.get("country", "")
            city = geo.get("city", "")
    except Exception:
        pass

    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO page_views (ip, path, tab, user_agent, referer, country, city, session_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (ip, path, tab, ua, referer, country, city, session_id, user_id),
        )
        conn.commit()
    finally:
        conn.close()

    return {"ok": True}


# ─── Excluded IPs (admin — omit from analytics) ───
@router.get("/excluded-ips")
def get_excluded_ips(_admin=Depends(verify_admin)):
    conn = get_db()
    try:
        return {"ips": _load_excluded_ips(conn)}
    finally:
        conn.close()


@router.put("/excluded-ips")
async def put_excluded_ips(request: Request, _admin=Depends(verify_admin)):
    body = await request.json()
    ips = body.get("ips")
    if not isinstance(ips, list):
        raise HTTPException(status_code=400, detail="ips must be a JSON array of strings")
    normalized: list[str] = []
    for raw in ips:
        try:
            normalized.append(_normalize_ip(str(raw)))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid IP address: {raw!r}")
    seen: set[str] = set()
    uniq = []
    for x in normalized:
        if x not in seen:
            seen.add(x)
            uniq.append(x)
    conn = get_db()
    try:
        conn.execute("DELETE FROM analytics_excluded_ips")
        for x in uniq:
            conn.execute("INSERT INTO analytics_excluded_ips (ip) VALUES (?)", (x,))
        conn.commit()
        return {"ok": True, "ips": uniq}
    finally:
        conn.close()


# ─── Admin login ───
@router.post("/login")
async def admin_login(request: Request):
    body = await request.json()
    if body.get("username") == ADMIN_USER and body.get("password") == ADMIN_PASS:
        token = create_admin_token()
        return {"token": token}
    raise HTTPException(status_code=401, detail="Invalid credentials")


# ─── Analytics dashboard data ───
@router.get("/stats")
def get_stats(days: int = 30, _admin=Depends(verify_admin)):
    """Full analytics dashboard data."""
    conn = get_db()
    try:
        since = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
        excluded = _load_excluded_ips(conn)
        excluded_literals = _resolve_excluded_ip_literals(conn, excluded)
        ni_sql, ni_args = _sql_ip_not_in(excluded_literals)
        sp = (since,) + ni_args

        # Total views
        total = conn.execute(
            f"SELECT COUNT(*) as c FROM page_views WHERE timestamp >= ?{ni_sql}", sp,
        ).fetchone()["c"]

        # Unique IPs
        unique_ips = conn.execute(
            f"SELECT COUNT(DISTINCT ip) as c FROM page_views WHERE timestamp >= ?{ni_sql}", sp,
        ).fetchone()["c"]

        # Unique sessions
        unique_sessions = conn.execute(
            f"SELECT COUNT(DISTINCT session_id) as c FROM page_views WHERE timestamp >= ? AND session_id != ''{ni_sql}", sp,
        ).fetchone()["c"]

        # Views per day
        daily = conn.execute(f"""
            SELECT DATE(timestamp) as day, COUNT(*) as views, COUNT(DISTINCT ip) as visitors
            FROM page_views WHERE timestamp >= ?{ni_sql}
            GROUP BY DATE(timestamp) ORDER BY day
        """, sp).fetchall()
        daily_data = [{"date": r["day"], "views": r["views"], "visitors": r["visitors"]} for r in daily]

        # Views per hour (last 24h)
        hourly = conn.execute(f"""
            SELECT strftime('%H', timestamp) as hour, COUNT(*) as views
            FROM page_views WHERE timestamp >= datetime('now', '-1 day'){ni_sql}
            GROUP BY hour ORDER BY hour
        """, ni_args).fetchall()
        hourly_data = [{"hour": f"{r['hour']}:00", "views": r["views"]} for r in hourly]

        # Top pages/tabs
        top_tabs = conn.execute(f"""
            SELECT tab, COUNT(*) as views FROM page_views
            WHERE timestamp >= ? AND tab != ''{ni_sql} GROUP BY tab ORDER BY views DESC LIMIT 10
        """, sp).fetchall()
        top_tabs_data = [{"tab": r["tab"], "views": r["views"]} for r in top_tabs]

        # Top countries
        top_countries = conn.execute(f"""
            SELECT country, COUNT(*) as views, COUNT(DISTINCT ip) as visitors
            FROM page_views WHERE timestamp >= ? AND country != ''{ni_sql}
            GROUP BY country ORDER BY views DESC LIMIT 20
        """, sp).fetchall()
        top_countries_data = [{"country": r["country"], "views": r["views"], "visitors": r["visitors"]} for r in top_countries]

        # Top cities
        top_cities = conn.execute(f"""
            SELECT city, country, COUNT(*) as views, COUNT(DISTINCT ip) as visitors
            FROM page_views WHERE timestamp >= ? AND city != ''{ni_sql}
            GROUP BY city, country ORDER BY views DESC LIMIT 20
        """, sp).fetchall()
        top_cities_data = [{"city": r["city"], "country": r["country"], "views": r["views"], "visitors": r["visitors"]} for r in top_cities]

        # Top referrers
        top_referrers = conn.execute(f"""
            SELECT referer, COUNT(*) as views FROM page_views
            WHERE timestamp >= ? AND referer != ''{ni_sql} GROUP BY referer ORDER BY views DESC LIMIT 10
        """, sp).fetchall()
        top_referrers_data = [{"referer": r["referer"], "views": r["views"]} for r in top_referrers]

        # Device types (from user agent)
        all_ua = conn.execute(
            f"SELECT user_agent FROM page_views WHERE timestamp >= ?{ni_sql}", sp,
        ).fetchall()
        devices = {"Mobile": 0, "Tablet": 0, "Desktop": 0}
        browsers = Counter()
        for row in all_ua:
            ua = (row["user_agent"] or "").lower()
            if "mobile" in ua or "android" in ua or "iphone" in ua:
                devices["Mobile"] += 1
            elif "tablet" in ua or "ipad" in ua:
                devices["Tablet"] += 1
            else:
                devices["Desktop"] += 1
            if "chrome" in ua and "edg" not in ua:
                browsers["Chrome"] += 1
            elif "firefox" in ua:
                browsers["Firefox"] += 1
            elif "safari" in ua and "chrome" not in ua:
                browsers["Safari"] += 1
            elif "edg" in ua:
                browsers["Edge"] += 1
            else:
                browsers["Other"] += 1

        # Recent visitors (last 50)
        recent = conn.execute(f"""
            SELECT ip, path, tab, country, city, user_agent, timestamp, user_id
            FROM page_views WHERE 1=1{ni_sql}
            ORDER BY timestamp DESC LIMIT 50
        """, ni_args).fetchall()
        recent_data = [{
            "ip": r["ip"], "path": r["path"], "tab": r["tab"],
            "country": r["country"], "city": r["city"],
            "timestamp": r["timestamp"], "user_id": r["user_id"],
            "device": "Mobile" if any(m in (r["user_agent"] or "").lower() for m in ["mobile", "iphone", "android"]) else "Desktop",
        } for r in recent]

        # Registered users
        users_count = conn.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
        users_today = conn.execute("SELECT COUNT(*) as c FROM users WHERE DATE(created_at) = DATE('now')").fetchone()["c"]
        users_list = conn.execute("""
            SELECT id, email, name, created_at, last_login, consent_policy, consent_newsletter, is_active
            FROM users ORDER BY created_at DESC
        """).fetchall()
        users_data = [{
            "id": r["id"], "email": r["email"], "name": r["name"],
            "created_at": r["created_at"], "last_login": r["last_login"],
            "newsletter": bool(r["consent_newsletter"]), "active": bool(r["is_active"]),
        } for r in users_list]

        # Today's stats
        today_views = conn.execute(
            f"SELECT COUNT(*) as c FROM page_views WHERE DATE(timestamp) = DATE('now'){ni_sql}", ni_args,
        ).fetchone()["c"]
        today_visitors = conn.execute(
            f"SELECT COUNT(DISTINCT ip) as c FROM page_views WHERE DATE(timestamp) = DATE('now'){ni_sql}", ni_args,
        ).fetchone()["c"]

        return {
            "period_days": days,
            "ignored_ips": excluded,
            "summary": {
                "total_views": total,
                "unique_visitors": unique_ips,
                "unique_sessions": unique_sessions,
                "registered_users": users_count,
                "today_views": today_views,
                "today_visitors": today_visitors,
                "new_users_today": users_today,
            },
            "daily": daily_data,
            "hourly": hourly_data,
            "top_tabs": top_tabs_data,
            "top_countries": top_countries_data,
            "top_cities": top_cities_data,
            "top_referrers": top_referrers_data,
            "devices": [{"name": k, "value": v} for k, v in devices.items()],
            "browsers": [{"name": k, "value": v} for k, v in browsers.most_common(5)],
            "recent_visitors": recent_data,
            "users": users_data,
            "cache_stats": _get_cache_stats(),
        }
    finally:
        conn.close()

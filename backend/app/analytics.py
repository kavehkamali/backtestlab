from __future__ import annotations
"""
Visitor analytics: tracks page views, unique visitors, sessions, locations.
Stores in SQLite. Admin-only access.
"""

import sqlite3
import time
import json
import os
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
    """)
    conn.commit()
    conn.close()


init_analytics_db()


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

    ip = request.client.host
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()

    path = body.get("path", "/")
    tab = body.get("tab", "")
    session_id = body.get("session_id", "")
    user_id = body.get("user_id")

    ua = request.headers.get("user-agent", "")
    referer = request.headers.get("referer", "")

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

        # Total views
        total = conn.execute("SELECT COUNT(*) as c FROM page_views WHERE timestamp >= ?", (since,)).fetchone()["c"]

        # Unique IPs
        unique_ips = conn.execute("SELECT COUNT(DISTINCT ip) as c FROM page_views WHERE timestamp >= ?", (since,)).fetchone()["c"]

        # Unique sessions
        unique_sessions = conn.execute("SELECT COUNT(DISTINCT session_id) as c FROM page_views WHERE timestamp >= ? AND session_id != ''", (since,)).fetchone()["c"]

        # Views per day
        daily = conn.execute("""
            SELECT DATE(timestamp) as day, COUNT(*) as views, COUNT(DISTINCT ip) as visitors
            FROM page_views WHERE timestamp >= ?
            GROUP BY DATE(timestamp) ORDER BY day
        """, (since,)).fetchall()
        daily_data = [{"date": r["day"], "views": r["views"], "visitors": r["visitors"]} for r in daily]

        # Views per hour (last 24h)
        hourly = conn.execute("""
            SELECT strftime('%H', timestamp) as hour, COUNT(*) as views
            FROM page_views WHERE timestamp >= datetime('now', '-1 day')
            GROUP BY hour ORDER BY hour
        """).fetchall()
        hourly_data = [{"hour": f"{r['hour']}:00", "views": r["views"]} for r in hourly]

        # Top pages/tabs
        top_tabs = conn.execute("""
            SELECT tab, COUNT(*) as views FROM page_views
            WHERE timestamp >= ? AND tab != '' GROUP BY tab ORDER BY views DESC LIMIT 10
        """, (since,)).fetchall()
        top_tabs_data = [{"tab": r["tab"], "views": r["views"]} for r in top_tabs]

        # Top countries
        top_countries = conn.execute("""
            SELECT country, COUNT(*) as views, COUNT(DISTINCT ip) as visitors
            FROM page_views WHERE timestamp >= ? AND country != ''
            GROUP BY country ORDER BY views DESC LIMIT 20
        """, (since,)).fetchall()
        top_countries_data = [{"country": r["country"], "views": r["views"], "visitors": r["visitors"]} for r in top_countries]

        # Top cities
        top_cities = conn.execute("""
            SELECT city, country, COUNT(*) as views, COUNT(DISTINCT ip) as visitors
            FROM page_views WHERE timestamp >= ? AND city != ''
            GROUP BY city, country ORDER BY views DESC LIMIT 20
        """, (since,)).fetchall()
        top_cities_data = [{"city": r["city"], "country": r["country"], "views": r["views"], "visitors": r["visitors"]} for r in top_cities]

        # Top referrers
        top_referrers = conn.execute("""
            SELECT referer, COUNT(*) as views FROM page_views
            WHERE timestamp >= ? AND referer != '' GROUP BY referer ORDER BY views DESC LIMIT 10
        """, (since,)).fetchall()
        top_referrers_data = [{"referer": r["referer"], "views": r["views"]} for r in top_referrers]

        # Device types (from user agent)
        all_ua = conn.execute("SELECT user_agent FROM page_views WHERE timestamp >= ?", (since,)).fetchall()
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
        recent = conn.execute("""
            SELECT ip, path, tab, country, city, user_agent, timestamp, user_id
            FROM page_views ORDER BY timestamp DESC LIMIT 50
        """).fetchall()
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
        today_views = conn.execute("SELECT COUNT(*) as c FROM page_views WHERE DATE(timestamp) = DATE('now')").fetchone()["c"]
        today_visitors = conn.execute("SELECT COUNT(DISTINCT ip) as c FROM page_views WHERE DATE(timestamp) = DATE('now')").fetchone()["c"]

        return {
            "period_days": days,
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
        }
    finally:
        conn.close()

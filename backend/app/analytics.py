from __future__ import annotations
"""
Visitor analytics: tracks page views, unique visitors, sessions, locations.
Stores in SQLite. Admin-only access.
"""

import sqlite3
import json
import html as html_module
import os
import re
import ipaddress
from datetime import datetime, timedelta, time, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from collections import Counter, defaultdict

from fastapi import APIRouter, HTTPException, Request, Depends, Response
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

        CREATE TABLE IF NOT EXISTS newsletter_send_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sent_at TEXT DEFAULT (datetime('now')),
            kind TEXT NOT NULL,
            subject TEXT NOT NULL,
            audience TEXT NOT NULL,
            recipient_count INTEGER NOT NULL,
            ok_count INTEGER NOT NULL,
            fail_count INTEGER NOT NULL,
            failed_emails TEXT
        );
    """)
    conn.commit()
    conn.close()


init_analytics_db()


# IPv4 "a.b.c.*" → same /24 as a.b.c.0/24
_IPV4_LAST_OCTET_WILDCARD = re.compile(r"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\*$")


def _is_network_exclusion(s: str) -> bool:
    t = (s or "").strip()
    if _IPV4_LAST_OCTET_WILDCARD.fullmatch(t):
        return True
    if "/" in t:
        try:
            ipaddress.ip_network(t, strict=False)
            return True
        except ValueError:
            return False
    return False


def _parse_exclude_entry(raw: str) -> str:
    """Normalize admin input: single IP, IPv4/IPv6 CIDR, or IPv4 a.b.c.* → canonical stored string."""
    s = (raw or "").strip()
    if not s:
        raise ValueError("empty")
    m = _IPV4_LAST_OCTET_WILDCARD.fullmatch(s)
    if m:
        a, b, c = m.group(1), m.group(2), m.group(3)
        return str(ipaddress.ip_network(f"{a}.{b}.{c}.0/24", strict=False))
    if "/" in s:
        return str(ipaddress.ip_network(s, strict=False))
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


def _canonical_ip_for_compare(s: str | None) -> str | None:
    """
    Comparable form across IPv4 and IPv4-mapped IPv6 (::ffff:x.x.x.d vs x.x.x.d).
    """
    if s is None:
        return None
    t = str(s).strip()
    if not t:
        return None
    try:
        a = ipaddress.ip_address(t)
        if isinstance(a, ipaddress.IPv6Address) and a.ipv4_mapped is not None:
            return str(a.ipv4_mapped)
        return str(a)
    except ValueError:
        return None


def _load_excluded_ips(conn: sqlite3.Connection) -> list[str]:
    return [r["ip"] for r in conn.execute("SELECT ip FROM analytics_excluded_ips ORDER BY ip").fetchall()]


def _resolve_excluded_ip_literals(conn: sqlite3.Connection, excluded: list[str]) -> list[str]:
    """
    Every distinct `page_views.ip` value that represents an ignored host (same
    canonical form). Pass only single-host rules — CIDR / * rows are handled via
    network checks in _make_ip_excluder.
    """
    if not excluded:
        return []
    literals: set[str] = {str(x).strip() for x in excluded if x and str(x).strip()}
    norm_targets: set[str] = set()
    for x in excluded:
        if _is_network_exclusion(str(x)):
            continue
        c = _canonical_ip_for_compare(str(x))
        if c:
            norm_targets.add(c)
    if not norm_targets:
        return sorted(literals)
    for row in conn.execute("SELECT DISTINCT ip FROM page_views"):
        raw = row["ip"]
        c = _canonical_ip_for_compare(raw)
        if c and c in norm_targets:
            literals.add(raw)
    return sorted(literals)


def _make_ip_excluder(excluded: list[str], literals: list[str]):
    """
    Single hosts: exact string, canonical match, IPv4-mapped IPv6 equivalence.
    Networks: CIDR and a.b.c.* (stored as /24).
    """
    literal_set: set[str] = set()
    canon_hosts: set[str] = set()
    networks: list[ipaddress._BaseNetwork] = []
    for x in excluded:
        t = str(x).strip()
        if not t:
            continue
        if _is_network_exclusion(t):
            try:
                networks.append(ipaddress.ip_network(_parse_exclude_entry(t), strict=False))
            except ValueError:
                pass
            literal_set.add(t)
            continue
        literal_set.add(t)
        c = _canonical_ip_for_compare(t)
        if c:
            canon_hosts.add(c)
    for x in literals:
        t = str(x).strip()
        if t:
            literal_set.add(t)
            c = _canonical_ip_for_compare(t)
            if c:
                canon_hosts.add(c)

    def is_excluded(ip: str | None) -> bool:
        raw = (ip or "").strip()
        if raw in literal_set:
            return True
        cip = _canonical_ip_for_compare(raw)
        if cip and cip in canon_hosts:
            return True
        try:
            addr = ipaddress.ip_address(_normalize_ip_loose(raw) or raw)
        except ValueError:
            return False
        for net in networks:
            try:
                if addr in net:
                    return True
            except TypeError:
                continue
        return False

    return is_excluded


def _analytics_tz() -> ZoneInfo:
    """US Eastern by default; DST handled by IANA zone rules (EST/EDT). Override with EQUILIMA_ANALYTICS_TZ."""
    name = (os.environ.get("EQUILIMA_ANALYTICS_TZ") or "America/New_York").strip() or "America/New_York"
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo("America/New_York")


def _parse_ts_utc_naive(ts: str | None) -> datetime | None:
    """
    Parse page_views.timestamp as naive UTC wall time (SQLite datetime('now') is UTC).
    """
    if not ts:
        return None
    s = str(ts).strip().replace("T", " ").replace("Z", "")
    if len(s) >= 19:
        try:
            return datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S")
        except ValueError:
            pass
    if len(s) >= 10:
        try:
            return datetime.strptime(s[:10], "%Y-%m-%d")
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00").split("+")[0])
    except ValueError:
        return None


def _date_key_et(ts: str | None) -> str | None:
    """Calendar date YYYY-MM-DD in analytics timezone (DST-aware)."""
    dt = _parse_ts_utc_naive(ts)
    if not dt:
        return None
    aware = dt.replace(tzinfo=timezone.utc)
    return aware.astimezone(_analytics_tz()).date().isoformat()


def _parse_ts_datetime(ts: str | None) -> datetime | None:
    """Naive UTC instant from stored timestamp (for code that expects UTC components)."""
    return _parse_ts_utc_naive(ts)


def _client_ip_for_storage(raw: str | None) -> str:
    """Store canonical IP when possible so filters and ignores stay consistent."""
    if raw is None:
        return ""
    n = _normalize_ip_loose(raw)
    return n if n else str(raw).strip()


def _track_ip_is_excluded(conn: sqlite3.Connection, client_ip: str) -> bool:
    """True if this request should not be tracked (same rules as dashboard aggregates)."""
    excluded = [r["ip"] for r in conn.execute("SELECT ip FROM analytics_excluded_ips").fetchall()]
    host_only = [e for e in excluded if not _is_network_exclusion(str(e))]
    literals = _resolve_excluded_ip_literals(conn, host_only)
    return _make_ip_excluder(excluded, literals)(client_ip)


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
            normalized.append(_parse_exclude_entry(str(raw)))
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid IP or CIDR: {raw!r} (use e.g. 1.2.3.4, 2001:db8::1, 67.69.76.0/24, or 67.69.76.* for a /24)",
            )
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
def get_stats(
    response: Response,
    days: int = 30,
    recent_days: int = 7,
    recent_limit: int = 200,
    _admin=Depends(verify_admin),
):
    """Full analytics dashboard data."""
    response.headers["Cache-Control"] = "no-store, private, max-age=0"
    conn = get_db()
    try:
        try:
            days_i = int(days)
        except Exception:
            days_i = 30
        try:
            recent_days_i = int(recent_days)
        except Exception:
            recent_days_i = 7
        try:
            recent_limit_i = int(recent_limit)
        except Exception:
            recent_limit_i = 200

        days_i = max(1, min(3650, days_i))
        recent_days_i = max(1, min(3650, recent_days_i))
        recent_limit_i = max(10, min(5000, recent_limit_i))

        tz = _analytics_tz()
        now_et = datetime.now(tz)
        # Inclusive calendar-day window in Eastern (DST-aware); convert start midnight ET → UTC for SQL.
        start_date_et = now_et.date() - timedelta(days=days_i - 1)
        start_utc = datetime.combine(start_date_et, time.min, tzinfo=tz).astimezone(timezone.utc)
        period_start_sql = start_utc.strftime("%Y-%m-%d %H:%M:%S")

        excluded = _load_excluded_ips(conn)
        host_only = [e for e in excluded if not _is_network_exclusion(str(e))]
        excluded_literals = _resolve_excluded_ip_literals(conn, host_only)
        is_excluded = _make_ip_excluder(excluded, excluded_literals)

        # Pull period rows once; filter IPs in Python (matches /track, survives DB string quirks)
        period_rows: list[sqlite3.Row] = []
        for row in conn.execute(
            """
            SELECT ip, timestamp, tab, session_id, user_agent, country, city, referer, path, user_id
            FROM page_views WHERE timestamp >= ?
            ORDER BY timestamp ASC
            """,
            (period_start_sql,),
        ):
            if is_excluded(row["ip"]):
                continue
            period_rows.append(row)

        total = len(period_rows)
        unique_ips = len({r["ip"] for r in period_rows})
        unique_sessions = len({r["session_id"] for r in period_rows if (r["session_id"] or "").strip()})

        d_views: dict[str, int] = defaultdict(int)
        d_visitors: dict[str, set[str]] = defaultdict(set)
        ip_to_dates: dict[str, set[str]] = defaultdict(set)
        for r in period_rows:
            dk = _date_key_et(r["timestamp"])
            if dk:
                d_views[dk] += 1
                d_visitors[dk].add(r["ip"])
                ip_to_dates[r["ip"]].add(dk)

        # Same-window retention: visitors on day D who also had a visit on an earlier calendar day in range.
        returning_by_day: dict[str, int] = defaultdict(int)
        for _ip, dates in ip_to_dates.items():
            sd = sorted(dates)
            for i in range(1, len(sd)):
                returning_by_day[sd[i]] += 1

        daily_data = []
        for day in sorted(d_views.keys()):
            v = len(d_visitors[day])
            ret = returning_by_day.get(day, 0)
            pct = round(100.0 * ret / v, 1) if v else 0.0
            daily_data.append(
                {
                    "date": day,
                    "views": d_views[day],
                    "visitors": v,
                    "returning": ret,
                    "retention_pct": pct,
                }
            )

        # Last 24 hours ending now in Eastern; bucket by local hour (DST-aware).
        hourly_cutoff_utc = (now_et - timedelta(hours=24)).astimezone(timezone.utc).replace(tzinfo=None)
        hourly_cutoff_sql = hourly_cutoff_utc.strftime("%Y-%m-%d %H:%M:%S")
        hourly_counter: Counter[str] = Counter()
        for row in conn.execute(
            "SELECT ip, timestamp FROM page_views WHERE timestamp >= ? ORDER BY timestamp",
            (hourly_cutoff_sql,),
        ):
            if is_excluded(row["ip"]):
                continue
            dt = _parse_ts_utc_naive(row["timestamp"])
            if dt:
                dt_et = dt.replace(tzinfo=timezone.utc).astimezone(tz)
                hourly_counter[f"{dt_et.hour:02d}:00"] += 1
        hourly_data = [{"hour": h, "views": c} for h, c in sorted(hourly_counter.items())]

        tab_counts = Counter(
            (r["tab"] or "").strip() for r in period_rows if (r["tab"] or "").strip()
        )
        top_tabs_data = [{"tab": t, "views": c} for t, c in tab_counts.most_common(10)]

        country_agg: dict[str, list] = defaultdict(lambda: [0, set()])
        for r in period_rows:
            co = (r["country"] or "").strip()
            if not co:
                continue
            country_agg[co][0] += 1
            country_agg[co][1].add(r["ip"])
        top_countries_data = sorted(
            [{"country": k, "views": v[0], "visitors": len(v[1])} for k, v in country_agg.items()],
            key=lambda x: -x["views"],
        )[:20]

        city_agg: dict[tuple[str, str], list] = defaultdict(lambda: [0, set()])
        for r in period_rows:
            ci = (r["city"] or "").strip()
            co = (r["country"] or "").strip()
            if not ci:
                continue
            city_agg[(ci, co)][0] += 1
            city_agg[(ci, co)][1].add(r["ip"])
        top_cities_data = sorted(
            [{"city": k[0], "country": k[1], "views": v[0], "visitors": len(v[1])} for k, v in city_agg.items()],
            key=lambda x: -x["views"],
        )[:20]

        ref_counts = Counter(
            (r["referer"] or "").strip() for r in period_rows if (r["referer"] or "").strip()
        )
        top_referrers_data = [{"referer": r, "views": c} for r, c in ref_counts.most_common(10)]

        devices = {"Mobile": 0, "Tablet": 0, "Desktop": 0}
        browsers = Counter()
        for r in period_rows:
            ua = (r["user_agent"] or "").lower()
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

        today_key = now_et.date().isoformat()
        today_rows = [r for r in period_rows if _date_key_et(r["timestamp"]) == today_key]
        today_views = len(today_rows)
        today_visitors = len({r["ip"] for r in today_rows})

        recent_data = []
        recent_cutoff_utc = (now_et - timedelta(days=recent_days_i)).astimezone(timezone.utc).replace(tzinfo=None)
        recent_cutoff_sql = recent_cutoff_utc.strftime("%Y-%m-%d %H:%M:%S")
        for row in conn.execute(
            """
            SELECT ip, path, tab, country, city, user_agent, timestamp, user_id
            FROM page_views
            WHERE timestamp >= ?
            ORDER BY timestamp DESC
            LIMIT 20000
            """,
            (recent_cutoff_sql,),
        ):
            if is_excluded(row["ip"]):
                continue
            recent_data.append({
                "ip": row["ip"], "path": row["path"], "tab": row["tab"],
                "country": row["country"], "city": row["city"],
                "timestamp": row["timestamp"], "user_id": row["user_id"],
                "device": "Mobile" if any(m in (row["user_agent"] or "").lower() for m in ["mobile", "iphone", "android"]) else "Desktop",
            })
            if len(recent_data) >= recent_limit_i:
                break

        # Registered users
        users_count = conn.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
        today_et_date = now_et.date()
        users_today = 0
        for urow in conn.execute("SELECT created_at FROM users WHERE created_at IS NOT NULL"):
            if _date_key_et(urow["created_at"]) == today_et_date.isoformat():
                users_today += 1
        users_list = conn.execute("""
            SELECT id, email, name, created_at, last_login, consent_policy, consent_newsletter, is_active
            FROM users ORDER BY created_at DESC
        """).fetchall()
        users_data = [{
            "id": r["id"], "email": r["email"], "name": r["name"],
            "created_at": r["created_at"], "last_login": r["last_login"],
            "newsletter": bool(r["consent_newsletter"]), "active": bool(r["is_active"]),
        } for r in users_list]

        ignored_canonical = sorted(
            {c for e in excluded if not _is_network_exclusion(str(e)) for c in [_canonical_ip_for_compare(str(e))] if c}
        )

        return {
            "period_days": days_i,
            "recent_days": recent_days_i,
            "recent_limit": recent_limit_i,
            "analytics_timezone": str(tz),
            "analytics_tz_abbrev": now_et.tzname(),
            "ignored_ips": excluded,
            "ignored_canonical": ignored_canonical,
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


# ─── Admin: user management ───
@router.get("/users")
def admin_list_users(q: str = "", limit: int = 200, _admin=Depends(verify_admin)):
    conn = get_db()
    try:
        qn = (q or "").strip().lower()
        lim = max(1, min(2000, int(limit)))
        if qn:
            rows = conn.execute(
                """
                SELECT id, email, name, created_at, last_login, consent_newsletter, consent_policy, is_active, email_verified, is_admin
                FROM users
                WHERE lower(email) LIKE ? OR lower(coalesce(name,'')) LIKE ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (f"%{qn}%", f"%{qn}%", lim),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, email, name, created_at, last_login, consent_newsletter, consent_policy, is_active, email_verified, is_admin
                FROM users
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (lim,),
            ).fetchall()
        return {
            "users": [
                {
                    "id": r["id"],
                    "email": r["email"],
                    "name": r["name"],
                    "created_at": r["created_at"],
                    "last_login": r["last_login"],
                    "newsletter": bool(r["consent_newsletter"]),
                    "policy": bool(r["consent_policy"]),
                    "active": bool(r["is_active"]),
                    "email_verified": bool(r["email_verified"]),
                    "is_admin": bool(r["is_admin"]),
                }
                for r in rows
            ]
        }
    finally:
        conn.close()


@router.patch("/users/{user_id}")
async def admin_update_user(user_id: int, request: Request, _admin=Depends(verify_admin)):
    body = await request.json()
    allowed = {"active", "email_verified", "newsletter", "name"}
    patch = {k: body.get(k) for k in allowed if k in body}
    if not patch:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    conn = get_db()
    try:
        row = conn.execute("SELECT id, is_admin FROM users WHERE id = ?", (int(user_id),)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        if row["is_admin"]:
            # Prevent locking yourself out accidentally via UI.
            if "active" in patch and patch["active"] is False:
                raise HTTPException(status_code=400, detail="Cannot disable admin user")

        sets = []
        vals = []
        if "active" in patch:
            sets.append("is_active = ?")
            vals.append(1 if bool(patch["active"]) else 0)
        if "email_verified" in patch:
            sets.append("email_verified = ?")
            vals.append(1 if bool(patch["email_verified"]) else 0)
            if bool(patch["email_verified"]):
                sets.append("verification_token = NULL")
        if "newsletter" in patch:
            sets.append("consent_newsletter = ?")
            vals.append(1 if bool(patch["newsletter"]) else 0)
            sets.append("consent_newsletter_at = datetime('now')")
        if "name" in patch:
            sets.append("name = ?")
            vals.append(str(patch["name"]) if patch["name"] is not None else "")

        vals.append(int(user_id))
        conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ?", tuple(vals))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.delete("/users/{user_id}")
def admin_delete_user(user_id: int, _admin=Depends(verify_admin)):
    conn = get_db()
    try:
        row = conn.execute("SELECT id, is_admin FROM users WHERE id = ?", (int(user_id),)).fetchone()
        if not row:
            return {"ok": True}
        if row["is_admin"]:
            raise HTTPException(status_code=400, detail="Cannot delete admin user")
        try:
            conn.execute("UPDATE page_views SET user_id = NULL WHERE user_id = ?", (int(user_id),))
        except Exception:
            pass
        conn.execute("DELETE FROM users WHERE id = ?", (int(user_id),))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ─── Admin: newsletter / broadcast email ───
_ALLOWED_AUDIENCES = frozenset({"newsletter_subscribers", "all_active", "selected"})
_ALLOWED_KINDS = frozenset({"newsletter", "welcome", "other"})


def _personalize_html(html_body: str, name: str, email: str) -> str:
    safe_name = html_module.escape(name or "")
    safe_email = html_module.escape(email or "")
    parts = (name or "").strip().split()
    first = parts[0] if parts else ""
    safe_first = html_module.escape(first)
    s = html_body
    for a, b in (
        ("{{name}}", safe_name),
        ("{{email}}", safe_email),
        ("{{first_name}}", safe_first),
        ("{name}", safe_name),
        ("{email}", safe_email),
        ("{first_name}", safe_first),
    ):
        s = s.replace(a, b)
    return s


def _list_recipients(conn: sqlite3.Connection, audience: str, user_ids: list[int] | None) -> list[dict]:
    base = """
        SELECT id, email, name FROM users
        WHERE is_admin = 0 AND is_active = 1 AND email_verified = 1
    """
    if audience == "newsletter_subscribers":
        rows = conn.execute(base + " AND consent_newsletter = 1 ORDER BY id").fetchall()
    elif audience == "all_active":
        rows = conn.execute(base + " ORDER BY id").fetchall()
    elif audience == "selected":
        if not user_ids:
            raise HTTPException(status_code=400, detail="user_ids required for selected audience")
        placeholders = ",".join("?" * len(user_ids))
        rows = conn.execute(
            base + f" AND id IN ({placeholders}) ORDER BY id",
            tuple(int(x) for x in user_ids),
        ).fetchall()
    else:
        raise HTTPException(status_code=400, detail="invalid audience")
    seen: set[str] = set()
    out: list[dict] = []
    for r in rows:
        em = (r["email"] or "").strip().lower()
        if not em or em in seen:
            continue
        seen.add(em)
        out.append({"id": r["id"], "email": r["email"], "name": (r["name"] or "")})
    return out


# Cap list payload for admin preview UI (count is always exact).
_NEWSLETTER_PREVIEW_MAX_ROWS = 5000


@router.post("/newsletter/preview")
async def admin_newsletter_preview(request: Request, _admin=Depends(verify_admin)):
    body = await request.json()
    audience = (body.get("audience") or "newsletter_subscribers").strip()
    if audience not in _ALLOWED_AUDIENCES:
        raise HTTPException(status_code=400, detail="invalid audience")
    raw_ids = body.get("user_ids")
    user_ids = None
    if raw_ids is not None:
        user_ids = [int(x) for x in raw_ids] if isinstance(raw_ids, list) else []
    conn = get_db()
    try:
        recipients = _list_recipients(conn, audience, user_ids)
        n = len(recipients)
        truncated = n > _NEWSLETTER_PREVIEW_MAX_ROWS
        rows = recipients[:_NEWSLETTER_PREVIEW_MAX_ROWS] if truncated else recipients
        return {"count": n, "recipients": rows, "truncated": truncated}
    finally:
        conn.close()


@router.post("/newsletter/send")
async def admin_newsletter_send(request: Request, _admin=Depends(verify_admin)):
    from .auth import send_email

    body = await request.json()
    kind = (body.get("kind") or "other").strip()
    if kind not in _ALLOWED_KINDS:
        raise HTTPException(status_code=400, detail="invalid kind")
    subject = (body.get("subject") or "").strip()
    html_body = body.get("html_body") or ""
    if not subject:
        raise HTTPException(status_code=400, detail="subject required")
    if not (html_body and str(html_body).strip()):
        raise HTTPException(status_code=400, detail="html_body required")
    audience = (body.get("audience") or "newsletter_subscribers").strip()
    if audience not in _ALLOWED_AUDIENCES:
        raise HTTPException(status_code=400, detail="invalid audience")
    raw_ids = body.get("user_ids")
    user_ids = None
    if raw_ids is not None:
        user_ids = [int(x) for x in raw_ids] if isinstance(raw_ids, list) else []

    conn = get_db()
    try:
        recipients = _list_recipients(conn, audience, user_ids)
    finally:
        conn.close()

    if not recipients:
        raise HTTPException(status_code=400, detail="No recipients match the current filters")

    failures: list[dict] = []
    ok_count = 0
    for r in recipients:
        personalized = _personalize_html(str(html_body), r["name"], r["email"])
        ok, err = send_email(r["email"], subject, personalized)
        if ok:
            ok_count += 1
        else:
            failures.append({"email": r["email"], "error": err or "send_failed"})

    fail_count = len(failures)
    failed_json = json.dumps(failures) if failures else None

    conn = get_db()
    try:
        cur = conn.execute(
            """
            INSERT INTO newsletter_send_log
            (kind, subject, audience, recipient_count, ok_count, fail_count, failed_emails)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                kind,
                subject,
                audience,
                len(recipients),
                ok_count,
                fail_count,
                failed_json,
            ),
        )
        conn.commit()
        log_id = cur.lastrowid
    finally:
        conn.close()

    return {
        "log_id": log_id,
        "recipient_count": len(recipients),
        "ok_count": ok_count,
        "fail_count": fail_count,
        "failures": failures,
        "verified": fail_count == 0,
    }


@router.get("/newsletter/history")
def admin_newsletter_history(limit: int = 30, _admin=Depends(verify_admin)):
    lim = max(1, min(100, int(limit)))
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT id, sent_at, kind, subject, audience, recipient_count, ok_count, fail_count, failed_emails
            FROM newsletter_send_log
            ORDER BY id DESC
            LIMIT ?
            """,
            (lim,),
        ).fetchall()
        out = []
        for r in rows:
            failed = []
            if r["failed_emails"]:
                try:
                    failed = json.loads(r["failed_emails"])
                except Exception:
                    failed = []
            out.append(
                {
                    "id": r["id"],
                    "sent_at": r["sent_at"],
                    "kind": r["kind"],
                    "subject": r["subject"],
                    "audience": r["audience"],
                    "recipient_count": r["recipient_count"],
                    "ok_count": r["ok_count"],
                    "fail_count": r["fail_count"],
                    "failures": failed,
                }
            )
        return {"sends": out}
    finally:
        conn.close()

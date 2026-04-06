"""
Integration tests: ignored IPs must affect summary, charts, and recent visitors consistently.
Run: cd backend && PYTHONPATH=. pytest tests/test_analytics_ip_filter.py -v
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch, tmp_path: Path):
    db_path = tmp_path / "equilima.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)

    def fake_get_db():
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    import app.analytics as analytics

    monkeypatch.setattr(analytics, "DB_PATH", db_path)
    monkeypatch.setattr(analytics, "get_db", fake_get_db)
    monkeypatch.setattr(analytics, "ADMIN_USER", "admintest")
    monkeypatch.setattr(analytics, "ADMIN_PASS", "passtest")

    analytics.init_analytics_db()

    conn = fake_get_db()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            last_login TEXT,
            consent_policy INTEGER NOT NULL DEFAULT 0,
            consent_newsletter INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER DEFAULT 1
        );
        """
    )
    conn.commit()
    conn.close()

    app = FastAPI()
    app.include_router(analytics.router)
    return TestClient(app)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _seed_views(conn: sqlite3.Connection, rows: list[tuple]) -> None:
    """rows: (ip, ts, tab, ua, country, city, session_id)"""
    for ip, ts, tab, ua, country, city, sid in rows:
        conn.execute(
            """
            INSERT INTO page_views (ip, path, tab, user_agent, referer, country, city, session_id, user_id, timestamp)
            VALUES (?, '/', ?, ?, '', ?, ?, ?, NULL, ?)
            """,
            (ip, tab, ua, country, city, sid, ts),
        )
    conn.commit()


def test_stats_excludes_ip_everywhere_summary_matches_recent(client: TestClient, monkeypatch, tmp_path: Path):
    import app.analytics as analytics

    now = _utc_now()
    today = now.strftime("%Y-%m-%d %H:%M:%S")
    yday = (now - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")

    conn = analytics.get_db()
    _seed_views(
        conn,
        [
            ("1.1.1.1", today, "dashboard", "Mozilla/5.0 Safari", "AU", "Sydney", "a"),
            ("1.1.1.1", today, "screener", "Mozilla/5.0 Safari", "AU", "Sydney", "a"),
            ("8.8.8.8", today, "dashboard", "Mozilla/5.0 Chrome", "US", "NYC", "b"),
            ("8.8.8.8", yday, "agent", "Mozilla/5.0 Chrome", "US", "NYC", "c"),
        ],
    )
    conn.execute("INSERT INTO analytics_excluded_ips (ip) VALUES ('1.1.1.1')")
    conn.commit()
    conn.close()

    tok = client.post("/api/admin/login", json={"username": "admintest", "password": "passtest"}).json()["token"]
    r = client.get("/api/admin/stats?days=30", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200, r.text
    data = r.json()

    assert data["summary"]["total_views"] == 2, "only 8.8.8.8 rows in period"
    assert data["summary"]["unique_visitors"] == 1
    assert data["summary"]["unique_sessions"] == 2

    tabs = {x["tab"]: x["views"] for x in data["top_tabs"]}
    assert tabs.get("dashboard") == 1
    assert tabs.get("agent") == 1
    assert "screener" not in tabs

    countries = {x["country"]: x["views"] for x in data["top_countries"]}
    assert countries.get("US") == 2
    assert "AU" not in countries

    recent_ips = [x["ip"] for x in data["recent_visitors"]]
    assert "1.1.1.1" not in recent_ips
    assert "8.8.8.8" in recent_ips

    assert r.headers.get("cache-control", "").lower().find("no-store") >= 0


def test_stored_ip_with_whitespace_matches_normalized_ignore_list(client: TestClient):
    """DB has '1.1.1.1 ' (legacy); ignore list has 1.1.1.1 — Python excluder must match."""
    import app.analytics as analytics

    now = _utc_now().strftime("%Y-%m-%d %H:%M:%S")
    conn = analytics.get_db()
    try:
        _seed_views(
            conn,
            [
                ("1.1.1.1 ", now, "dash", "Mozilla/5.0", "X", "Y", "s1"),
                ("9.9.9.9", now, "dash", "Mozilla/5.0", "X", "Y", "s2"),
            ],
        )
        conn.execute("INSERT INTO analytics_excluded_ips (ip) VALUES ('1.1.1.1')")
        conn.commit()
    finally:
        conn.close()

    tok = client.post("/api/admin/login", json={"username": "admintest", "password": "passtest"}).json()["token"]
    data = client.get("/api/admin/stats?days=7", headers={"Authorization": f"Bearer {tok}"}).json()

    assert data["summary"]["total_views"] == 1
    assert data["summary"]["unique_visitors"] == 1
    recent_ips = [x["ip"] for x in data["recent_visitors"]]
    assert "9.9.9.9" in recent_ips
    assert not any(str(x).strip().rstrip() == "1.1.1.1" for x in recent_ips)


def test_ipv4_cidr_excludes_entire_subnet(client: TestClient):
    """Blocking 10.10.10.0/24 removes 10.10.10.5 and 10.10.10.99 from stats (ISP-style rotation)."""
    import app.analytics as analytics

    now = _utc_now().strftime("%Y-%m-%d %H:%M:%S")
    conn = analytics.get_db()
    try:
        _seed_views(
            conn,
            [
                ("10.10.10.5", now, "dash", "Mozilla/5.0", "Canada", "Montreal", "s1"),
                ("10.10.10.99", now, "dash", "Mozilla/5.0", "Canada", "Montreal", "s2"),
                ("8.8.8.8", now, "dash", "Mozilla/5.0", "US", "NYC", "s3"),
            ],
        )
        conn.execute("INSERT INTO analytics_excluded_ips (ip) VALUES ('10.10.10.0/24')")
        conn.commit()
    finally:
        conn.close()

    tok = client.post("/api/admin/login", json={"username": "admintest", "password": "passtest"}).json()["token"]
    data = client.get("/api/admin/stats?days=7", headers={"Authorization": f"Bearer {tok}"}).json()

    assert data["summary"]["total_views"] == 1
    assert data["summary"]["unique_visitors"] == 1
    cities = {f"{c['city']}, {c['country']}": c["views"] for c in data["top_cities"]}
    assert "Montreal, Canada" not in cities
    recent_ips = [x["ip"] for x in data["recent_visitors"]]
    assert "8.8.8.8" in recent_ips
    assert "10.10.10.5" not in recent_ips


def test_ipv4_mapped_ipv6_matches_ipv4_ignore(client: TestClient):
    """Stored ::ffff:1.1.1.1 is treated as 1.1.1.1 for single-host ignore list."""
    import app.analytics as analytics

    now = _utc_now().strftime("%Y-%m-%d %H:%M:%S")
    conn = analytics.get_db()
    try:
        _seed_views(
            conn,
            [
                ("::ffff:1.1.1.1", now, "dash", "Mozilla/5.0", "AU", "Sydney", "s1"),
                ("8.8.8.8", now, "dash", "Mozilla/5.0", "US", "NYC", "s2"),
            ],
        )
        conn.execute("INSERT INTO analytics_excluded_ips (ip) VALUES ('1.1.1.1')")
        conn.commit()
    finally:
        conn.close()

    tok = client.post("/api/admin/login", json={"username": "admintest", "password": "passtest"}).json()["token"]
    data = client.get("/api/admin/stats?days=7", headers={"Authorization": f"Bearer {tok}"}).json()

    assert data["summary"]["total_views"] == 1
    assert "1.1.1.1" in (data.get("ignored_canonical") or [])
    assert "AU" not in {c["country"] for c in data["top_countries"]}

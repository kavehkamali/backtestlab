from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException, Request

from .auth import decode_token

DB_PATH = Path.home() / ".equilima_data" / "equilima.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

SOFT_DAILY_LIMIT = 5
AGENT_FORCE_LIMIT = 10
PAGE_FORCE_LIMIT = 20


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_usage_db():
    conn = get_db()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS usage_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT DEFAULT (datetime('now')),
            date TEXT NOT NULL,
            ip TEXT NOT NULL,
            user_id INTEGER,
            username TEXT,
            page TEXT NOT NULL,
            section TEXT,
            action TEXT,
            conversation_id TEXT,
            is_new_chat INTEGER DEFAULT 0,
            input_text TEXT,
            input_payload TEXT,
            output_text TEXT,
            input_tokens INTEGER DEFAULT 0,
            output_tokens INTEGER DEFAULT 0,
            limited_action TEXT,
            forced INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS usage_daily (
            date TEXT NOT NULL,
            ip TEXT NOT NULL,
            user_id INTEGER,
            page TEXT NOT NULL,
            count INTEGER DEFAULT 0,
            PRIMARY KEY(date, ip, page)
        );

        CREATE TABLE IF NOT EXISTS usage_ip_overrides (
            ip TEXT PRIMARY KEY,
            unlimited INTEGER DEFAULT 0,
            force_prompt INTEGER DEFAULT 0,
            force_signup INTEGER DEFAULT 0,
            note TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_usage_events_date_page ON usage_events(date, page);
        CREATE INDEX IF NOT EXISTS idx_usage_events_ip_date ON usage_events(ip, date);
        CREATE INDEX IF NOT EXISTS idx_usage_events_user_date ON usage_events(user_id, date);
        CREATE INDEX IF NOT EXISTS idx_usage_daily_date_page ON usage_daily(date, page);
        """
    )
    conn.commit()
    conn.close()


init_usage_db()


def estimate_tokens(value: Any) -> int:
    if value is None:
        return 0
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    text = str(text)
    return max(1, int(len(text) / 4)) if text.strip() else 0


def client_ip(request: Request) -> str:
    ip = request.client.host if request.client else ""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip() or ip
    return ip or ""


def current_user_from_request(request: Request) -> dict[str, Any] | None:
    auth = (request.headers.get("authorization") or "").strip()
    if not auth.lower().startswith("bearer "):
        return None
    payload = decode_token(auth.split(" ", 1)[1].strip())
    if not payload:
        return None
    try:
        return {"id": int(payload["sub"]), "email": payload.get("email") or ""}
    except Exception:
        return None


def normalize_page(page: str | None) -> str:
    p = (page or "other").strip().lower()
    aliases = {
        "agent": "agent",
        "ai agent": "agent",
        "agent ai": "agent",
        "picks": "picks",
        "ai picks": "picks",
        "reddit": "reddit",
        "reddit picks": "reddit",
        "markets": "markets",
        "market": "markets",
        "screener": "screener",
        "research": "research",
        "backtest": "backtest",
        "backtesting": "backtest",
        "terminal": "chart",
        "chart": "chart",
        "crypto": "markets",
        "news": "news",
    }
    return aliases.get(p, p[:64] or "other")


def limit_payload(page: str, count: int, authenticated: bool) -> dict[str, Any]:
    page = normalize_page(page)
    force_limit = AGENT_FORCE_LIMIT if page == "agent" else PAGE_FORCE_LIMIT
    show_prompt = (not authenticated) and count > SOFT_DAILY_LIMIT
    force_signup = (not authenticated) and count > force_limit
    return {
        "authenticated": authenticated,
        "page": page,
        "count": count,
        "soft_limit": SOFT_DAILY_LIMIT,
        "force_limit": force_limit,
        "show_prompt": show_prompt,
        "force_signup": force_signup,
        "remaining_until_force": max(0, force_limit - count),
        "message": (
            "Create a free Equilima account for unlimited access. No credit card required."
            if force_signup
            else "Sign in for completely free unlimited access. No credit card required."
            if show_prompt
            else ""
        ),
    }


def get_ip_override(conn: sqlite3.Connection, ip: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT ip, unlimited, force_prompt, force_signup, note, updated_at FROM usage_ip_overrides WHERE ip = ?",
        (ip,),
    ).fetchone()
    if not row:
        return None
    return {
        "ip": row["ip"],
        "unlimited": bool(row["unlimited"]),
        "force_prompt": bool(row["force_prompt"]),
        "force_signup": bool(row["force_signup"]),
        "note": row["note"] or "",
        "updated_at": row["updated_at"],
    }


def apply_ip_override(info: dict[str, Any], override: dict[str, Any] | None, authenticated: bool) -> dict[str, Any]:
    if not override:
        return info
    out = dict(info)
    out["ip_override"] = {
        "unlimited": bool(override.get("unlimited")),
        "force_prompt": bool(override.get("force_prompt")),
        "force_signup": bool(override.get("force_signup")),
        "note": override.get("note") or "",
    }
    if override.get("force_signup"):
        out.update(
            {
                "authenticated": authenticated,
                "show_prompt": True,
                "force_signup": True,
                "remaining_until_force": 0,
                "message": "Create a free Equilima account for unlimited access. No credit card required.",
            }
        )
        return out
    if override.get("force_prompt"):
        out.update(
            {
                "authenticated": authenticated,
                "show_prompt": True,
                "force_signup": False,
                "message": "Sign in for completely free unlimited access. No credit card required.",
            }
        )
        return out
    if override.get("unlimited"):
        out.update(
            {
                "authenticated": True,
                "show_prompt": False,
                "force_signup": False,
                "remaining_until_force": 999999,
                "message": "",
            }
        )
        return out
    return out


def usage_status(request: Request, page: str) -> dict[str, Any]:
    page = normalize_page(page)
    user = current_user_from_request(request)
    ip = client_ip(request)
    today = datetime.utcnow().strftime("%Y-%m-%d")
    conn = get_db()
    try:
        override = get_ip_override(conn, ip)
        row = conn.execute(
            "SELECT count FROM usage_daily WHERE date = ? AND ip = ? AND page = ?",
            (today, ip, page),
        ).fetchone()
        info = limit_payload(page, int(row["count"] if row else 0), bool(user))
        return apply_ip_override(info, override, bool(user))
    finally:
        conn.close()


def begin_usage_event(
    request: Request,
    page: str,
    *,
    section: str = "",
    action: str = "",
    conversation_id: str = "",
    is_new_chat: bool = False,
    input_text: str = "",
    input_payload: Any = None,
) -> tuple[int | None, dict[str, Any]]:
    page = normalize_page(page)
    user = current_user_from_request(request)
    authenticated = bool(user)
    ip = client_ip(request)
    today = datetime.utcnow().strftime("%Y-%m-%d")
    username = user.get("email") if user else ""
    input_payload_text = ""
    if input_payload is not None:
        try:
            input_payload_text = json.dumps(input_payload, ensure_ascii=False, default=str)[:20000]
        except Exception:
            input_payload_text = str(input_payload)[:20000]
    input_text = (input_text or "")[:20000]
    input_tokens = estimate_tokens(input_text or input_payload_text)

    conn = get_db()
    try:
        override = get_ip_override(conn, ip)
        count = 0
        unlimited_override = bool(override and override.get("unlimited") and not override.get("force_prompt") and not override.get("force_signup"))
        if not authenticated and not unlimited_override:
            conn.execute(
                "INSERT INTO usage_daily (date, ip, user_id, page, count) VALUES (?, ?, NULL, ?, 1) "
                "ON CONFLICT(date, ip, page) DO UPDATE SET count = count + 1",
                (today, ip, page),
            )
            row = conn.execute(
                "SELECT count FROM usage_daily WHERE date = ? AND ip = ? AND page = ?",
                (today, ip, page),
            ).fetchone()
            count = int(row["count"] if row else 1)
        else:
            row = conn.execute(
                "SELECT count FROM usage_daily WHERE date = ? AND ip = ? AND page = ?",
                (today, ip, page),
            ).fetchone()
            count = int(row["count"] if row else 0)

        info = apply_ip_override(limit_payload(page, count, authenticated), override, authenticated)
        event_id = None
        limited_action = "force" if info["force_signup"] else "prompt" if info["show_prompt"] else ""
        if info["force_signup"]:
            conn.execute(
                """
                INSERT INTO usage_events
                (date, ip, user_id, username, page, section, action, conversation_id, is_new_chat,
                 input_text, input_payload, input_tokens, limited_action, forced)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    today, ip, user.get("id") if user else None, username, page, section, action,
                    conversation_id, 1 if is_new_chat else 0, input_text, input_payload_text,
                    input_tokens, limited_action, 1,
                ),
            )
            conn.commit()
            raise HTTPException(status_code=402, detail=info)

        cur = conn.execute(
            """
            INSERT INTO usage_events
            (date, ip, user_id, username, page, section, action, conversation_id, is_new_chat,
             input_text, input_payload, input_tokens, limited_action, forced)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                today, ip, user.get("id") if user else None, username, page, section, action,
                conversation_id, 1 if is_new_chat else 0, input_text, input_payload_text,
                input_tokens, limited_action, 0,
            ),
        )
        event_id = int(cur.lastrowid)
        conn.commit()
        return event_id, info
    finally:
        conn.close()


def finish_usage_event(event_id: int | None, output: Any = None, output_tokens: int | None = None):
    if not event_id:
        return
    text = output if isinstance(output, str) else json.dumps(output, ensure_ascii=False, default=str)
    text = (text or "")[:20000]
    tokens = int(output_tokens if output_tokens is not None else estimate_tokens(text))
    conn = get_db()
    try:
        conn.execute(
            "UPDATE usage_events SET output_text = ?, output_tokens = ? WHERE id = ?",
            (text, tokens, int(event_id)),
        )
        conn.commit()
    finally:
        conn.close()

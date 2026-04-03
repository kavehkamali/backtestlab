from __future__ import annotations
"""
Authentication system: signup, signin, JWT tokens, interaction tracking.
SQLite storage — production-safe, encrypted passwords, rate limiting by IP.
"""

import sqlite3
import os
import time
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from contextlib import contextmanager

from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from jose import jwt, JWTError

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ─── Config ───
DB_PATH = Path.home() / ".equilima_data" / "equilima.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

SECRET_KEY = os.environ.get("JWT_SECRET", secrets.token_hex(32))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 72
SOFT_LIMIT = 5     # gentle popup (dismissible)
HARD_LIMIT = 20    # forced signup wall

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)


# ─── Database ───
def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            last_login TEXT,
            consent_policy INTEGER NOT NULL DEFAULT 0,
            consent_newsletter INTEGER NOT NULL DEFAULT 0,
            consent_policy_at TEXT,
            consent_newsletter_at TEXT,
            is_active INTEGER DEFAULT 1,
            is_admin INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            date TEXT NOT NULL,
            count INTEGER DEFAULT 0,
            UNIQUE(ip, date)
        );

        CREATE INDEX IF NOT EXISTS idx_interactions_ip_date ON interactions(ip, date);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    """)
    conn.commit()
    conn.close()


init_db()


# ─── JWT ───
def create_token(user_id: int, email: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    return jwt.encode(
        {"sub": str(user_id), "email": email, "exp": expire},
        SECRET_KEY, algorithm=ALGORITHM,
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Optional auth — returns user dict or None."""
    if not credentials:
        return None
    payload = decode_token(credentials.credentials)
    if not payload:
        return None
    return {"id": int(payload["sub"]), "email": payload["email"]}


# ─── Interaction tracking ───
def track_interaction(ip: str) -> dict:
    """Track IP interaction count. Returns current count and limit info."""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    conn = get_db()
    try:
        # Upsert interaction count
        conn.execute(
            "INSERT INTO interactions (ip, date, count) VALUES (?, ?, 1) "
            "ON CONFLICT(ip, date) DO UPDATE SET count = count + 1",
            (ip, today),
        )
        conn.commit()
        row = conn.execute(
            "SELECT count FROM interactions WHERE ip = ? AND date = ?",
            (ip, today),
        ).fetchone()
        count = row["count"] if row else 0
        return {
            "count": count,
            "soft_limit": SOFT_LIMIT,
            "hard_limit": HARD_LIMIT,
            "show_prompt": count >= SOFT_LIMIT,
            "force_signup": count >= HARD_LIMIT,
            "remaining": max(0, HARD_LIMIT - count),
        }
    finally:
        conn.close()


# ─── Models ───
class SignupRequest(BaseModel):
    email: str
    password: str
    name: str = ""
    consent_policy: bool
    consent_newsletter: bool = False


class SigninRequest(BaseModel):
    email: str
    password: str


# ─── Endpoints ───
@router.post("/signup")
def signup(req: SignupRequest):
    if not req.consent_policy:
        raise HTTPException(status_code=400, detail="You must accept the Privacy Policy and Terms of Service")

    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    if not req.email or "@" not in req.email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    conn = get_db()
    try:
        # Check if email exists
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (req.email.lower(),)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="An account with this email already exists")

        now = datetime.utcnow().isoformat()
        conn.execute(
            """INSERT INTO users (email, password_hash, name, consent_policy, consent_newsletter,
               consent_policy_at, consent_newsletter_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                req.email.lower(),
                pwd_context.hash(req.password),
                req.name,
                1,
                1 if req.consent_newsletter else 0,
                now,
                now if req.consent_newsletter else None,
            ),
        )
        conn.commit()

        user = conn.execute("SELECT id, email, name FROM users WHERE email = ?", (req.email.lower(),)).fetchone()
        token = create_token(user["id"], user["email"])

        return {
            "token": token,
            "user": {"id": user["id"], "email": user["email"], "name": user["name"]},
        }
    finally:
        conn.close()


@router.post("/signin")
def signin(req: SigninRequest):
    conn = get_db()
    try:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (req.email.lower(),)).fetchone()
        if not user or not pwd_context.verify(req.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        if not user["is_active"]:
            raise HTTPException(status_code=403, detail="Account is disabled")

        conn.execute("UPDATE users SET last_login = datetime('now') WHERE id = ?", (user["id"],))
        conn.commit()

        token = create_token(user["id"], user["email"])
        return {
            "token": token,
            "user": {"id": user["id"], "email": user["email"], "name": user["name"]},
        }
    finally:
        conn.close()


@router.get("/me")
def get_me(user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    try:
        row = conn.execute("SELECT id, email, name, created_at FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return {"id": row["id"], "email": row["email"], "name": row["name"], "created_at": row["created_at"]}
    finally:
        conn.close()


@router.get("/interaction")
def check_interaction(request: Request, user=Depends(get_current_user)):
    """Check interaction count for current IP. Authenticated users bypass limits."""
    if user:
        return {"count": 0, "limit": 999999, "remaining": 999999, "exceeded": False, "authenticated": True}

    ip = request.client.host
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()

    info = track_interaction(ip)
    info["authenticated"] = False
    return info
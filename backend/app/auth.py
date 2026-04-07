from __future__ import annotations
"""
Authentication: signup with email verification, signin, forgot password, JWT tokens.
"""

import sqlite3
import os
import time
import secrets
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from passlib.context import CryptContext
from jose import jwt, JWTError

router = APIRouter(prefix="/api/auth", tags=["auth"])

DB_PATH = Path.home() / ".equilima_data" / "equilima.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

SECRET_KEY = os.environ.get("JWT_SECRET", secrets.token_hex(32))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 72
SOFT_LIMIT = 50
HARD_LIMIT = 500

SITE_URL = os.environ.get("SITE_URL", "https://equilima.com")

# Email config (set via env vars)
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = (os.environ.get("SMTP_PASS", "") or "").replace(" ", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "noreply@equilima.com")
SMTP_USE_SSL = os.environ.get("SMTP_USE_SSL", "").strip().lower() in {"1", "true", "yes", "on"}
SMTP_TIMEOUT_SECS = float(os.environ.get("SMTP_TIMEOUT_SECS", "10"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
security = HTTPBearer(auto_error=False)


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
            is_admin INTEGER DEFAULT 0,
            email_verified INTEGER DEFAULT 0,
            verification_token TEXT,
            reset_token TEXT,
            reset_token_expires TEXT
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
    # Add columns if they don't exist (migration for existing DBs)
    for col, dtype in [("email_verified", "INTEGER DEFAULT 0"), ("verification_token", "TEXT"),
                       ("reset_token", "TEXT"), ("reset_token_expires", "TEXT")]:
        try:
            conn.execute(f"ALTER TABLE users ADD COLUMN {col} {dtype}")
        except Exception:
            pass
    conn.commit()
    conn.close()


init_db()


# ─── Email sending ───
def send_email(to: str, subject: str, html_body: str):
    """
    Send email via SMTP.

    Returns (ok, error_message). If SMTP isn't configured, returns (False, "not_configured").
    """
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASS:
        print(f"[EMAIL NOT CONFIGURED] To: {to} | Subject: {subject}")
        return False, "not_configured"

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = SMTP_FROM
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(html_body, "html"))

        if SMTP_USE_SSL or SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT_SECS) as server:
                server.ehlo()
                server.login(SMTP_USER, SMTP_PASS)
                server.sendmail(SMTP_FROM, to, msg.as_string())
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT_SECS) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(SMTP_USER, SMTP_PASS)
                server.sendmail(SMTP_FROM, to, msg.as_string())
        return True, None
    except Exception as e:
        print(f"[EMAIL ERROR] to={to} subject={subject!r} err={e!r}")
        return False, "send_failed"


def send_verification_email(email: str, token: str):
    link = f"{SITE_URL}/#verify?token={token}"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #818cf8;">Verify your Equilima account</h2>
        <p>Click the button below to verify your email address:</p>
        <a href="{link}" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">Verify Email</a>
        <p style="color: #666; font-size: 12px; margin-top: 20px;">Or copy this link: {link}</p>
        <p style="color: #666; font-size: 12px;">This link expires in 24 hours.</p>
    </div>"""
    return send_email(email, "Verify your Equilima account", html)


def send_reset_email(email: str, token: str):
    link = f"{SITE_URL}/#reset?token={token}"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #818cf8;">Reset your Equilima password</h2>
        <p>Click the button below to reset your password:</p>
        <a href="{link}" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">Reset Password</a>
        <p style="color: #666; font-size: 12px; margin-top: 20px;">Or copy this link: {link}</p>
        <p style="color: #666; font-size: 12px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
    </div>"""
    return send_email(email, "Reset your Equilima password", html)


# ─── JWT ───
def create_token(user_id: int, email: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": str(user_id), "email": email, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str):
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        return None
    payload = decode_token(credentials.credentials)
    if not payload:
        return None
    return {"id": int(payload["sub"]), "email": payload["email"]}


# ─── Interaction tracking ───
def track_interaction(ip: str):
    today = datetime.utcnow().strftime("%Y-%m-%d")
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO interactions (ip, date, count) VALUES (?, ?, 1) "
            "ON CONFLICT(ip, date) DO UPDATE SET count = count + 1",
            (ip, today),
        )
        conn.commit()
        row = conn.execute("SELECT count FROM interactions WHERE ip = ? AND date = ?", (ip, today)).fetchone()
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


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


class VerifyEmailRequest(BaseModel):
    token: str


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
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (req.email.lower(),)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="An account with this email already exists")

        try:
            pw_hash = pwd_context.hash(req.password[:72])
        except Exception:
            import hashlib
            pw_hash = hashlib.sha256(req.password.encode()).hexdigest()

        verification_token = secrets.token_urlsafe(32)
        now = datetime.utcnow().isoformat()

        conn.execute(
            """INSERT INTO users (email, password_hash, name, consent_policy, consent_newsletter,
               consent_policy_at, consent_newsletter_at, email_verified, verification_token)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                req.email.lower(), pw_hash, req.name,
                1, 1 if req.consent_newsletter else 0,
                now, now if req.consent_newsletter else None,
                0, verification_token,
            ),
        )
        conn.commit()

        user = conn.execute("SELECT id, email, name FROM users WHERE email = ?", (req.email.lower(),)).fetchone()
        token = create_token(user["id"], user["email"])

        # Send verification email
        email_sent, email_err = send_verification_email(req.email.lower(), verification_token)

        return {
            "token": token,
            "user": {"id": user["id"], "email": user["email"], "name": user["name"]},
            "message": (
                "Account created. Please check your email to verify your account."
                if email_sent
                else "Account created, but we could not send the verification email. Please use 'Resend verification' after signing in."
            ),
            "email_verified": False,
            "email_sent": bool(email_sent),
            "email_error": email_err,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Account creation failed: {str(e)}")
    finally:
        conn.close()


@router.post("/verify-email")
def verify_email(req: VerifyEmailRequest):
    conn = get_db()
    try:
        user = conn.execute("SELECT id, email FROM users WHERE verification_token = ?", (req.token,)).fetchone()
        if not user:
            raise HTTPException(status_code=400, detail="Invalid or expired verification link")

        conn.execute("UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?", (user["id"],))
        conn.commit()
        return {"message": "Email verified successfully", "email": user["email"]}
    finally:
        conn.close()


@router.post("/signin")
def signin(req: SigninRequest):
    conn = get_db()
    try:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (req.email.lower(),)).fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        try:
            pw_ok = pwd_context.verify(req.password[:72], user["password_hash"])
        except Exception:
            import hashlib
            pw_ok = user["password_hash"] == hashlib.sha256(req.password.encode()).hexdigest()
        if not pw_ok:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        if not user["is_active"]:
            raise HTTPException(status_code=403, detail="Account is disabled")

        conn.execute("UPDATE users SET last_login = datetime('now') WHERE id = ?", (user["id"],))
        conn.commit()

        token = create_token(user["id"], user["email"])
        return {
            "token": token,
            "user": {"id": user["id"], "email": user["email"], "name": user["name"]},
            "email_verified": bool(user["email_verified"]),
        }
    finally:
        conn.close()


@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    conn = get_db()
    try:
        user = conn.execute("SELECT id, email FROM users WHERE email = ?", (req.email.lower(),)).fetchone()
        if not user:
            # Don't reveal if email exists
            return {"message": "If an account with that email exists, we've sent a password reset link."}

        reset_token = secrets.token_urlsafe(32)
        expires = (datetime.utcnow() + timedelta(hours=1)).isoformat()
        conn.execute("UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?",
                     (reset_token, expires, user["id"]))
        conn.commit()

        email_sent, _ = send_reset_email(user["email"], reset_token)
        # Still avoid revealing whether email exists or not, and whether sending succeeded.
        return {"message": "If an account with that email exists, we've sent a password reset link.", "email_sent": bool(email_sent)}
    finally:
        conn.close()


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest):
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    conn = get_db()
    try:
        user = conn.execute("SELECT id, reset_token_expires FROM users WHERE reset_token = ?", (req.token,)).fetchone()
        if not user:
            raise HTTPException(status_code=400, detail="Invalid or expired reset link")

        if user["reset_token_expires"]:
            expires = datetime.fromisoformat(user["reset_token_expires"])
            if datetime.utcnow() > expires:
                raise HTTPException(status_code=400, detail="Reset link has expired. Please request a new one.")

        try:
            pw_hash = pwd_context.hash(req.password[:72])
        except Exception:
            import hashlib
            pw_hash = hashlib.sha256(req.password.encode()).hexdigest()

        conn.execute("UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?",
                     (pw_hash, user["id"]))
        conn.commit()
        return {"message": "Password reset successfully. You can now sign in."}
    finally:
        conn.close()


@router.post("/resend-verification")
def resend_verification(user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    try:
        row = conn.execute("SELECT email, email_verified FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not row:
            raise HTTPException(status_code=404)
        if row["email_verified"]:
            return {"message": "Email already verified"}
        verification_token = secrets.token_urlsafe(32)
        conn.execute("UPDATE users SET verification_token = ? WHERE id = ?", (verification_token, user["id"]))
        conn.commit()
        email_sent, email_err = send_verification_email(row["email"], verification_token)
        if not email_sent:
            return {"message": "Could not send verification email. Please try again later.", "email_sent": False, "email_error": email_err}
        return {"message": "Verification email sent", "email_sent": True}
    finally:
        conn.close()


@router.get("/me")
def get_me(user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db()
    try:
        row = conn.execute("SELECT id, email, name, created_at, email_verified FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not row:
            raise HTTPException(status_code=404)
        return {"id": row["id"], "email": row["email"], "name": row["name"], "created_at": row["created_at"], "email_verified": bool(row["email_verified"])}
    finally:
        conn.close()


@router.get("/interaction")
def check_interaction(request: Request, user=Depends(get_current_user)):
    if user:
        return {"count": 0, "soft_limit": SOFT_LIMIT, "hard_limit": HARD_LIMIT, "show_prompt": False, "force_signup": False, "remaining": 999999, "authenticated": True}
    ip = request.client.host
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    info = track_interaction(ip)
    info["authenticated"] = False
    return info

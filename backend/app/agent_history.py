from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .auth import get_current_user, get_db

router = APIRouter(prefix="/api/agent", tags=["agent-history"])


def init_agent_history_db() -> None:
    conn = get_db()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS agent_e2ee (
                user_id INTEGER PRIMARY KEY,
                salt TEXT NOT NULL,
                wrap_iv TEXT NOT NULL,
                wrapped_dek TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS agent_history (
                user_id INTEGER PRIMARY KEY,
                iv TEXT NOT NULL,
                ct TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_agent_e2ee_user_id ON agent_e2ee(user_id);
            CREATE INDEX IF NOT EXISTS idx_agent_history_user_id ON agent_history(user_id);
            """
        )
        conn.commit()
    finally:
        conn.close()


init_agent_history_db()


def _require_user(user):
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


class E2EEMeta(BaseModel):
    salt: str
    wrap_iv: str
    wrapped_dek: str


class E2EEMetaResponse(BaseModel):
    has_e2ee: bool
    meta: Optional[E2EEMeta] = None


class HistoryBlob(BaseModel):
    iv: str
    ct: str


class HistoryResponse(BaseModel):
    meta: E2EEMeta
    blob: Optional[HistoryBlob] = None


class PutHistoryRequest(BaseModel):
    blob: HistoryBlob


@router.get("/e2ee/meta", response_model=E2EEMetaResponse)
def get_e2ee_meta(user=Depends(get_current_user)):
    user = _require_user(user)
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT salt, wrap_iv, wrapped_dek FROM agent_e2ee WHERE user_id = ?",
            (int(user["id"]),),
        ).fetchone()
        if not row:
            return {"has_e2ee": False, "meta": None}
        return {
            "has_e2ee": True,
            "meta": {"salt": row["salt"], "wrap_iv": row["wrap_iv"], "wrapped_dek": row["wrapped_dek"]},
        }
    finally:
        conn.close()


@router.post("/e2ee/bootstrap", response_model=E2EEMetaResponse)
def bootstrap_e2ee(meta: E2EEMeta, user=Depends(get_current_user)):
    user = _require_user(user)
    conn = get_db()
    try:
        conn.execute(
            """
            INSERT INTO agent_e2ee (user_id, salt, wrap_iv, wrapped_dek, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
              salt=excluded.salt,
              wrap_iv=excluded.wrap_iv,
              wrapped_dek=excluded.wrapped_dek,
              updated_at=datetime('now')
            """,
            (int(user["id"]), meta.salt, meta.wrap_iv, meta.wrapped_dek),
        )
        conn.commit()
        return {"has_e2ee": True, "meta": meta.model_dump()}
    finally:
        conn.close()


@router.post("/e2ee/rewrap", response_model=E2EEMetaResponse)
def rewrap_e2ee(meta: E2EEMeta, user=Depends(get_current_user)):
    # Same as bootstrap, but semantically called after password changes.
    return bootstrap_e2ee(meta, user)


@router.get("/history", response_model=HistoryResponse)
def get_history(user=Depends(get_current_user)):
    user = _require_user(user)
    conn = get_db()
    try:
        meta_row = conn.execute(
            "SELECT salt, wrap_iv, wrapped_dek FROM agent_e2ee WHERE user_id = ?",
            (int(user["id"]),),
        ).fetchone()
        if not meta_row:
            raise HTTPException(status_code=404, detail="E2EE not initialized")

        hist_row = conn.execute(
            "SELECT iv, ct FROM agent_history WHERE user_id = ?",
            (int(user["id"]),),
        ).fetchone()

        resp = {
            "meta": {
                "salt": meta_row["salt"],
                "wrap_iv": meta_row["wrap_iv"],
                "wrapped_dek": meta_row["wrapped_dek"],
            },
            "blob": None,
        }
        if hist_row:
            resp["blob"] = {"iv": hist_row["iv"], "ct": hist_row["ct"]}
        return resp
    finally:
        conn.close()


@router.put("/history")
def put_history(req: PutHistoryRequest, user=Depends(get_current_user)):
    user = _require_user(user)
    conn = get_db()
    try:
        # Require E2EE meta to exist first.
        meta_row = conn.execute(
            "SELECT user_id FROM agent_e2ee WHERE user_id = ?",
            (int(user["id"]),),
        ).fetchone()
        if not meta_row:
            raise HTTPException(status_code=404, detail="E2EE not initialized")

        conn.execute(
            """
            INSERT INTO agent_history (user_id, iv, ct, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
              iv=excluded.iv,
              ct=excluded.ct,
              updated_at=datetime('now')
            """,
            (int(user["id"]), req.blob.iv, req.blob.ct),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


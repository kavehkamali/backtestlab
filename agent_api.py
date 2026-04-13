"""
Equilima AI Agent API — wraps TradingAgents with a REST endpoint.
Uses Ollama (local LLM) as the backend.

Deploy (example on home-linux):
  cd ~/projects/side/equilima
  source agent_env/bin/activate
  pip install -r requirements-agent.txt  # if you add one; else: pip install fastapi uvicorn pydantic requests
  python agent_api.py

Expects a sibling directory ./TradingAgents (clone https://github.com/TauricResearch/TradingAgents).
"""

from __future__ import annotations

import os
import sys
import traceback
from datetime import datetime
from typing import Any, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
import uvicorn

# ─── Resolve TradingAgents package ───
def _trading_agents_root() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    env = os.environ.get("TRADING_AGENTS_PATH", "").strip()
    if env and os.path.isdir(env):
        return os.path.abspath(env)
    a = os.path.join(here, "TradingAgents")
    if os.path.isdir(a):
        return a
    b = os.path.join(here, "..", "TradingAgents")
    if os.path.isdir(b):
        return os.path.abspath(b)
    return ""


_TA_ROOT = _trading_agents_root()
if _TA_ROOT:
    sys.path.insert(0, _TA_ROOT)

app = FastAPI(title="Equilima AI Agent")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class HistoryTurn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    role: str
    content: str


class ChatRequest(BaseModel):
    """`history` is optional multi-turn context from Equilima web UI."""

    model_config = ConfigDict(extra="ignore")
    message: str
    ticker: str = ""
    history: List[HistoryTurn] = Field(default_factory=list)


class ChatResponse(BaseModel):
    response: str
    ticker: str = ""
    analysis: dict = {}


def _last_user_line(packed_message: str) -> str:
    """If the client embedded prior turns, take only the final user line."""
    m = packed_message or ""
    if "Current user message:" in m:
        return m.split("Current user message:")[-1].strip()
    return m.strip()


def _format_history_block(history: List[HistoryTurn], max_turns: int = 14) -> str:
    if not history:
        return ""
    tail = history[-max_turns:]
    lines = []
    for h in tail:
        r = (h.role or "").lower()
        label = "User" if r == "user" else "Assistant"
        c = (h.content or "")[:8000]
        lines.append(f"{label}: {c}")
    return "\n\n".join(lines)


def _ollama_generate(prompt: str, timeout: int = 120) -> str:
    import requests

    model = os.environ.get("EQUILIMA_OLLAMA_MODEL", "gemma3:4b")
    ollama_resp = requests.post(
        "http://localhost:11434/api/generate",
        json={"model": model, "prompt": prompt, "stream": False},
        timeout=timeout,
    )
    ollama_resp.raise_for_status()
    result = ollama_resp.json()
    text = result.get("response", "")
    if "</think>" in text:
        text = text.split("</think>")[-1].strip()
    return text


# ─── TradingAgents setup ───
def get_trading_agent(ticker: str):
    """Create a TradingAgents instance configured for Ollama."""
    from tradingagents.graph.trading_graph import TradingAgentsGraph

    if not _TA_ROOT:
        raise RuntimeError("TradingAgents directory not found (set TRADING_AGENTS_PATH)")

    config = {
        "llm_provider": "openai",
        "deep_think_llm": os.environ.get("EQUILIMA_OLLAMA_MODEL", "gemma3:4b"),
        "quick_think_llm": os.environ.get("EQUILIMA_OLLAMA_MODEL", "gemma3:4b"),
        "backend_url": os.environ.get("OLLAMA_OPENAI_BASE", "http://localhost:11434/v1"),
        "max_debate_rounds": 1,
        "max_risk_discuss_rounds": 1,
        "max_recur_limit": 50,
        # Required by TradingAgentsGraph for cache paths
        "project_dir": _TA_ROOT,
    }

    return TradingAgentsGraph(
        config=config,
        selected_analysts=["market", "social", "news", "fundamentals"],
    )


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": os.environ.get("EQUILIMA_OLLAMA_MODEL", "gemma3:4b"),
        "backend": "ollama",
        "trading_agents_path": _TA_ROOT or None,
    }


@app.post("/chat")
async def chat(req: ChatRequest):
    """Process a trading/market question through the agent."""
    try:
        hist = _format_history_block(req.history)
        user_q = _last_user_line(req.message)

        ticker = (req.ticker or "").upper().strip()
        if not ticker:
            words = (user_q or req.message).upper().split()
            common_tickers = [
                "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "JPM", "V", "WMT",
            ]
            for w in words:
                clean = w.strip(".,?!")
                if clean in common_tickers or (
                    len(clean) <= 5 and clean.isalpha() and clean == clean.upper()
                ):
                    ticker = clean
                    break

        if not ticker:
            ticker = "AAPL"

        if not _TA_ROOT:
            raise RuntimeError("TradingAgents directory not found")

        ta = get_trading_agent(ticker)
        today = datetime.now().strftime("%Y-%m-%d")

        state = ta.propagate(ticker, today)

        final_decision = state.get("final_trade_decision", "No decision available")

        analysis: dict[str, Any] = {
            "ticker": ticker,
            "date": today,
            "decision": final_decision,
        }

        for key in [
            "market_report",
            "social_report",
            "news_report",
            "fundamentals_report",
            "bull_case",
            "bear_case",
            "debate_result",
            "risk_assessment",
        ]:
            if key in state and state[key]:
                analysis[key] = str(state[key])

        response = f"## Analysis for {ticker}\n\n"
        response += f"**Date:** {today}\n\n"
        response += f"### Decision\n{final_decision}\n\n"

        if hist:
            response += f"### Prior conversation (context)\n{hist[:1200]}\n\n"

        if "fundamentals_report" in analysis:
            response += f"### Fundamentals\n{analysis['fundamentals_report'][:500]}\n\n"
        if "news_report" in analysis:
            response += f"### News & Sentiment\n{analysis['news_report'][:500]}\n\n"
        if "bull_case" in analysis:
            response += f"### Bull Case\n{analysis['bull_case'][:300]}\n\n"
        if "bear_case" in analysis:
            response += f"### Bear Case\n{analysis['bear_case'][:300]}\n\n"
        if "risk_assessment" in analysis:
            response += f"### Risk Assessment\n{analysis['risk_assessment'][:300]}\n\n"

        return ChatResponse(response=response, ticker=ticker, analysis=analysis)

    except Exception as e:
        traceback.print_exc()
        try:
            today_str = datetime.now().strftime("%Y-%m-%d")
            hist = _format_history_block(req.history)
            user_q = _last_user_line(req.message)
            ctx = ""
            if hist:
                ctx = f"Prior chat (stay consistent with tickers and facts already stated):\n{hist}\n\n---\n\n"
            prompt = (
                f"You are a professional financial analyst. Today is {today_str}. "
                f"Use current/recent framing relative to today. Do not invent exact prices if unsure — say what you would verify and how.\n\n"
                f"{ctx}"
                f"User question:\n{user_q or req.message}\n\n"
                f"Answer in markdown."
            )
            text = _ollama_generate(prompt, timeout=120)
            return ChatResponse(response=text, ticker=req.ticker or "", analysis={})
        except Exception as e2:
            raise HTTPException(
                status_code=500,
                detail=f"Agent error: {str(e)}. Fallback error: {str(e2)}",
            ) from e2


@app.post("/quick")
async def quick_analysis(req: ChatRequest):
    """Quick direct LLM response without full agent pipeline (faster)."""
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        hist = _format_history_block(req.history)
        user_q = _last_user_line(req.message)
        core = user_q or req.message.strip()

        ctx = ""
        if hist:
            ctx = (
                "Earlier in this same chat session (use for continuity — same ticker, numbers, and claims):\n"
                f"{hist}\n\n---\n\n"
            )

        prompt = f"""You are Equilima AI, a professional financial analyst assistant.
Today's date is {today}. Stay consistent with any prior turns above. If the user asks a short follow-up (e.g. "why?" or "what about last month?"), tie it to that prior context.

{ctx}Current user message:
{core}

Give a concise, data-driven answer in markdown (headers, bullets, bold key numbers when you state them). If you lack live data, say so and give a methodology, not fabricated quotes."""

        text = _ollama_generate(prompt, timeout=120)
        return ChatResponse(response=text, ticker=req.ticker or "", analysis={})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("EQUILIMA_AGENT_PORT", "8888")))

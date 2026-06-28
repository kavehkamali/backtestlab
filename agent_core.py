"""
Equilima smart agent — OpenAI Agents SDK.

Turns the cheap OpenAI model into a tool-using agent that:
  1. answers the user's market/trading question, and
  2. decides the single best workspace tab to land them on (the "right act"),
     returning a typed `route` the frontend trusts over its regex fallback.

Tools fetch live data from the Equilima backend when EQUILIMA_BACKEND_URL is
reachable; otherwise they degrade gracefully so routing still works.

Env:
  OPENAI_API_KEY            required (loaded from repo .env by agent_api.py)
  EQUILIMA_OPENAI_MODEL     main agent model   (default gpt-5-nano)
  EQUILIMA_ROUTER_MODEL     fast routing model (default = main model)
  EQUILIMA_BACKEND_URL      backend base for tool data (default http://localhost:8080)
"""

from __future__ import annotations

import json
import os
from typing import List, Literal

import httpx
from pydantic import BaseModel, Field

from agents import (
    Agent,
    ModelSettings,
    Runner,
    function_tool,
    set_default_openai_key,
    set_tracing_disabled,
)
from openai.types.shared import Reasoning

OPENAI_MODEL = os.environ.get("EQUILIMA_OPENAI_MODEL", "gpt-5-nano").strip()
ROUTER_MODEL = os.environ.get("EQUILIMA_ROUTER_MODEL", OPENAI_MODEL).strip()
BACKEND_URL = os.environ.get("EQUILIMA_BACKEND_URL", "http://localhost:8080").rstrip("/")
# gpt-5 family are reasoning models — without a cap they "think" for tens of
# seconds (the UI shows "Thinking..." the whole time). 'low' keeps routing
# accurate while staying fast. Tools add a model round-trip each, so they are
# OFF by default for the snappy /quick path (the UI loads live data itself).
REASONING_EFFORT = os.environ.get("EQUILIMA_REASONING_EFFORT", "low").strip()
USE_TOOLS = os.environ.get("EQUILIMA_AGENT_TOOLS", "0").strip().lower() in ("1", "true", "yes")


def _fast_settings() -> ModelSettings:
    return ModelSettings(reasoning=Reasoning(effort=REASONING_EFFORT), verbosity="low")

_key = os.environ.get("OPENAI_API_KEY", "").strip()
if _key:
    set_default_openai_key(_key)
# Tracing would phone home to OpenAI per run; off for a cheap sidecar.
set_tracing_disabled(True)

Tab = Literal["overview", "research", "screener", "macro", "news"]


# ─── Structured output ───
class Route(BaseModel):
    """Where the UI should take the user, decided by the agent."""

    tab: Tab = Field(description="Best workspace tab for this request.")
    ticker: str = Field(description="Primary ticker symbol in focus, or '' if none.")
    research_subtab: Literal["fundamentals", "chart", "none"] = Field(
        description="If tab=research, which sub-view; else 'none'."
    )
    reason: str = Field(description="One short sentence: why this tab.")


class AgentOutput(BaseModel):
    answer: str = Field(description="The markdown answer for the chat panel.")
    route: Route
    tickers: List[str] = Field(description="All tickers referenced (symbols, uppercase).")


# ─── Backend data tools ───
def _get(path: str, params: dict | None = None) -> dict | list | None:
    try:
        with httpx.Client(timeout=12.0) as client:
            r = client.get(f"{BACKEND_URL}{path}", params=params or {})
            if r.status_code >= 400:
                return None
            return r.json()
    except Exception:
        return None


def _post(path: str, body: dict) -> dict | list | None:
    try:
        with httpx.Client(timeout=20.0) as client:
            r = client.post(f"{BACKEND_URL}{path}", json=body)
            if r.status_code >= 400:
                return None
            return r.json()
    except Exception:
        return None


@function_tool
def research_ticker(ticker: str) -> str:
    """Fetch fundamentals, price summary and quality metrics for one ticker.
    Call when the user asks to analyze/research/value a specific company."""
    data = _get(f"/api/research/{ticker.upper().strip()}")
    if not data:
        return f"No live research available for {ticker}. Answer from general knowledge."
    summary = data.get("summary", {}) if isinstance(data, dict) else {}
    return json.dumps({"ticker": ticker.upper(), "summary": summary})[:4000]


@function_tool
def price_chart(ticker: str) -> str:
    """Fetch recent price action for a ticker. Call for chart/technical/trend questions."""
    data = _get(f"/api/research/{ticker.upper().strip()}")
    chart = (data or {}).get("chart") if isinstance(data, dict) else None
    if not chart:
        return f"No chart data for {ticker}."
    pts = chart[-30:]
    return json.dumps({"ticker": ticker.upper(), "recent_closes": [p.get("close") for p in pts]})[:3000]


@function_tool
def screen_stocks(query: str) -> str:
    """Run a stock screen. Call when the user wants to find/filter/scan a LIST of stocks
    (oversold, momentum, value, dividends, small caps, short squeeze, etc.)."""
    data = _post("/api/screener", {"list_id": "sp500",
                                    "strategies": ["sma_crossover", "rsi", "macd", "momentum"]})
    rows = (data or {}).get("results", []) if isinstance(data, dict) else []
    top = [{"symbol": r.get("symbol"), "buy_count": r.get("buy_count"),
            "rsi": r.get("rsi"), "change_20d": r.get("change_20d")} for r in rows[:15]]
    return json.dumps({"query": query, "candidates": top})[:4000]


@function_tool
def macro_overview() -> str:
    """Fetch the macro dashboard (rates, inflation, jobs, commodities, indices, crypto).
    Call for fed/rates/CPI/jobs/oil/gold/dollar/recession questions with no single ticker."""
    data = _get("/api/macro")
    if not data:
        return "No live macro data."
    return json.dumps(data)[:4000]


@function_tool
def latest_news(symbols: str) -> str:
    """Fetch recent headlines. `symbols` is a comma list (or '' for broad market).
    Call for catalysts / 'what happened' / 'why did X move' / 'today's news' questions."""
    data = _get("/api/news", {"symbols": symbols or ""})
    if not data:
        return "No live news."
    return json.dumps(data)[:4000]


# ─── Agents ───
_INSTRUCTIONS = """You are Equilima AI, a sharp, concise financial analyst embedded in a trading research app.

Your job has two parts every turn:
1. ANSWER the user's question well, in markdown. Lead with the practical takeaway
   (buy/avoid/watch, level, catalyst, risk, metric). 3-6 tight bullets or a short
   paragraph. No generic investing disclaimers, no filler. Use ticker SYMBOLS explicitly.
2. ROUTE: pick the single workspace tab that best serves what the user wants to DO next:
   - research : analyze ONE asset of ANY class — a stock, crypto, commodity, ETF, index, or currency
       (valuation, price, fundamentals, "should I buy AAPL", "how is bitcoin", "gold price", "SPY").
       set research_subtab='chart' for price/technical/trend/support questions, else 'fundamentals'.
       Put the canonical Yahoo Finance symbol in `ticker`: stocks AAPL; crypto BTC-USD, ETH-USD, SOL-USD;
       commodities gold=GC=F, silver=SI=F, crude oil=CL=F, brent=BZ=F, natural gas=NG=F, copper=HG=F;
       indices S&P 500=^GSPC, Nasdaq=^IXIC, Dow=^DJI, VIX=^VIX; currencies EUR/USD=EURUSD=X; ETFs SPY, QQQ, GLD.
   - screener : find/filter a LIST of stocks (oversold, momentum, value, dividends, small caps...).
   - macro    : rates, fed, inflation, jobs, commodities, dollar, crypto, recession — no single ticker.
   - news     : catalysts, headlines, "what happened", "why did it move", "today".
   - overview : greetings, vague, or multi-topic where no single tab dominates.

If tools are available, use the one matching the tab you will route to, to ground
the answer in live data; otherwise answer from your knowledge and state when a number
needs live confirmation. Be fast and decisive. Always fill `ticker` with the primary
symbol (or '') and list every referenced symbol in `tickers`."""

_ROUTER_INSTRUCTIONS = """Classify the user's latest message into ONE workspace tab and primary symbol.
Tabs: research (ONE asset of any class — stock, crypto, commodity, ETF, index, or currency),
screener (find a LIST of stocks), macro (broad rates/jobs/economy with NO single asset in focus),
news (headlines/catalysts/'why moved'), overview (vague/greeting/multi-topic).
A single named crypto/commodity/index/ETF (bitcoin, gold, oil, S&P 500, SPY) => research, NOT macro.
Put the canonical Yahoo Finance symbol in `ticker`: crypto BTC-USD/ETH-USD/SOL-USD; commodities gold=GC=F,
silver=SI=F, oil=CL=F, natural gas=NG=F, copper=HG=F; indices ^GSPC/^IXIC/^DJI/^VIX; EUR/USD=EURUSD=X; ETFs SPY/QQQ/GLD.
If tab=research set research_subtab='chart' for price/technical/trend questions else 'fundamentals', else 'none'.
Return ticker='' when no single asset is in focus. One short sentence reason. Set answer='' (routing only)."""


def build_agent() -> Agent:
    return Agent(
        name="Equilima Analyst",
        instructions=_INSTRUCTIONS,
        model=OPENAI_MODEL,
        model_settings=_fast_settings(),
        tools=[research_ticker, price_chart, screen_stocks, macro_overview, latest_news] if USE_TOOLS else [],
        output_type=AgentOutput,
    )


def build_router() -> Agent:
    # No tools, fast model: just the structured routing decision.
    return Agent(
        name="Equilima Router",
        instructions=_ROUTER_INSTRUCTIONS,
        model=ROUTER_MODEL,
        model_settings=_fast_settings(),
        output_type=Route,
    )


_AGENT: Agent | None = None
_ROUTER: Agent | None = None


def _agent() -> Agent:
    global _AGENT
    if _AGENT is None:
        _AGENT = build_agent()
    return _AGENT


def _router() -> Agent:
    global _ROUTER
    if _ROUTER is None:
        _ROUTER = build_router()
    return _ROUTER


def _to_input(message: str, history: list[dict] | None) -> list[dict]:
    items: list[dict] = []
    for h in (history or [])[-12:]:
        role = "user" if (h.get("role") or "").lower() == "user" else "assistant"
        content = str(h.get("content") or "")[:6000]
        if content:
            items.append({"role": role, "content": content})
    items.append({"role": "user", "content": message})
    return items


async def run_agent(message: str, history: list[dict] | None = None, ticker: str = "") -> dict:
    """Full smart agent: grounded answer + routing decision."""
    result = await Runner.run(_agent(), _to_input(message, history), max_turns=8)
    out: AgentOutput = result.final_output_as(AgentOutput)
    route = out.route
    return {
        "response": out.answer,
        "ticker": (route.ticker or ticker or "").upper(),
        "tickers": [t.upper() for t in (out.tickers or []) if t],
        "route": {
            "tab": route.tab,
            "ticker": (route.ticker or "").upper(),
            "researchSubtab": None if route.research_subtab == "none" else route.research_subtab,
            "reason": route.reason,
        },
        "analysis": {},
    }


async def run_router(message: str, history: list[dict] | None = None) -> dict:
    """Fast routing only — for instant tab switch on send."""
    result = await Runner.run(_router(), _to_input(message, history), max_turns=2)
    route: Route = result.final_output_as(Route)
    return {
        "tab": route.tab,
        "ticker": (route.ticker or "").upper(),
        "researchSubtab": None if route.research_subtab == "none" else route.research_subtab,
        "reason": route.reason,
    }

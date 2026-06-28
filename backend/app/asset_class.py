"""
Asset-class detection so the research page can adapt per equity type.

Classes: stock | etf | crypto | commodity | index | forex | bond.
Primary signal is yfinance `info['quoteType']`; symbol-suffix heuristics are
the fallback when info is missing (offline/partial).
"""

from __future__ import annotations

# yfinance quoteType -> our class
_QUOTE_TYPE_MAP = {
    "EQUITY": "stock",
    "ETF": "etf",
    "MUTUALFUND": "etf",
    "INDEX": "index",
    "CURRENCY": "forex",
    "CRYPTOCURRENCY": "crypto",
    "FUTURE": "commodity",
    "COMMODITY": "commodity",
}

# A few index/yield symbols that are really bonds.
_BOND_SYMBOLS = {"^TNX", "^TYX", "^IRX", "^FVX"}


def detect_asset_class(symbol: str, info: dict | None = None) -> str:
    s = (symbol or "").upper().strip()

    # Suffix heuristics first — cheap and unambiguous.
    if s in _BOND_SYMBOLS:
        return "bond"
    if s.endswith("=F"):
        return "commodity"
    if s.endswith("=X"):
        return "forex"
    if s.endswith("-USD") or s.endswith("-USDT"):
        return "crypto"
    if s.startswith("^"):
        return "index"

    # Then the authoritative quoteType from yfinance.
    qt = str((info or {}).get("quoteType", "")).upper()
    if qt in _QUOTE_TYPE_MAP:
        return _QUOTE_TYPE_MAP[qt]

    return "stock"


# Display labels for the UI / agent.
ASSET_CLASS_LABELS = {
    "stock": "Stock",
    "etf": "ETF / Fund",
    "crypto": "Crypto",
    "commodity": "Commodity",
    "index": "Index",
    "forex": "Currency",
    "bond": "Bond / Yield",
}

"""Build the collection universe and persist it into `symbols`.

Stocks come from the existing stock_lists (SP500 + mid/small + TSX60); the
non-stock asset classes (ETF/crypto/commodity/index/bond/forex) mirror the
adaptive-research asset index. CIKs for US filers are resolved from SEC's
official company_tickers.json so the EDGAR collector can look them up.
"""

from __future__ import annotations

import os

import httpx

from .db import connect

SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"


def _sec_user_agent() -> str:
    # SEC requires a descriptive UA with contact info.
    return os.environ.get("SEC_USER_AGENT", "Equilima Research data@equilima.com")


# Non-stock assets to track (canonical Yahoo symbols), mirrors the research index.
ASSET_CLASS_SYMBOLS: dict[str, list[tuple[str, str]]] = {
    "etf": [
        # Broad market
        ("SPY", "SPDR S&P 500 ETF"), ("VOO", "Vanguard S&P 500 ETF"),
        ("IVV", "iShares Core S&P 500 ETF"), ("QQQ", "Invesco QQQ Trust"),
        ("VTI", "Vanguard Total Stock Market ETF"), ("IWM", "iShares Russell 2000 ETF"),
        ("DIA", "SPDR Dow Jones ETF"), ("VEA", "Vanguard Developed Markets ETF"),
        ("VWO", "Vanguard Emerging Markets ETF"), ("EFA", "iShares MSCI EAFE ETF"),
        ("EEM", "iShares MSCI Emerging Markets ETF"), ("ACWI", "iShares MSCI ACWI ETF"),
        # Style / factor
        ("VUG", "Vanguard Growth ETF"), ("VTV", "Vanguard Value ETF"),
        ("IWF", "iShares Russell 1000 Growth ETF"), ("IWD", "iShares Russell 1000 Value ETF"),
        ("SCHD", "Schwab US Dividend Equity ETF"), ("VIG", "Vanguard Dividend Appreciation ETF"),
        ("VYM", "Vanguard High Dividend Yield ETF"), ("MTUM", "iShares MSCI Momentum ETF"),
        ("USMV", "iShares MSCI Min Vol USA ETF"), ("QUAL", "iShares MSCI Quality ETF"),
        # Sector SPDRs
        ("XLK", "Technology Select Sector SPDR"), ("XLF", "Financial Select Sector SPDR"),
        ("XLE", "Energy Select Sector SPDR"), ("XLV", "Health Care Select Sector SPDR"),
        ("XLI", "Industrial Select Sector SPDR"), ("XLY", "Consumer Discretionary SPDR"),
        ("XLP", "Consumer Staples Select SPDR"), ("XLU", "Utilities Select Sector SPDR"),
        ("XLB", "Materials Select Sector SPDR"), ("XLRE", "Real Estate Select SPDR"),
        ("XLC", "Communication Services SPDR"),
        # Thematic / growth
        ("SMH", "VanEck Semiconductor ETF"), ("SOXX", "iShares Semiconductor ETF"),
        ("ARKK", "ARK Innovation ETF"), ("XBI", "SPDR S&P Biotech ETF"),
        ("IBB", "iShares Biotechnology ETF"), ("KWEB", "KraneShares China Internet ETF"),
        ("ICLN", "iShares Global Clean Energy ETF"), ("TAN", "Invesco Solar ETF"),
        ("LIT", "Global X Lithium & Battery ETF"),
        # Bonds
        ("TLT", "20+ Year Treasury Bond ETF"), ("IEF", "7-10 Year Treasury Bond ETF"),
        ("SHY", "1-3 Year Treasury Bond ETF"), ("AGG", "iShares Core US Aggregate Bond ETF"),
        ("BND", "Vanguard Total Bond Market ETF"), ("LQD", "Investment Grade Corp Bond ETF"),
        ("HYG", "iShares High Yield Corp Bond ETF"), ("TIP", "iShares TIPS Bond ETF"),
        ("MUB", "iShares National Muni Bond ETF"),
        # Commodity / real assets
        ("GLD", "SPDR Gold Shares"), ("IAU", "iShares Gold Trust"),
        ("SLV", "iShares Silver Trust"), ("USO", "United States Oil Fund"),
        ("UNG", "United States Natural Gas Fund"), ("DBC", "Invesco DB Commodity ETF"),
        ("VNQ", "Vanguard Real Estate ETF"), ("IYR", "iShares US Real Estate ETF"),
        # International single-country
        ("FXI", "iShares China Large-Cap ETF"), ("EWZ", "iShares MSCI Brazil ETF"),
        ("EWJ", "iShares MSCI Japan ETF"), ("INDA", "iShares MSCI India ETF"),
        ("EWG", "iShares MSCI Germany ETF"), ("EWU", "iShares MSCI United Kingdom ETF"),
    ],
    "crypto": [
        ("BTC-USD", "Bitcoin"), ("ETH-USD", "Ethereum"), ("BNB-USD", "BNB"),
        ("SOL-USD", "Solana"), ("XRP-USD", "XRP"), ("ADA-USD", "Cardano"),
        ("DOGE-USD", "Dogecoin"), ("AVAX-USD", "Avalanche"), ("TRX-USD", "TRON"),
        ("DOT-USD", "Polkadot"), ("LINK-USD", "Chainlink"), ("MATIC-USD", "Polygon"),
        ("LTC-USD", "Litecoin"), ("BCH-USD", "Bitcoin Cash"), ("XLM-USD", "Stellar"),
        ("UNI-USD", "Uniswap"), ("ATOM-USD", "Cosmos"), ("ETC-USD", "Ethereum Classic"),
        ("XMR-USD", "Monero"), ("NEAR-USD", "NEAR Protocol"), ("APT-USD", "Aptos"),
        ("ARB-USD", "Arbitrum"), ("OP-USD", "Optimism"), ("FIL-USD", "Filecoin"),
        ("ICP-USD", "Internet Computer"), ("HBAR-USD", "Hedera"), ("VET-USD", "VeChain"),
        ("ALGO-USD", "Algorand"), ("AAVE-USD", "Aave"), ("MKR-USD", "Maker"),
        ("SHIB-USD", "Shiba Inu"), ("PEPE-USD", "Pepe"),
    ],
    "commodity": [
        # Metals
        ("GC=F", "Gold futures"), ("SI=F", "Silver futures"), ("HG=F", "Copper futures"),
        ("PL=F", "Platinum futures"), ("PA=F", "Palladium futures"),
        # Energy
        ("CL=F", "WTI crude oil futures"), ("BZ=F", "Brent crude futures"),
        ("NG=F", "Natural gas futures"), ("RB=F", "RBOB gasoline futures"),
        ("HO=F", "Heating oil futures"),
        # Grains / oilseeds
        ("ZC=F", "Corn futures"), ("ZW=F", "Wheat futures"), ("ZS=F", "Soybean futures"),
        ("ZM=F", "Soybean meal futures"), ("ZL=F", "Soybean oil futures"),
        ("ZO=F", "Oats futures"),
        # Softs
        ("KC=F", "Coffee futures"), ("SB=F", "Sugar futures"), ("CC=F", "Cocoa futures"),
        ("CT=F", "Cotton futures"), ("OJ=F", "Orange juice futures"),
        # Livestock
        ("LE=F", "Live cattle futures"), ("HE=F", "Lean hogs futures"),
        ("GF=F", "Feeder cattle futures"),
    ],
    "index": [
        # US
        ("^GSPC", "S&P 500 Index"), ("^IXIC", "Nasdaq Composite"),
        ("^NDX", "Nasdaq 100"), ("^DJI", "Dow Jones Industrial Average"),
        ("^RUT", "Russell 2000"), ("^VIX", "CBOE Volatility Index"),
        ("^GSPTSE", "S&P/TSX Composite"),
        # Europe
        ("^FTSE", "FTSE 100"), ("^GDAXI", "DAX (Germany)"), ("^FCHI", "CAC 40 (France)"),
        ("^STOXX50E", "Euro Stoxx 50"), ("^IBEX", "IBEX 35 (Spain)"), ("^N100", "Euronext 100"),
        # Asia-Pacific
        ("^N225", "Nikkei 225"), ("^HSI", "Hang Seng"), ("000001.SS", "Shanghai Composite"),
        ("^BSESN", "BSE Sensex"), ("^NSEI", "Nifty 50"), ("^KS11", "KOSPI (Korea)"),
        ("^TWII", "Taiwan Weighted"), ("^AXJO", "S&P/ASX 200"),
        # Latin America
        ("^BVSP", "Bovespa (Brazil)"), ("^MXX", "IPC (Mexico)"),
    ],
    "bond": [
        ("^IRX", "US 13-Week Treasury Yield"), ("^FVX", "US 5Y Treasury Yield"),
        ("^TNX", "US 10Y Treasury Yield"), ("^TYX", "US 30Y Treasury Yield"),
    ],
    "forex": [
        # Majors
        ("EURUSD=X", "EUR/USD"), ("USDJPY=X", "USD/JPY"), ("GBPUSD=X", "GBP/USD"),
        ("USDCHF=X", "USD/CHF"), ("USDCAD=X", "USD/CAD"), ("AUDUSD=X", "AUD/USD"),
        ("NZDUSD=X", "NZD/USD"),
        # Crosses
        ("EURGBP=X", "EUR/GBP"), ("EURJPY=X", "EUR/JPY"), ("GBPJPY=X", "GBP/JPY"),
        ("EURCHF=X", "EUR/CHF"), ("AUDJPY=X", "AUD/JPY"), ("EURAUD=X", "EUR/AUD"),
        # EM / other
        ("USDCNY=X", "USD/CNY"), ("USDINR=X", "USD/INR"), ("USDMXN=X", "USD/MXN"),
        ("USDBRL=X", "USD/BRL"), ("USDKRW=X", "USD/KRW"), ("USDSGD=X", "USD/SGD"),
        ("USDZAR=X", "USD/ZAR"), ("USDTRY=X", "USD/TRY"),
        ("DX-Y.NYB", "US Dollar Index"),
    ],
}


def _stock_symbols() -> list[str]:
    try:
        from .. import stock_lists as sl
    except ImportError:
        import stock_lists as sl  # when app/ is on sys.path directly

    seen: list[str] = []
    s: set[str] = set()
    for name in ("SP500", "MID_CAPS", "SMALL_CAPS", "TSX60"):
        for sym in getattr(sl, name, []) or []:
            u = str(sym).strip().upper()
            if u and u not in s:
                s.add(u)
                seen.append(u)
    return seen


def _fetch_cik_map() -> dict[str, str]:
    """ticker(upper) -> zero-padded 10-digit CIK, from SEC."""
    try:
        with httpx.Client(timeout=30.0, headers={"User-Agent": _sec_user_agent()}) as c:
            r = c.get(SEC_TICKERS_URL)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        print(f"[universe] SEC ticker map fetch failed: {e}")
        return {}
    out: dict[str, str] = {}
    for row in (data.values() if isinstance(data, dict) else data):
        t = str(row.get("ticker", "")).strip().upper()
        cik = row.get("cik_str")
        if t and cik is not None:
            out[t] = str(int(cik)).zfill(10)
    return out


def build_universe(full_market: bool | None = None) -> int:
    # Full market = every SEC-registered US-listed ticker (whole NASDAQ/NYSE/AMEX,
    # ~10k+). Default on; set EQUILIMA_FULL_UNIVERSE=0 to use the curated lists.
    if full_market is None:
        full_market = os.environ.get("EQUILIMA_FULL_UNIVERSE", "1").strip().lower() not in ("0", "false", "no", "")

    curated = _stock_symbols()
    cik_map = _fetch_cik_map()

    # SEC tickers use dots for share classes (BRK.B); yfinance wants dashes
    # (BRK-B). Curated symbols keep exchange suffixes like RY.TO untouched.
    rows: list[tuple] = []
    seen: set[str] = set()
    # 7th field = intraday flag: curated stocks + non-stock asset classes get
    # intraday bars; the broad full-market extras do not (too many to poll).
    for sym in curated:
        if sym not in seen:
            seen.add(sym)
            rows.append((sym, None, "stock", cik_map.get(sym), None, "USD", True))
    if full_market and cik_map:
        for sec_sym, cik in cik_map.items():
            yf_sym = sec_sym.replace(".", "-")
            if yf_sym not in seen:
                seen.add(yf_sym)
                rows.append((yf_sym, None, "stock", cik, None, "USD", False))
    for asset_class, items in ASSET_CLASS_SYMBOLS.items():
        for sym, name in items:
            rows.append((sym, name, asset_class, None, None, "USD", True))

    con = connect()
    try:
        con.executemany(
            """
            INSERT INTO symbols (symbol, name, asset_class, cik, exchange, currency, intraday)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (symbol) DO UPDATE SET
                name        = COALESCE(excluded.name, symbols.name),
                asset_class = excluded.asset_class,
                cik         = COALESCE(excluded.cik, symbols.cik),
                intraday    = excluded.intraday OR symbols.intraday,
                active      = TRUE
            """,
            rows,
        )
        n = con.execute("SELECT count(*) FROM symbols").fetchone()[0]
    finally:
        con.close()
    print(f"[universe] upserted {len(rows)} symbols; total in warehouse: {n} "
          f"(CIKs resolved: {sum(1 for r in rows if r[3])})")
    return n


if __name__ == "__main__":
    build_universe()

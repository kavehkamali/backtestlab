"""SEC EDGAR collector (non-LLM, Track A) — official, free US-gov API.

- companyfacts -> fundamentals_facts (curated high-value XBRL tags by default).
- submissions  -> filings (8-K/10-K/10-Q index with primary-doc URLs).

Filing/press-release TEXT bodies are NOT bulk-fetched here; `fetch_filing_text`
is provided for the deferred LLM-summary track to pull on demand.

SEC fair access: send a descriptive User-Agent and stay <=10 req/s.
"""

from __future__ import annotations

import os
import time
from datetime import datetime

import httpx

from ..db import connect

_MIN_INTERVAL = 1.0 / 8.0  # ~8 req/s, under SEC's 10/s ceiling
_last_req = [0.0]

# Curated, broadly-useful facts. Set EQUILIMA_EDGAR_ALL_TAGS=1 to store everything.
CURATED_TAGS = {
    "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax",
    "CostOfRevenue", "GrossProfit", "OperatingIncomeLoss", "NetIncomeLoss",
    "ResearchAndDevelopmentExpense", "OperatingExpenses",
    "EarningsPerShareBasic", "EarningsPerShareDiluted",
    "Assets", "AssetsCurrent", "Liabilities", "LiabilitiesCurrent",
    "StockholdersEquity", "CashAndCashEquivalentsAtCarryingValue",
    "LongTermDebtNoncurrent", "LongTermDebt",
    "NetCashProvidedByUsedInOperatingActivities",
    "PaymentsToAcquirePropertyPlantAndEquipment", "Dividends",
    "CommonStockSharesOutstanding", "WeightedAverageNumberOfDilutedSharesOutstanding",
}

EDGAR_BASE = "https://data.sec.gov"


def _ua() -> str:
    return os.environ.get("SEC_USER_AGENT", "Equilima Research data@equilima.com")


def _get(client: httpx.Client, url: str):
    wait = _MIN_INTERVAL - (time.monotonic() - _last_req[0])
    if wait > 0:
        time.sleep(wait)
    _last_req[0] = time.monotonic()
    r = client.get(url)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()


def _company_facts(client, cik: str, symbol: str, all_tags: bool) -> list[tuple]:
    data = _get(client, f"{EDGAR_BASE}/api/xbrl/companyfacts/CIK{cik}.json")
    if not data:
        return []
    rows: list[tuple] = []
    for taxonomy, tags in (data.get("facts") or {}).items():
        for tag, body in tags.items():
            if not all_tags and tag not in CURATED_TAGS:
                continue
            for unit, points in (body.get("units") or {}).items():
                for p in points:
                    end = p.get("end")
                    if not end or p.get("val") is None:
                        continue
                    # PK columns must be non-null in DuckDB — coerce missing
                    # fy/fp/accn so a fact without them doesn't fail the batch.
                    rows.append((cik, symbol, taxonomy, tag, unit,
                                 int(p["fy"]) if p.get("fy") is not None else 0,
                                 p.get("fp") or "NA", end, _f(p.get("val")),
                                 p.get("form") or "NA", p.get("filed"), p.get("accn") or "NA"))
    return rows


def _submissions(client, cik: str, symbol: str) -> list[tuple]:
    data = _get(client, f"{EDGAR_BASE}/submissions/CIK{cik}.json")
    if not data:
        return []
    recent = (data.get("filings") or {}).get("recent") or {}
    accs = recent.get("accessionNumber", [])
    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    reports = recent.get("reportDate", [])
    docs = recent.get("primaryDocument", [])
    descs = recent.get("primaryDocDescription", [])
    def _at(arr, i):
        v = arr[i] if i < len(arr) else None
        return v or None  # "" -> None so empty dates don't break the DATE cast

    rows: list[tuple] = []
    for i, acc in enumerate(accs):
        acc_nodash = acc.replace("-", "")
        doc = _at(docs, i)
        url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc_nodash}/{doc}" if doc else None
        rows.append((cik, symbol, acc, _at(forms, i), _at(dates, i),
                     _at(reports, i), url, _at(descs, i)))
    return rows


def fetch_filing_text(accession: str, doc_url: str) -> str:
    """On-demand raw text of a filing's primary document (for Track B / LLM)."""
    with httpx.Client(timeout=30.0, headers={"User-Agent": _ua()}) as c:
        r = c.get(doc_url)
        r.raise_for_status()
        return r.text


def _f(v):
    try:
        f = float(v)
        return None if f != f else f
    except (TypeError, ValueError):
        return None


def collect_edgar(symbols: list[str] | None = None, max_companies: int | None = None) -> dict:
    all_tags = os.environ.get("EQUILIMA_EDGAR_ALL_TAGS", "").strip() in ("1", "true", "yes")
    con = connect()
    started = datetime.utcnow()
    fact_n = filing_n = 0
    note = ""
    try:
        q = "SELECT symbol, cik FROM symbols WHERE cik IS NOT NULL AND active"
        rows = con.execute(q).fetchall()
        if symbols:
            want = {s.upper() for s in symbols}
            rows = [r for r in rows if r[0].upper() in want]
        if max_companies:
            rows = rows[:max_companies]

        with httpx.Client(timeout=40.0, headers={"User-Agent": _ua(),
                                                 "Accept-Encoding": "gzip, deflate"}) as client:
            for i, (symbol, cik) in enumerate(rows):
                try:
                    facts = _company_facts(client, cik, symbol, all_tags)
                    if facts:
                        con.executemany(
                            """INSERT INTO fundamentals_facts
                               (cik,symbol,taxonomy,tag,unit,fy,fp,period_end,value,form,filed,accn)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                               ON CONFLICT (cik,taxonomy,tag,unit,period_end,fy,fp,accn) DO UPDATE SET
                                 value=excluded.value, filed=excluded.filed, symbol=excluded.symbol""",
                            facts)
                        fact_n += len(facts)
                    fil = _submissions(client, cik, symbol)
                    if fil:
                        con.executemany(
                            """INSERT INTO filings
                               (cik,symbol,accession,form,filed,period,primary_doc_url,title)
                               VALUES (?,?,?,?,?,?,?,?)
                               ON CONFLICT (accession) DO UPDATE SET
                                 form=excluded.form, primary_doc_url=excluded.primary_doc_url""",
                            fil)
                        filing_n += len(fil)
                except Exception as e:
                    note += f"{symbol}:{type(e).__name__}; "
                if (i + 1) % 25 == 0:
                    print(f"[edgar] {i+1}/{len(rows)} companies, {fact_n} facts, {filing_n} filings")
        con.execute(
            """INSERT INTO collector_runs (collector,started_at,finished_at,ok,rows,note)
               VALUES ('edgar',?,?,?,?,?)""",
            [started, datetime.utcnow(), True, fact_n + filing_n, note[:2000]])
    finally:
        con.close()
    print(f"[edgar] done: {fact_n} facts, {filing_n} filings")
    return {"facts": fact_n, "filings": filing_n}


if __name__ == "__main__":
    import sys
    syms = [a for a in sys.argv[1:] if not a.startswith("--")] or None
    collect_edgar(syms, max_companies=3 if syms is None else None)

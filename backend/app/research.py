from __future__ import annotations
"""
Seeking Alpha-style research data endpoints.
Comprehensive stock analysis: summary, financials, earnings, dividends, peers, ratings.
"""

from fastapi import APIRouter, HTTPException
import yfinance as yf
import pandas as pd
import numpy as np
import math
from .cache import fetch_price_cached, fetch_fundamentals_cached

router = APIRouter(prefix="/api/research", tags=["research"])


def _safe(val, decimals=2):
    if val is None or (isinstance(val, float) and (math.isnan(val) or math.isinf(val))):
        return None
    if isinstance(val, (int, np.integer)):
        return int(val)
    if isinstance(val, (float, np.floating)):
        return round(float(val), decimals)
    return val


def _fmt_large(v):
    if v is None:
        return None
    v = float(v)
    if abs(v) >= 1e12:
        return f"${v/1e12:.2f}T"
    if abs(v) >= 1e9:
        return f"${v/1e9:.2f}B"
    if abs(v) >= 1e6:
        return f"${v/1e6:.1f}M"
    return f"${v:,.0f}"


def _grade(value, thresholds, reverse=False):
    """Assign A-F grade based on value and thresholds [F,D,C,B,A]."""
    if value is None:
        return {"grade": "N/A", "score": None}
    grades = ["F", "D", "C", "B", "A"] if not reverse else ["A", "B", "C", "D", "F"]
    for i, t in enumerate(thresholds):
        if value < t:
            return {"grade": grades[i], "score": _safe(value)}
    return {"grade": grades[-1], "score": _safe(value)}


@router.get("/{symbol}")
def get_research(symbol: str):
    """Full research — shared cache per symbol."""
    from .shared_cache import get_or_compute, RESEARCH_TTL
    return get_or_compute(f"research_{symbol.upper()}", RESEARCH_TTL, lambda: _research_compute(symbol))


def _research_compute(symbol: str):
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info or {}

        # ─── Summary / Key Stats ───
        price = _safe(info.get("currentPrice") or info.get("regularMarketPrice"))
        prev_close = _safe(info.get("previousClose") or info.get("regularMarketPreviousClose"))
        change = round(price - prev_close, 2) if price and prev_close else None
        change_pct = round((change / prev_close) * 100, 2) if change and prev_close else None

        summary = {
            "symbol": symbol,
            "name": info.get("longName") or info.get("shortName") or symbol,
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "description": info.get("longBusinessSummary", ""),
            "website": info.get("website"),
            "employees": info.get("fullTimeEmployees"),
            "country": info.get("country"),
            "exchange": info.get("exchange"),
            "currency": info.get("currency", "USD"),
            "price": price,
            "previous_close": prev_close,
            "change": change,
            "change_pct": change_pct,
            "open": _safe(info.get("open")),
            "day_high": _safe(info.get("dayHigh")),
            "day_low": _safe(info.get("dayLow")),
            "high_52w": _safe(info.get("fiftyTwoWeekHigh")),
            "low_52w": _safe(info.get("fiftyTwoWeekLow")),
            "market_cap": info.get("marketCap"),
            "market_cap_fmt": _fmt_large(info.get("marketCap")),
            "enterprise_value": info.get("enterpriseValue"),
            "enterprise_value_fmt": _fmt_large(info.get("enterpriseValue")),
            "volume": info.get("volume"),
            "avg_volume": info.get("averageVolume"),
            "avg_volume_10d": info.get("averageVolume10days"),
            "beta": _safe(info.get("beta")),
            "pe_trailing": _safe(info.get("trailingPE")),
            "pe_forward": _safe(info.get("forwardPE")),
            "peg_ratio": _safe(info.get("pegRatio")),
            "price_to_sales": _safe(info.get("priceToSalesTrailing12Months")),
            "price_to_book": _safe(info.get("priceToBook")),
            "ev_to_revenue": _safe(info.get("enterpriseToRevenue")),
            "ev_to_ebitda": _safe(info.get("enterpriseToEbitda")),
            "eps_trailing": _safe(info.get("trailingEps")),
            "eps_forward": _safe(info.get("forwardEps")),
            "dividend_rate": _safe(info.get("dividendRate")),
            "dividend_yield": _safe(info.get("dividendYield"), 4),
            "dividend_yield_pct": round(info.get("dividendYield", 0) * 100, 2) if info.get("dividendYield") else None,
            "ex_dividend_date": info.get("exDividendDate"),
            "payout_ratio": _safe(info.get("payoutRatio"), 4),
            "target_mean": _safe(info.get("targetMeanPrice")),
            "target_high": _safe(info.get("targetHighPrice")),
            "target_low": _safe(info.get("targetLowPrice")),
            "analyst_count": info.get("numberOfAnalystOpinions"),
            "recommendation": info.get("recommendationKey"),
            "recommendation_mean": _safe(info.get("recommendationMean")),
        }

        # ─── Profitability ───
        profitability = {
            "profit_margin": _safe(info.get("profitMargins"), 4),
            "profit_margin_pct": round(info.get("profitMargins", 0) * 100, 2) if info.get("profitMargins") else None,
            "operating_margin": _safe(info.get("operatingMargins"), 4),
            "operating_margin_pct": round(info.get("operatingMargins", 0) * 100, 2) if info.get("operatingMargins") else None,
            "gross_margin": _safe(info.get("grossMargins"), 4),
            "gross_margin_pct": round(info.get("grossMargins", 0) * 100, 2) if info.get("grossMargins") else None,
            "ebitda_margin": _safe(info.get("ebitdaMargins"), 4),
            "return_on_assets": _safe(info.get("returnOnAssets"), 4),
            "return_on_assets_pct": round(info.get("returnOnAssets", 0) * 100, 2) if info.get("returnOnAssets") else None,
            "return_on_equity": _safe(info.get("returnOnEquity"), 4),
            "return_on_equity_pct": round(info.get("returnOnEquity", 0) * 100, 2) if info.get("returnOnEquity") else None,
        }

        # ─── Growth ───
        growth = {
            "revenue_growth": _safe(info.get("revenueGrowth"), 4),
            "revenue_growth_pct": round(info.get("revenueGrowth", 0) * 100, 2) if info.get("revenueGrowth") else None,
            "earnings_growth": _safe(info.get("earningsGrowth"), 4),
            "earnings_growth_pct": round(info.get("earningsGrowth", 0) * 100, 2) if info.get("earningsGrowth") else None,
            "revenue": info.get("totalRevenue"),
            "revenue_fmt": _fmt_large(info.get("totalRevenue")),
            "revenue_per_share": _safe(info.get("revenuePerShare")),
            "earnings": info.get("netIncomeToCommon"),
            "earnings_fmt": _fmt_large(info.get("netIncomeToCommon")),
            "ebitda": info.get("ebitda"),
            "ebitda_fmt": _fmt_large(info.get("ebitda")),
            "free_cash_flow": info.get("freeCashflow"),
            "free_cash_flow_fmt": _fmt_large(info.get("freeCashflow")),
            "operating_cash_flow": info.get("operatingCashflow"),
            "operating_cash_flow_fmt": _fmt_large(info.get("operatingCashflow")),
        }

        # ─── Balance Sheet ───
        balance = {
            "total_cash": info.get("totalCash"),
            "total_cash_fmt": _fmt_large(info.get("totalCash")),
            "total_cash_per_share": _safe(info.get("totalCashPerShare")),
            "total_debt": info.get("totalDebt"),
            "total_debt_fmt": _fmt_large(info.get("totalDebt")),
            "debt_to_equity": _safe(info.get("debtToEquity")),
            "current_ratio": _safe(info.get("currentRatio")),
            "quick_ratio": _safe(info.get("quickRatio")),
            "book_value": _safe(info.get("bookValue")),
        }

        # ─── Ownership ───
        ownership = {
            "insider_pct": round(info.get("heldPercentInsiders", 0) * 100, 2) if info.get("heldPercentInsiders") else None,
            "institution_pct": round(info.get("heldPercentInstitutions", 0) * 100, 2) if info.get("heldPercentInstitutions") else None,
            "short_pct_float": round(info.get("shortPercentOfFloat", 0) * 100, 2) if info.get("shortPercentOfFloat") else None,
            "short_ratio": _safe(info.get("shortRatio")),
            "shares_outstanding": info.get("sharesOutstanding"),
            "shares_float": info.get("floatShares"),
            "shares_short": info.get("sharesShort"),
        }

        # ─── Quant Grades (SA-style) ───
        val_pe = info.get("trailingPE")
        val_pb = info.get("priceToBook")
        grw_rev = info.get("revenueGrowth")
        grw_earn = info.get("earningsGrowth")
        prof_margin = info.get("profitMargins")
        prof_roe = info.get("returnOnEquity")

        grades = {
            "valuation": _grade(val_pe, [12, 18, 25, 40], reverse=True) if val_pe else {"grade": "N/A", "score": None},
            "growth": _grade(grw_rev, [0, 0.05, 0.10, 0.20]) if grw_rev is not None else {"grade": "N/A", "score": None},
            "profitability": _grade(prof_margin, [0, 0.05, 0.10, 0.20]) if prof_margin is not None else {"grade": "N/A", "score": None},
            "momentum": None,  # computed from price data below
            "revisions": None,  # would need estimate data
        }

        # Momentum grade from price performance
        try:
            df = fetch_price_cached(symbol, period="1y")
            if len(df) > 60:
                close = df["close"]
                ret_3m = (float(close.iloc[-1]) / float(close.iloc[-63]) - 1) if len(close) > 63 else 0
                grades["momentum"] = _grade(ret_3m, [-0.10, -0.02, 0.05, 0.15])
        except Exception:
            pass

        # ─── Snowflake Chart (Simply Wall St style) ───
        # Each dimension scored 0-6
        def _snowflake_score(val, thresholds, reverse=False):
            """Score 0-6 based on thresholds."""
            if val is None:
                return 3  # neutral
            scores = [0, 1, 2, 3, 4, 5, 6] if not reverse else [6, 5, 4, 3, 2, 1, 0]
            for i, t in enumerate(thresholds):
                if val < t:
                    return scores[i]
            return scores[-1]

        # Value: based on P/E, P/B, PEG
        v_pe = _snowflake_score(info.get("trailingPE"), [8, 12, 18, 25, 35, 50], reverse=True)
        v_pb = _snowflake_score(info.get("priceToBook"), [1, 2, 3, 5, 8, 15], reverse=True)
        v_peg = _snowflake_score(info.get("pegRatio"), [0.5, 1, 1.5, 2, 3, 5], reverse=True)
        value_score = round((v_pe + v_pb + v_peg) / 3, 1)

        # Future: earnings growth, revenue growth, analyst target upside
        f_eg = _snowflake_score(info.get("earningsGrowth"), [-0.1, 0, 0.05, 0.10, 0.20, 0.40])
        f_rg = _snowflake_score(info.get("revenueGrowth"), [-0.05, 0, 0.05, 0.10, 0.15, 0.25])
        upside = ((info.get("targetMeanPrice", 0) or 0) / price - 1) if price else 0
        f_up = _snowflake_score(upside, [-0.1, 0, 0.05, 0.10, 0.20, 0.30])
        future_score = round((f_eg + f_rg + f_up) / 3, 1)

        # Past: profit margin, ROE, ROA
        p_pm = _snowflake_score(info.get("profitMargins"), [-0.05, 0, 0.05, 0.10, 0.15, 0.25])
        p_roe = _snowflake_score(info.get("returnOnEquity"), [-0.05, 0, 0.08, 0.15, 0.25, 0.40])
        p_roa = _snowflake_score(info.get("returnOnAssets"), [-0.02, 0, 0.03, 0.06, 0.10, 0.15])
        past_score = round((p_pm + p_roe + p_roa) / 3, 1)

        # Health: debt/equity, current ratio, interest coverage
        h_de = _snowflake_score(info.get("debtToEquity"), [20, 50, 80, 120, 200, 400], reverse=True)
        h_cr = _snowflake_score(info.get("currentRatio"), [0.5, 0.8, 1.0, 1.5, 2.0, 3.0])
        health_score = round((h_de + h_cr) / 2, 1)

        # Dividend: yield, payout ratio, consistency
        div_yield = info.get("dividendYield", 0) or 0
        d_y = _snowflake_score(div_yield, [0, 0.01, 0.02, 0.03, 0.04, 0.06])
        payout = info.get("payoutRatio", 0) or 0
        d_p = _snowflake_score(payout, [0, 0.2, 0.4, 0.6, 0.8, 1.0], reverse=True) if payout > 0 else 3
        dividend_score = round((d_y + d_p) / 2, 1) if div_yield > 0 else 0

        snowflake = {
            "value": min(6, value_score),
            "future": min(6, future_score),
            "past": min(6, past_score),
            "health": min(6, health_score),
            "dividend": min(6, dividend_score),
            "total": round(min(6, (value_score + future_score + past_score + health_score + dividend_score) / 5), 1),
        }

        # ─── DCF Fair Value (simplified) ───
        fair_value = None
        fair_value_discount = None
        try:
            fcf = info.get("freeCashflow")
            shares_out = info.get("sharesOutstanding")
            growth_rate = info.get("revenueGrowth", 0.05) or 0.05
            if fcf and shares_out and fcf > 0:
                # 10-year DCF with 10% discount rate, 3% terminal growth
                discount_rate = 0.10
                terminal_growth = 0.03
                total_pv = 0
                projected_fcf = float(fcf)
                for yr in range(1, 11):
                    projected_fcf *= (1 + min(growth_rate, 0.30))  # cap growth at 30%
                    total_pv += projected_fcf / ((1 + discount_rate) ** yr)
                # Terminal value
                terminal_val = projected_fcf * (1 + terminal_growth) / (discount_rate - terminal_growth)
                total_pv += terminal_val / ((1 + discount_rate) ** 10)
                fair_value = round(total_pv / float(shares_out), 2)
                fair_value_discount = round((price / fair_value - 1) * 100, 1) if fair_value > 0 else None
        except Exception:
            pass

        dcf = {
            "fair_value": fair_value,
            "current_price": price,
            "discount_pct": fair_value_discount,
            "undervalued": fair_value_discount < 0 if fair_value_discount is not None else None,
        }

        # ─── Risk Checklist (Simply Wall St style) ───
        risk_checks = []
        # Debt
        de = info.get("debtToEquity")
        if de is not None:
            risk_checks.append({"label": "Debt to equity ratio", "value": f"{de:.0f}%", "pass": de < 100, "detail": "below 100% is healthy" if de < 100 else "high leverage"})
        cr = info.get("currentRatio")
        if cr is not None:
            risk_checks.append({"label": "Current ratio", "value": f"{cr:.2f}", "pass": cr >= 1.0, "detail": "can cover short-term obligations" if cr >= 1.0 else "may struggle with short-term debt"})
        # Profitability
        pm = info.get("profitMargins")
        if pm is not None:
            risk_checks.append({"label": "Profit margin", "value": f"{pm*100:.1f}%", "pass": pm > 0, "detail": "company is profitable" if pm > 0 else "company is unprofitable"})
        roe = info.get("returnOnEquity")
        if roe is not None:
            risk_checks.append({"label": "Return on equity", "value": f"{roe*100:.1f}%", "pass": roe > 0.10, "detail": "strong returns" if roe > 0.10 else "below average returns"})
        # Growth
        rg = info.get("revenueGrowth")
        if rg is not None:
            risk_checks.append({"label": "Revenue growing", "value": f"{rg*100:.1f}%", "pass": rg > 0, "detail": "revenue is growing" if rg > 0 else "revenue is declining"})
        eg = info.get("earningsGrowth")
        if eg is not None:
            risk_checks.append({"label": "Earnings growing", "value": f"{eg*100:.1f}%", "pass": eg > 0, "detail": "earnings are growing" if eg > 0 else "earnings are declining"})
        # Valuation
        pe = info.get("trailingPE")
        if pe is not None:
            risk_checks.append({"label": "P/E ratio reasonable", "value": f"{pe:.1f}", "pass": pe < 30, "detail": "reasonably valued" if pe < 30 else "premium valuation"})
        # Dividend
        pr = info.get("payoutRatio")
        if pr is not None and div_yield > 0:
            risk_checks.append({"label": "Dividend sustainable", "value": f"{pr*100:.0f}% payout", "pass": pr < 0.75, "detail": "payout is sustainable" if pr < 0.75 else "payout ratio is high"})
        # Short interest
        sf = info.get("shortPercentOfFloat")
        if sf is not None:
            risk_checks.append({"label": "Low short interest", "value": f"{sf*100:.1f}%", "pass": sf < 0.05, "detail": "minimal short pressure" if sf < 0.05 else "elevated short interest"})
        # Beta
        beta = info.get("beta")
        if beta is not None:
            risk_checks.append({"label": "Moderate volatility", "value": f"{beta:.2f} beta", "pass": 0.5 < beta < 1.5, "detail": "normal volatility" if 0.5 < beta < 1.5 else "volatile stock"})

        # ─── Ownership Pie (for visual) ───
        ownership_pie = []
        ins_pct = info.get("heldPercentInsiders", 0) or 0
        inst_pct = info.get("heldPercentInstitutions", 0) or 0
        pub_pct = max(0, 1 - ins_pct - inst_pct)
        if ins_pct > 0:
            ownership_pie.append({"name": "Insiders", "value": round(ins_pct * 100, 1), "color": "#6366f1"})
        if inst_pct > 0:
            ownership_pie.append({"name": "Institutions", "value": round(inst_pct * 100, 1), "color": "#22c55e"})
        if pub_pct > 0:
            ownership_pie.append({"name": "Public", "value": round(pub_pct * 100, 1), "color": "#f59e0b"})

        # ─── Financials (quarterly + annual) ───
        financials_annual = []
        financials_quarterly = []

        try:
            inc = ticker.income_stmt
            if inc is not None and not inc.empty:
                for col in inc.columns[:4]:
                    row = {}
                    row["period"] = col.strftime("%Y-%m-%d") if hasattr(col, "strftime") else str(col)
                    for idx in inc.index:
                        row[str(idx)] = _safe(inc.loc[idx, col])
                    financials_annual.append(row)
        except Exception:
            pass

        try:
            inc_q = ticker.quarterly_income_stmt
            if inc_q is not None and not inc_q.empty:
                for col in inc_q.columns[:8]:
                    row = {}
                    row["period"] = col.strftime("%Y-%m-%d") if hasattr(col, "strftime") else str(col)
                    for idx in inc_q.index:
                        row[str(idx)] = _safe(inc_q.loc[idx, col])
                    financials_quarterly.append(row)
        except Exception:
            pass

        # ─── Earnings History ───
        earnings_history = []
        try:
            eh = ticker.earnings_dates
            if eh is not None and not eh.empty:
                for idx in eh.index[:12]:
                    row = {
                        "date": idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx),
                    }
                    for col in eh.columns:
                        row[str(col)] = _safe(eh.loc[idx, col])
                    earnings_history.append(row)
        except Exception:
            pass

        # ─── Dividend History ───
        dividends = []
        try:
            divs = ticker.dividends
            if divs is not None and len(divs) > 0:
                for dt, val in list(divs.items())[-20:]:
                    dividends.append({
                        "date": dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt),
                        "amount": round(float(val), 4),
                    })
        except Exception:
            pass

        # ─── News ───
        news = []
        try:
            raw_news = ticker.news or []
            for item in raw_news[:10]:
                content = item.get("content", {})
                title = content.get("title", "")
                if not title:
                    continue
                pub_date = content.get("pubDate", "")
                provider = content.get("provider", {})
                url = content.get("canonicalUrl", {}).get("url", "")
                thumbnail = None
                resolutions = content.get("thumbnail", {}).get("resolutions", [])
                if resolutions:
                    thumbnail = resolutions[0].get("url")
                news.append({
                    "title": title,
                    "url": url,
                    "source": provider.get("displayName", ""),
                    "date": pub_date,
                    "thumbnail": thumbnail,
                })
        except Exception:
            pass

        # ─── Balance Sheet (annual + quarterly) ───
        balance_sheet_annual = []
        balance_sheet_quarterly = []
        try:
            bs = ticker.balance_sheet
            if bs is not None and not bs.empty:
                for col in bs.columns[:4]:
                    row = {"period": col.strftime("%Y-%m-%d") if hasattr(col, "strftime") else str(col)}
                    for idx in bs.index:
                        row[str(idx)] = _safe(bs.loc[idx, col])
                    balance_sheet_annual.append(row)
        except Exception:
            pass
        try:
            bs_q = ticker.quarterly_balance_sheet
            if bs_q is not None and not bs_q.empty:
                for col in bs_q.columns[:8]:
                    row = {"period": col.strftime("%Y-%m-%d") if hasattr(col, "strftime") else str(col)}
                    for idx in bs_q.index:
                        row[str(idx)] = _safe(bs_q.loc[idx, col])
                    balance_sheet_quarterly.append(row)
        except Exception:
            pass

        # ─── Cash Flow (annual + quarterly) ───
        cashflow_annual = []
        cashflow_quarterly = []
        try:
            cf = ticker.cashflow
            if cf is not None and not cf.empty:
                for col in cf.columns[:4]:
                    row = {"period": col.strftime("%Y-%m-%d") if hasattr(col, "strftime") else str(col)}
                    for idx in cf.index:
                        row[str(idx)] = _safe(cf.loc[idx, col])
                    cashflow_annual.append(row)
        except Exception:
            pass
        try:
            cf_q = ticker.quarterly_cashflow
            if cf_q is not None and not cf_q.empty:
                for col in cf_q.columns[:8]:
                    row = {"period": col.strftime("%Y-%m-%d") if hasattr(col, "strftime") else str(col)}
                    for idx in cf_q.index:
                        row[str(idx)] = _safe(cf_q.loc[idx, col])
                    cashflow_quarterly.append(row)
        except Exception:
            pass

        # ─── Insider Transactions ───
        insider_transactions = []
        try:
            it = ticker.insider_transactions
            if it is not None and not it.empty:
                for _, row_data in it.head(20).iterrows():
                    insider_transactions.append({
                        "date": str(row_data.get("Start Date", "")),
                        "insider": str(row_data.get("Insider", "")),
                        "position": str(row_data.get("Position", "")),
                        "transaction": str(row_data.get("Transaction", "")),
                        "shares": _safe(row_data.get("Shares")),
                        "value": _safe(row_data.get("Value")),
                    })
        except Exception:
            pass

        # ─── Institutional Holders ───
        institutional_holders = []
        try:
            ih = ticker.institutional_holders
            if ih is not None and not ih.empty:
                for _, row_data in ih.head(15).iterrows():
                    institutional_holders.append({
                        "holder": str(row_data.get("Holder", "")),
                        "shares": _safe(row_data.get("Shares")),
                        "date_reported": str(row_data.get("Date Reported", "")),
                        "pct_out": _safe(row_data.get("% Out"), 4),
                        "value": _safe(row_data.get("Value")),
                    })
        except Exception:
            pass

        # ─── Mutual Fund Holders ───
        fund_holders = []
        try:
            mf = ticker.mutualfund_holders
            if mf is not None and not mf.empty:
                for _, row_data in mf.head(10).iterrows():
                    fund_holders.append({
                        "holder": str(row_data.get("Holder", "")),
                        "shares": _safe(row_data.get("Shares")),
                        "date_reported": str(row_data.get("Date Reported", "")),
                        "pct_out": _safe(row_data.get("% Out"), 4),
                        "value": _safe(row_data.get("Value")),
                    })
        except Exception:
            pass

        # ─── Analyst Recommendations History ───
        recommendations = []
        try:
            rec = ticker.recommendations
            if rec is not None and not rec.empty:
                for idx_val, row_data in rec.tail(20).iterrows():
                    recommendations.append({
                        "date": idx_val.strftime("%Y-%m-%d") if hasattr(idx_val, "strftime") else str(idx_val),
                        "firm": str(row_data.get("Firm", "")),
                        "to_grade": str(row_data.get("To Grade", "")),
                        "from_grade": str(row_data.get("From Grade", "")),
                        "action": str(row_data.get("Action", "")),
                    })
                recommendations.reverse()
        except Exception:
            pass

        # ─── Risk Metrics ───
        risk_metrics = {}
        try:
            df = fetch_price_cached(symbol, period="2y")
            if len(df) > 60:
                close = df["close"]
                returns = close.pct_change().dropna()

                # Sharpe ratio (annualized, risk-free = 0)
                sharpe = float(returns.mean() / returns.std() * np.sqrt(252)) if returns.std() > 0 else 0
                # Sortino ratio
                downside = returns[returns < 0]
                sortino = float(returns.mean() / downside.std() * np.sqrt(252)) if len(downside) > 0 and downside.std() > 0 else 0
                # Max drawdown
                cummax = (1 + returns).cumprod().cummax()
                drawdown = ((1 + returns).cumprod() / cummax - 1)
                max_dd = float(drawdown.min()) * 100
                # Volatility
                vol_annual = float(returns.std() * np.sqrt(252) * 100)
                # VaR 95%
                var_95 = float(np.percentile(returns, 5) * 100)

                # Performance periods
                perf = {}
                for label, days in [("1W", 5), ("1M", 21), ("3M", 63), ("6M", 126), ("1Y", 252), ("2Y", 504)]:
                    if len(close) > days:
                        perf[label] = round((float(close.iloc[-1]) / float(close.iloc[-days - 1]) - 1) * 100, 2)

                risk_metrics = {
                    "sharpe_ratio": round(sharpe, 3),
                    "sortino_ratio": round(sortino, 3),
                    "max_drawdown": round(max_dd, 2),
                    "volatility_annual": round(vol_annual, 1),
                    "var_95": round(var_95, 2),
                    "performance": perf,
                    "beta": _safe(info.get("beta")),
                }
        except Exception:
            pass

        # ─── Revenue / Earnings Chart Data ───
        revenue_chart = []
        try:
            inc = ticker.income_stmt
            if inc is not None and not inc.empty:
                for col in reversed(list(inc.columns[:8])):
                    period = col.strftime("%Y") if hasattr(col, "strftime") else str(col)[:4]
                    rev = _safe(inc.loc["Total Revenue", col]) if "Total Revenue" in inc.index else None
                    ni = _safe(inc.loc["Net Income", col]) if "Net Income" in inc.index else None
                    gp = _safe(inc.loc["Gross Profit", col]) if "Gross Profit" in inc.index else None
                    oi = _safe(inc.loc["Operating Income", col]) if "Operating Income" in inc.index else None
                    revenue_chart.append({"period": period, "revenue": rev, "net_income": ni, "gross_profit": gp, "operating_income": oi})
        except Exception:
            pass

        # ─── Dividend Growth ───
        dividend_growth = {}
        try:
            divs_all = ticker.dividends
            if divs_all is not None and len(divs_all) >= 4:
                annual_divs = divs_all.resample("YE").sum()
                if len(annual_divs) >= 2:
                    latest = float(annual_divs.iloc[-1])
                    prev = float(annual_divs.iloc[-2])
                    dividend_growth["yoy"] = round((latest / prev - 1) * 100, 2) if prev > 0 else None
                if len(annual_divs) >= 4:
                    d3 = float(annual_divs.iloc[-4])
                    dividend_growth["cagr_3y"] = round((float(annual_divs.iloc[-1]) / d3) ** (1/3) - 1, 4) * 100 if d3 > 0 else None
                if len(annual_divs) >= 6:
                    d5 = float(annual_divs.iloc[-6])
                    dividend_growth["cagr_5y"] = round((float(annual_divs.iloc[-1]) / d5) ** (1/5) - 1, 4) * 100 if d5 > 0 else None
                # Consecutive years of growth
                years_growing = 0
                for i in range(len(annual_divs) - 1, 0, -1):
                    if float(annual_divs.iloc[i]) > float(annual_divs.iloc[i-1]):
                        years_growing += 1
                    else:
                        break
                dividend_growth["consecutive_years"] = years_growing
        except Exception:
            pass

        # ─── Wall Street Ratings Summary ───
        ratings_summary = {}
        try:
            rec_sum = ticker.recommendations_summary
            if rec_sum is not None and not rec_sum.empty:
                for _, row_data in rec_sum.iterrows():
                    period_label = str(row_data.get("period", ""))
                    ratings_summary[period_label] = {
                        "strong_buy": _safe(row_data.get("strongBuy")),
                        "buy": _safe(row_data.get("buy")),
                        "hold": _safe(row_data.get("hold")),
                        "sell": _safe(row_data.get("sell")),
                        "strong_sell": _safe(row_data.get("strongSell")),
                    }
        except Exception:
            pass

        # ─── Peer Comparison ───
        peers = []
        try:
            # Get peers from same sector
            sector = info.get("sector", "")
            from .stock_lists import SECTORS
            peer_symbols = []
            for sec_name, sec_syms in SECTORS.items():
                if sec_name.lower().startswith(sector.lower()[:5]) or symbol in sec_syms:
                    peer_symbols = [s for s in sec_syms if s != symbol][:8]
                    break

            for ps in peer_symbols:
                try:
                    pf = fetch_fundamentals_cached(ps)
                    peers.append({
                        "symbol": ps,
                        "name": pf.get("name", ps),
                        "market_cap": pf.get("market_cap"),
                        "market_cap_fmt": _fmt_large(pf.get("market_cap")),
                        "pe_ratio": pf.get("pe_ratio"),
                        "dividend_yield": pf.get("dividend_yield"),
                        "profit_margin": pf.get("profit_margin"),
                        "revenue_growth": pf.get("revenue_growth"),
                        "beta": pf.get("beta"),
                    })
                except Exception:
                    continue
        except Exception:
            pass

        # ─── Price chart data (1Y) ───
        chart = []
        try:
            df = fetch_price_cached(symbol, period="2y")
            for i in range(len(df)):
                chart.append({
                    "date": df.index[i].strftime("%Y-%m-%d"),
                    "close": round(float(df["close"].iloc[i]), 2),
                    "volume": int(df["volume"].iloc[i]),
                })
        except Exception:
            pass

        return {
            "summary": summary,
            "profitability": profitability,
            "growth": growth,
            "balance": balance,
            "ownership": ownership,
            "grades": grades,
            "financials_annual": financials_annual,
            "financials_quarterly": financials_quarterly,
            "balance_sheet_annual": balance_sheet_annual,
            "balance_sheet_quarterly": balance_sheet_quarterly,
            "cashflow_annual": cashflow_annual,
            "cashflow_quarterly": cashflow_quarterly,
            "earnings_history": earnings_history,
            "dividends": dividends,
            "dividend_growth": dividend_growth,
            "revenue_chart": revenue_chart,
            "news": news,
            "peers": peers,
            "chart": chart,
            "insider_transactions": insider_transactions,
            "institutional_holders": institutional_holders,
            "fund_holders": fund_holders,
            "recommendations": recommendations,
            "ratings_summary": ratings_summary,
            "risk_metrics": risk_metrics,
            "snowflake": snowflake,
            "dcf": dcf,
            "risk_checks": risk_checks,
            "ownership_pie": ownership_pie,
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

#!/usr/bin/env python3
"""Unified data-platform collector CLI (entrypoint for systemd timers on Neo).

Usage:
  python scripts/collect.py init           # create/upgrade warehouse schema
  python scripts/collect.py universe       # refresh symbol universe + CIKs
  python scripts/collect.py prices         # incremental EOD prices + actions
  python scripts/collect.py prices-full    # full historical backfill
  python scripts/collect.py edgar          # SEC financials + filings index
  python scripts/collect.py macro          # BLS + Treasury (+ optional BEA/FRED)
  python scripts/collect.py info           # full Yahoo .info snapshot per symbol
  python scripts/collect.py quotes         # fast batch latest-bar refresh (frequent)
  python scripts/collect.py intraday       # cache 5m/1h bars for the active subset
  python scripts/collect.py all            # universe -> prices -> info -> macro

Keys via env / EnvironmentFile: FRED_API_KEY, SEC_USER_AGENT, optional BLS_API_KEY.
"""

import os
import sys

# Make the backend package importable regardless of CWD.
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.join(_HERE, "..", "backend")
sys.path.insert(0, os.path.abspath(_BACKEND))


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    from app.datawarehouse import db, universe
    from app.datawarehouse.sources import prices, edgar, macro, info, intraday

    db.init_schema()

    if cmd == "init":
        print("schema ready")
    elif cmd == "universe":
        universe.build_universe()
    elif cmd == "prices":
        universe.build_universe()
        prices.collect_prices(full=False)
    elif cmd == "prices-full":
        universe.build_universe()
        prices.collect_prices(full=True)
    elif cmd == "edgar":
        universe.build_universe()
        edgar.collect_edgar()
    elif cmd == "macro":
        macro.collect_macro()
    elif cmd == "info":
        universe.build_universe()
        info.collect_info()
    elif cmd == "quotes":
        info.collect_quotes()
    elif cmd == "intraday":
        intraday.collect_intraday()
    elif cmd == "all":
        universe.build_universe()
        prices.collect_prices(full=False)
        info.collect_info()
        macro.collect_macro()
    else:
        print(f"unknown command: {cmd}")
        sys.exit(2)


if __name__ == "__main__":
    main()

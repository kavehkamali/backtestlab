"""
Editorial-style section bodies for Learn tool hubs: varied outlines, movers/radar/tools/math copy.
Placeholders {t0},{t1},{t2},{week},{cluster} filled by generator.
"""

from __future__ import annotations

# Distinct H2 lines for GPARAS chunks — avoids “same skeleton” feel
EDITORIAL_H2_POOL: list[str] = [
    "Why filings still beat the timeline",
    "When the story and the spreadsheet disagree",
    "Liquidity: the detail that changes everything",
    "Margins that actually matter this cycle",
    "Debt schedules worth a real look",
    "International sales and the hidden FX drag",
    "Options heat without losing the plot",
    "Dividends: cash first, yield second",
    "Screening without fooling yourself",
    "Backtests that survive a second glance",
    "Breadth when the index looks fine",
    "Rates, duration, and your watchlist",
    "Crypto venues: same ticker, different risk",
    "Tax lots, time horizon, and noise",
    "Revision trends vs price trends",
]

MOVERS_TITLE_VARIANTS = [
    "Gaps, volume, and what the opening hour shows",
    "Overnight headlines and the first print",
    "When a name reopens far from yesterday’s close",
]

RADAR_TITLE_VARIANTS = [
    "Names that keep showing up on busy screens",
    "Liquid leaders worth tracking this month",
    "Heavy-volume tickers analysts keep revisiting",
]

FUND_TITLE_VARIANTS = [
    "Fundamentals that still matter for short and long horizons",
    "Numbers swing traders borrow from the 10-Q",
    "Balance-sheet basics long holders refuse to skip",
]

MATH_TITLE_VARIANTS = [
    "Math that scales from day trades to multi-year holds",
    "Position size, stops, and expectancy—in plain numbers",
    "Risk budgets that work across time frames",
]

TOOLS_TITLE_VARIANTS = [
    "How to actually use Equilima for this kind of work",
    "Where Equilima fits in your daily routine",
    "Turning the platform into a checklist—not a slot machine",
]

TAPE_TITLE_VARIANTS = [
    "What the tape is arguing about right now",
    "Macro cross-currents hitting risk appetite",
    "The week’s real question under the headlines",
]

CLOSING_TITLE_VARIANTS = [
    "Wrapping up—and where to click next",
    "Before you close the tab",
    "Taking this from article to workflow",
]


def movers_block(tickers_csv: str, cluster: str, week: str, variant: int, fill) -> str:
    title = MOVERS_TITLE_VARIANTS[variant % len(MOVERS_TITLE_VARIANTS)]
    tpl = f"""
<h2 class="eq-h2">{title}</h2>
<p class="eq-p">When <strong>{{t0}}</strong> or <strong>{{t1}}</strong> prints well away from the prior close, the move is usually a mix of headline, index futures, and who was positioned wrong overnight. Day traders often care whether the first thirty minutes <em>hold</em> the gap; swing traders care more about whether weekly volume confirms a break. None of that tells you the “right” trade—it tells you what to measure before you size anything.</p>
<p class="eq-p">A gap with weak volume can fade; a gap into real news (earnings, guidance, legal resolution) with heavy turnover often behaves differently. In Equilima’s <strong>Markets</strong> and per-ticker views, compare today’s range to the twenty-day average range and note whether <strong>{{t2}}</strong> is moving with its sector ETF or on its own idiosyncrasy. That single comparison saves hours of narrative arguments.</p>
<p class="eq-p">For {cluster} work in {week}, treat “mover” labels on TV as a starting ping, not a thesis. Your job is to trace whether the business story, the liquidity story, or the macro story is driving—three different risk managers, three different position sizes.</p>
""".strip()
    return fill(tpl, tickers_csv, cluster, week)


def radar_block(tickers_csv: str, cluster: str, week: str, variant: int, fill) -> str:
    title = RADAR_TITLE_VARIANTS[variant % len(RADAR_TITLE_VARIANTS)]
    tpl = f"""
<h2 class="eq-h2">{title}</h2>
<p class="eq-p"><strong>{{t0}}</strong>, <strong>{{t1}}</strong>, and <strong>{{t2}}</strong> sit in the category of names that institutions and retail desks alike return to when they need liquidity and a rich news flow—not a recommendation list, but a reality of the tape. In {week}, any “watchlist” chatter you hear is already competing with new prints; use Equilima to see current multiples, short interest where available, and recent price structure instead of trusting a static blog table.</p>
<p class="eq-p">If you are hunting ideas for the month ahead, a disciplined approach is: start with a theme (AI capex, consumer spend, bank NII, crypto beta), then require a minimum average dollar volume, then layer one fundamental filter you can defend. The tickers in this article are convenient <em>examples</em> for that drill, not a ranked set of “best stocks.”</p>
<p class="eq-p">Rotate: one week lean on quality metrics, another week lean on revision breadth or price momentum—then note when the same names pass both tests versus only one. That overlap is where homework gets interesting, still without pretending Equilima wrote you a buy ticket.</p>
""".strip()
    return fill(tpl, tickers_csv, cluster, week)


def fundamentals_block(tickers_csv: str, cluster: str, week: str, variant: int, fill) -> str:
    title = FUND_TITLE_VARIANTS[variant % len(FUND_TITLE_VARIANTS)]
    tpl = f"""
<h2 class="eq-h2">{title}</h2>
<p class="eq-p">Long holders live in free cash flow and return on invested capital; swing traders still care whether <strong>{{t0}}</strong>’s last quarter showed operating leverage or margin compression, because that sets the tone for the next few weeks of sentiment. Day traders may ignore the filing until a headline forces it—then the filing becomes the only place to see whether management hedged guidance.</p>
<p class="eq-p">Three workhorse checks: (1) revenue growth versus expectations embedded in price—use Equilima’s research snapshots and your own trend lines; (2) gross margin <em>dollars</em>, not only the percentage, for names like <strong>{{t1}}</strong> where mix shifts lie; (3) net debt to EBITDA and maturity walls for anything cyclical or acquisitive. <strong>{{t2}}</strong> may fail one check and pass two—your journal should say which check mattered most for your horizon.</p>
<p class="eq-p">Non-GAAP “adjusted” lines are marketing-friendly; reconcile to GAAP operating income at least once a quarter. If the gap between them widens while the stock accelerates, you are often looking at a sentiment trade wearing a fundamentals costume.</p>
""".strip()
    return fill(tpl, tickers_csv, cluster, week)


def math_block(tickers_csv: str, cluster: str, week: str, variant: int, fill) -> str:
    title = MATH_TITLE_VARIANTS[variant % len(MATH_TITLE_VARIANTS)]
    tpl = f"""
<h2 class="eq-h2">{title}</h2>
<p class="eq-p">Define risk in dollars before you touch <strong>{{t0}}</strong> or <strong>{{t1}}</strong>: if your account is $50,000 and you refuse to lose more than 1% on one idea, your max loss is $500. Distance to a technical or fundamental invalidation point turns that dollar cap into share size. Day traders compress the distance (tight stops, smaller hold time); swing traders widen it; long holders often size smaller per name because stops are wider or implicit.</p>
<p class="eq-p">Expectancy is won-rate times average win minus loss-rate times average loss—if you do not track those from your journal, your backtest is fiction. In Equilima <strong>Backtest</strong>, stress the same rule with friction turned up; if edge disappears, you learned something about implementation, not about “the market hating you.”</p>
<p class="eq-p">For longer horizons, CAGR and drawdown tolerance matter more than daily Sharpe. For intraday work, session VWAP and opening range statistics are tools, not religion—use them to contextualize <strong>{{t2}}</strong>, not to override a risk limit you set before the open.</p>
""".strip()
    return fill(tpl, tickers_csv, cluster, week)


def equilima_tools_block(cluster: str, tickers_csv: str, week: str, fill, title_idx: int) -> str:
    title = TOOLS_TITLE_VARIANTS[abs(title_idx) % len(TOOLS_TITLE_VARIANTS)]
    if "Research" in cluster:
        body = f"""
<h2 class="eq-h2">{title}</h2>
<p class="eq-p">Open the <strong>Research</strong> workspace on <strong>{{t0}}</strong>: pull the latest financial summary, then open peers for <strong>{{t1}}</strong> and <strong>{{t2}}</strong> in adjacent tabs. Log one metric per name you will track for two quarters—mix shift, cloud growth, net interest margin, whatever matches the story—so your next read is comparative, not amnesiac.</p>
<p class="eq-p">Export or screenshot nothing until you can explain the delta versus last quarter in one sentence. That friction keeps you from confusing data volume with insight.</p>
""".strip()
    elif "Crypto" in cluster:
        body = f"""
<h2 class="eq-h2">{title}</h2>
<p class="eq-p">Use Equilima <strong>Crypto</strong> charts for <strong>{{t0}}</strong> and <strong>{{t1}}</strong> alongside your equity tabs if you trade proxies—note basis risk when spot diverges from miners or exchanges. Set alerts on range breaks only after you know your max loss in dollars, not because a line looked pretty.</p>
<p class="eq-p">Stablecoin and venue risk are outside most chart packages; keep custody notes in your journal next to every trade thesis involving <strong>{{t2}}</strong>.</p>
""".strip()
    elif "Screener" in cluster:
        body = f"""
<h2 class="eq-h2">{title}</h2>
<p class="eq-p">In <strong>Screener</strong>, build a universe with a hard liquidity floor, then add one quality gate and one valuation or momentum gate you can explain to a friend. Run the same screen weekly for a month—do <strong>{{t0}}</strong>, <strong>{{t1}}</strong>, or <strong>{{t2}}</strong> enter, exit, or hover at the margin? That drift teaches you how sensitive your criteria are.</p>
<p class="eq-p">Save variants (stricter vs looser) and compare overlap; crowding often hides in the names that pass every filter.</p>
""".strip()
    elif "Backtest" in cluster:
        body = f"""
<h2 class="eq-h2">{title}</h2>
<p class="eq-p">Pick one simple rule (trend or mean reversion) on <strong>{{t0}}</strong> or a broad ETF, then run walk-forward slices in <strong>Backtest</strong>: train on an older window, freeze parameters, test forward. Add slippage until the equity curve stops flattering you. If the rule dies with realistic costs, you saved real money.</p>
<p class="eq-p">Repeat on <strong>{{t1}}</strong> versus <strong>{{t2}}</strong> to see whether your edge is asset-specific or regime-specific.</p>
""".strip()
    else:
        body = f"""
<h2 class="eq-h2">{title}</h2>
<p class="eq-p"><strong>Markets</strong> is your macro dial: indices, breadth, rates proxies, FX—stack those panels next to <strong>{{t0}}</strong> and <strong>{{t1}}</strong> while you ask whether today is a stock-picker day or a beta day. When leadership narrows to a handful of mega caps, your read on <strong>{{t2}}</strong> may be mostly factor exposure.</p>
<p class="eq-p">Snapshot the dashboard weekly; the deltas matter more than any single print in {week}.</p>
""".strip()
    return fill(body, tickers_csv, cluster, week)


def tape_block(tickers_csv: str, cluster: str, week: str, variant: int, fill) -> str:
    title = TAPE_TITLE_VARIANTS[variant % len(TAPE_TITLE_VARIANTS)]
    tpl = f"""
<h2 class="eq-h2">{title}</h2>
<p class="eq-p">Under the surface of {week}, the usual arguments persist: how much AI capex is too much, whether consumers crack, whether banks earn the curve. <strong>{{t0}}</strong> often embodies one side of that debate; <strong>{{t1}}</strong> another; <strong>{{t2}}</strong> may be the tie-breaker in your own notes when correlations spike.</p>
<p class="eq-p">Tape readers watch breadth, credit spreads, and whether defensive sectors lead on up days—context clues, not oracle signals. If your single-stock thesis on any of these names requires every macro star to align, size down or wait.</p>
""".strip()
    return fill(tpl, tickers_csv, cluster, week)


def closing_variant(tickers_csv: str, title: str, cluster: str, week: str, variant: int, fill) -> str:
    import html as html_lib

    ct = CLOSING_TITLE_VARIANTS[variant % len(CLOSING_TITLE_VARIANTS)]
    tpl = f"""
<h2 class="eq-h2">{ct}</h2>
<p class="eq-p">Carry forward one habit from this piece: link a headline on <strong>{{t0}}</strong> to a line item, link a chart on <strong>{{t1}}</strong> to a risk budget, link a screen on <strong>{{t2}}</strong> to a written rule. Equilima speeds the clicks; it does not replace the notebook.</p>
<p class="eq-p">Revisit after the next earnings cycle with fresh data—static commentary ages fast. <strong>Not investment advice.</strong></p>
""".strip()
    body = fill(tpl, tickers_csv, cluster, week)
    return body + f'<p class="eq-p eq-muted italic text-sm">{html_lib.escape(title[:140])}</p>'

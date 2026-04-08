#!/usr/bin/env python3
"""
Generate 25 Equilima Learn hub articles: 5 per category (Research, Crypto, Screener, Backtest, Markets).
Run from repo root: python3 backend/scripts/generate_learn_tool_hubs.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "learn_tool_hubs"

DISCLAIMER = """
<div class="rounded-xl border-2 border-amber-500/50 bg-amber-950/50 p-5 mb-8">
<p class="text-amber-100 font-bold text-xs uppercase tracking-widest mb-3">Important — not financial advice</p>
<p class="text-gray-100 text-[15px] leading-[1.75] mb-3">Equilima is <strong>not</strong> a registered investment adviser, broker-dealer, or financial planner. This content is for <strong>education and general research commentary</strong> only—not personalized buy/sell/hold advice for your situation. Investing and crypto involve risk of loss; past performance does not guarantee future results. Verify all figures with primary sources and consult a qualified professional before acting.</p>
<p class="text-gray-400 text-sm leading-relaxed">Ticker and token symbols are <strong>illustrative examples</strong> for learning, not recommendations.</p>
</div>
""".strip()


def body_for(
    *,
    title: str,
    cluster: str,
    tickers: str,
    week: str,
    bullets: list[str],
    snapshot: str,
    bull: str,
    bear: str,
    bottom: str,
) -> str:
    bli = "".join(f"<li>{b}</li>" for b in bullets)
    return f"""
{DISCLAIMER}
<div class="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-5 mb-8">
<p class="text-indigo-200 text-xs font-semibold uppercase tracking-wider mb-2">{cluster}</p>
<h2 class="text-white text-lg font-bold mb-3">Key takeaways</h2>
<ul class="list-disc pl-5 space-y-3 text-gray-300 text-[15px] leading-relaxed">{bli}</ul>
</div>
<h2 class="text-white text-xl font-semibold mt-10 mb-4">Snapshot — {week}</h2>
{snapshot}
<h2 class="text-white text-xl font-semibold mt-10 mb-4">Bull case — how this lens can help</h2>
{bull}
<h2 class="text-white text-xl font-semibold mt-10 mb-4">Bear case — where it breaks</h2>
{bear}
<h2 class="text-white text-xl font-semibold mt-10 mb-4">Bottom line</h2>
{bottom}
<p class="text-gray-500 text-sm italic mt-6">Reminder: not investment advice. Examples may reference {tickers} for education only.</p>
""".strip()


def p(text: str) -> str:
    return f'<p class="text-gray-300 text-[15px] leading-[1.85] mb-5">{text}</p>'


# (slug, title, meta, excerpt, cluster_key, tickers, week, bullets, snapshot_ps, bull_ps, bear_ps, bottom_ps)
# snapshot_ps = list of paragraph strings
ARTICLES: list[tuple] = []

# —— Research × 5 ——
W = "early April 2026, when mega-cap tech guidance and macro prints compete for attention"
ARTICLES.extend(
    [
        (
            "research-fundamentals-walkthrough-aapl-msft-googl",
            "Fundamentals Walkthrough: How to Read the Same Filings the Street Uses (AAPL, MSFT, GOOGL)",
            "Educational guide to revenue segments, margins, and cash flow—examples only, not advice.",
            "Turn 10-K language into a checklist: segments, FCF, and debt—using large caps as teaching examples.",
            "Equilima — Research",
            "AAPL, MSFT, GOOGL",
            W,
            [
                "<strong>Filings first:</strong> Models should trace claims to 10-K/10-Q text, not headlines alone.",
                "<strong>This week:</strong> Compare how <strong>MSFT</strong> cloud growth narrative squares with segment tables versus how <strong>GOOGL</strong> breaks out Search vs Cloud.",
                "<strong>Equilima Research tab:</strong> Pull live metrics after you read—never the reverse.",
            ],
            [
                "Serious equity research starts where social media ends: the filing. When you study <strong>AAPL</strong>, you are not guessing iPhone cycles from thumbnails—you are checking which revenue lines moved, how gross margin behaved, and whether buybacks distorted per-share optics. The same discipline applies when you contrast <strong>MSFT</strong>’s hybrid cloud story with <strong>GOOGL</strong>’s advertising cyclicality. This week, with investors arguing whether AI spend is crowding out other capex, the filing footnotes on depreciation, R&amp;D capitalization policies, and segment margins matter more than a single headline P/E.",
                "A practical routine is to read the MD&amp;A risk section before the bullish slides: you want to know what management already warned about before you attribute a stock move to “random volatility.” For education, pick one paragraph from each of three filers and rewrite it in your own words—if you cannot, you do not yet understand it. That is the bar institutional juniors are held to, and it scales to retail learners who want rigor without paying for hype.",
            ],
            [
                "When fundamentals are done well, you build a thesis that survives bad days: you know which metrics would falsify your story and which are noise. Comparing <strong>AAPL</strong> services mix drift versus <strong>MSFT</strong> Azure growth deceleration is an exercise in pattern recognition, not timing calls.",
                "Cross-checking sell-side summary sites against the primary filing reduces “telephone game” errors—especially around adjusted EBITDA and non-GAAP add-backs.",
            ],
            [
                "Fundamentals can lag fast markets: a great quarter can be fully priced before you finish the PDF. Filings are also backward-looking; they will not tell you tomorrow’s order flow.",
                "Sector templates do not transfer blindly: consumer hardware cycles differ from enterprise software renewals—avoid cookie-cutter checklists.",
            ],
            [
                "Use this playbook as a reading discipline, then open Equilima’s <strong>Research</strong> workspace to pull current data on the names you are studying. If your thesis cannot survive a filing footnote, it is not ready for capital—regardless of what moved this week.",
            ],
        ),
        (
            "research-earnings-quality-nvda-amd-intc-semis",
            "Earnings Quality in Semiconductors: NVDA, AMD, INTC as Case Studies (Education)",
            "Learn to spot revenue recognition, inventory, and guide language—examples NVDA, AMD, INTC—not trade signals.",
            "Why gross margin paths and data-center mix matter when headlines only shout “AI winner.”",
            "Equilima — Research",
            "NVDA, AMD, INTC",
            W,
            [
                "<strong>Quality &gt; slogan:</strong> Compare operating cash flow trends to net income for <strong>NVDA</strong> vs <strong>INTC</strong> as a classroom exercise.",
                "<strong>This week:</strong> Watch whether <strong>AMD</strong> data-center commentary aligns with inventory days and customer concentration disclosures.",
                "<strong>No calls:</strong> We teach how to read, not what to buy.",
            ],
            [
                "Semiconductor cycles punish sloppy reading. When <strong>NVDA</strong> dominates headlines, earnings quality work means understanding revenue recognition for long-lead-time accelerators, customer concentration, and whether gross margin expansion is mix-driven or sustainable. <strong>AMD</strong> often illustrates competitive share shifts where ASP and data-center attach matter as much as top-line beats. <strong>INTC</strong> can be a lesson in turnaround accounting—capex intensity, node timing, and subsidy optics can move sentiment faster than a single EPS print.",
                "This week, if macro rates bounce around, semi stocks can detach from their own fundamentals for days at a time—that is a liquidity story, not necessarily a filing story. Your job as a learner is to separate what changed in the business from what changed in the discount rate everyone applies.",
            ],
            [
                "Earnings quality frameworks help you ask CFO-level questions even if you are not a CFO: Are accruals rising faster than cash? Is inventory a signal of demand or obsolescence? Does guidance language narrow or widen uncertainty?",
                "Pairing filing notes with Equilima’s research pulls lets you test whether the market is pricing the same variable you care about.",
            ],
            [
                "Short-term price can ignore quality for quarters; momentum traders may not care about inventory days until suddenly they do.",
                "Complex businesses hide surprises in segments—you can miss a landmine if you only read the press release headline.",
            ],
            [
                "Treat <strong>NVDA</strong>, <strong>AMD</strong>, and <strong>INTC</strong> as a curriculum, not a shopping list. Finish with a written list of three metrics you will track next quarter—then verify them in the next filing.",
            ],
        ),
        (
            "research-bank-peer-jpm-bac-gs-fundamentals",
            "Bank Peer Work: JPM, BAC, GS—Spreads, NII, and Credit (Educational)",
            "How to compare large U.S. banks without making implicit buy recommendations.",
            "Net interest income, CET1, and provisioning language—using money-center banks as examples.",
            "Equilima — Research",
            "JPM, BAC, GS",
            W,
            [
                "<strong>Apples-to-apples:</strong> Separate markets-heavy models (<strong>GS</strong>) from consumer-heavy balance sheets (<strong>BAC</strong>).",
                "<strong>This week:</strong> Yield-curve chatter hits rate-sensitive books—trace management’s NII sensitivity tables.",
                "<strong>Education only:</strong> No rating, no price target from Equilima.",
            ],
            [
                "Bank research is a masterclass in balance-sheet literacy. <strong>JPM</strong> often anchors conversations about diversified franchises; <strong>BAC</strong> illustrates consumer deposit betas and card cycles; <strong>GS</strong> shows how trading and banking mixes change earnings volatility. This week, if macro traders are repositioning around Fed expectations, you should see that show up in forward NII commentary and deposit cost assumptions—not just in the stock tick.",
                "Peer tables are dangerous when copied blindly: different accounting choices for allowances, trading assets, and tax lines can make two banks look closer than they are. A learning exercise is to normalize one ratio manually—pick net charge-offs or efficiency—and explain why your adjustment matters.",
            ],
            [
                "Peer frameworks build pattern recognition: you learn which line items move first in stress and which lag. That helps you read any future quarter faster.",
                "Understanding credit cycles makes you less shocked by provisioning swings—they are features of the model, not random noise.",
            ],
            [
                "Banks are opaque: trading book detail is limited, and quarterly noise can swamp secular trends for weeks.",
                "Regulatory headlines can gap stocks regardless of last quarter’s ROE.",
            ],
            [
                "Use <strong>JPM</strong>, <strong>BAC</strong>, and <strong>GS</strong> to practice reading, then pull fresh metrics in Equilima Research. Write one paragraph in your own words on what could go wrong—if you cannot, keep reading.",
            ],
        ),
        (
            "research-dcf-sanity-msft-amzn-meta-education",
            "DCF Sanity Checks Without Fairy Tales: MSFT, AMZN, META as Classroom Examples",
            "Why terminal growth and WACC assumptions dominate outcomes—education, not valuation advice.",
            "Stress-test a DCF: what happens if cloud growth slows 2%? Illustrative only.",
            "Equilima — Research",
            "MSFT, AMZN, META",
            W,
            [
                "<strong>Sensitivity tables beat single-point targets:</strong> Run bear/base/bull on terminal growth for <strong>META</strong> ad pricing, not one heroic guess.",
                "<strong>This week:</strong> Macro rates move discount rates in models—separate that from operating performance at <strong>MSFT</strong> or <strong>AMZN</strong>.",
                "<strong>Not advice:</strong> We teach mechanics, not fair value claims.",
            ],
            [
                "Discounted cash flow models are not truth machines—they are assumption machines. When students slap a 10-year growth rate on <strong>MSFT</strong> because “cloud is big,” they often hide the real driver: terminal growth and WACC. <strong>AMZN</strong> mixes low-margin retail with higher-margin AWS; blended margins make naive DCFs lie unless you segment. <strong>META</strong> reminds you that advertising cyclicality can shrink cash flows faster than a model’s smooth line suggests.",
                "This week, try a classroom exercise: hold revenue growth constant and move WACC by 1%—then move terminal growth by 1%. Observe which dial explodes the present value. That sensitivity intuition is what professionals internalize; it is also why single-number price targets on social media are often entertainment.",
            ],
            [
                "DCF discipline forces explicit forecasts—you see your story in numbers, which reveals hidden optimism.",
                "Segmented models teach you how conglomerates hide weak divisions inside strong ones.",
            ],
            [
                "Garbage in, garbage out: tiny assumption changes create huge fair-value ranges—models can justify many prices.",
                "Short-term markets are not DCF machines; sentiment and flows can dominate for months.",
            ],
            [
                "If you build a DCF on <strong>MSFT</strong>, <strong>AMZN</strong>, or <strong>META</strong>, archive your assumptions with dates. Revisit after the next earnings cycle and learn from what broke—not from whether the stock moved your way.",
            ],
        ),
        (
            "research-10k-walkthrough-risks-mdna-pg-ko",
            "10-K Deep Dive Skills: Risk Factors & MD&amp;A Tone (PG, KO as Stable Examples)",
            "Learn to read risk factors and management tone without trading on headlines.",
            "Consumer staples can teach baseline reading skills before tackling more volatile names.",
            "Equilima — Research",
            "PG, KO",
            W,
            [
                "<strong>Risk factors are boilerplate—until they are not:</strong> Diff year-over-year wording in <strong>PG</strong> or <strong>KO</strong> filings can flag emerging issues.",
                "<strong>This week:</strong> Inflation pass-through and volume vs price stories still show up in staples—practice extracting them.",
                "<strong>Equilima Research</strong> complements reading with live data.",
            ],
            [
                "Beginners should practice on companies with slower narrative spin. <strong>PG</strong> and <strong>KO</strong> may look “boring,” but that is why they are good classrooms: you can focus on SKU mix, pricing power language, and geographic splits without a new meme each hour. Read the risk section twice—once for legal boilerplate, once for anything that changed materially versus last year.",
                "MD&amp;A tone matters: passive voice around challenges versus active plans to fix them is a soft signal worth noting—not a trade trigger, but a diligence cue. This week, if macro data surprises, staples can still move; your filing read tells you whether the business story actually changed or the market is repricing everything.",
            ],
            [
                "Stable examples reduce cognitive load so you learn mechanics you will reuse on harder names.",
                "Year-over-year diffing builds a habit lawyers and analysts use daily.",
            ],
            [
                "Staples can still derail on input costs, FX, or litigation—\"safe\" is never zero risk.",
                "Slow stocks can stay cheap for years—reading well does not imply timing.",
            ],
            [
                "Finish with a one-page memo: three risks you think the market underweights for <strong>PG</strong> or <strong>KO</strong>, and three mitigants management claims—then check those claims next quarter.",
            ],
        ),
    ]
)

# —— Crypto × 5 ——
WC = "early April 2026, when crypto equity proxies and BTC volatility still spill into risk sentiment"
ARTICLES.extend(
    [
        (
            "crypto-btc-eth-risk-frame-education",
            "BTC &amp; ETH: A Risk Framework for Learners (Not a Trade Plan)",
            "Volatility, liquidity, and custody basics—education only; crypto is highly speculative.",
            "Why correlation to SPY sometimes rises—and why that does not make BTC a stock.",
            "Equilima — Crypto",
            "BTC, ETH",
            WC,
            [
                "<strong>Volatility is a feature:</strong> Two sigma days can erase weeks of gains—size accordingly if you participate at all.",
                "<strong>This week:</strong> Watch whether macro shocks move <strong>BTC</strong> like a high-beta tech basket versus a separate liquidity pool.",
                "<strong>Equilima Crypto tab:</strong> Use charts to study, not to chase.",
            ],
            [
                "Bitcoin and Ethereum are not equities—they have different market structure, custody paths, and regulatory treatment. Yet in stress weeks, they sometimes trade with risk assets because leveraged participants liquidate everything. That correlation is unstable; treating <strong>BTC</strong> as “just another ticker” is a category error that has burned learners who borrowed the wrong mental model from <strong>NVDA</strong> charts.",
                "Education starts with definitions: spot, futures basis, staking yield semantics, and what can break in a bridge hack. If you cannot explain custody, you are not ready to size exposure—regardless of what moved this week.",
            ],
            [
                "A clear risk framework reduces panic: you predefine what evidence would change your view.",
                "Studying ETH network fees and BTC mempool dynamics teaches real supply/demand drivers beyond slogans.",
            ],
            [
                "Frameworks do not stop exchange failures, regulatory shocks, or smart-contract bugs.",
                "Correlation regimes flip—what hedged last month may not hedge next month.",
            ],
            [
                "If you use Equilima’s crypto views, journal entries: what you think you know, what would falsify it, and what you still do not understand. Speculation without journaling is repetition without learning.",
            ],
        ),
        (
            "crypto-coin-mstr-equity-proxies-education",
            "COIN, MSTR &amp; Crypto Proxies in Equities: What the Stock Is Actually Pricing",
            "How listed proxies embed bitcoin beta and operating risk—examples, not picks.",
            "Why COIN earnings can diverge from BTC day-to-day.",
            "Equilima — Crypto",
            "COIN, MSTR, BTC",
            WC,
            [
                "<strong>Operating leverage matters:</strong> <strong>COIN</strong> is an exchange business with cycle and regulatory risk, not a spot coin.",
                "<strong>MSTR-style treasuries</strong> embed leverage narratives—read filings, not memes.",
                "<strong>Not recommendations:</strong> Illustrative tickers only.",
            ],
            [
                "When <strong>BTC</strong> rallies, crypto-related equities often jump faster—and fall faster—because they combine spot beta with business risk. <strong>COIN</strong> revenue mixes trading fees, interest on stablecoins, and international expansion costs that do not move lockstep with a Saturday night candle. Treasury-heavy stories add financial engineering literacy requirements: understand convertibles, dilution, and how accounting choices interact with volatile assets.",
                "This week, if equity indices wobble, watch whether crypto proxies lead or lag <strong>BTC</strong>—that relationship teaches you who is forced to de-risk and when.",
            ],
            [
                "Equity proxies let traditional investors study crypto themes with familiar reporting—10-Qs still matter.",
                "Separating operating value from embedded asset beta clarifies what you are actually betting on.",
            ],
            [
                "Proxies can underperform spot in bull markets and overperform in relief rallies—basis risk is real.",
                "Single-name headlines (lawsuits, outages) can swamp coin moves for days.",
            ],
            [
                "Pick one proxy, read one quarterly filing section on risk, and map it to three chart patterns you observed—build a bridge between accounting and price, not a trade thesis from Equilima.",
            ],
        ),
        (
            "crypto-alt-liquidity-sol-advanced-risk",
            "Altcoin Liquidity Lessons: Why SOL Moves Hit Different Than Large Caps",
            "Thin books, vesting, and exchange listings—conceptual education using SOL as example.",
            "Slippage and wallet risk for learners exploring beyond BTC/ETH.",
            "Equilima — Crypto",
            "SOL, BTC, ETH",
            WC,
            [
                "<strong>Liquidity is local:</strong> The coin you buy on one venue may not exit easily elsewhere.",
                "<strong>This week:</strong> Volatility clusters can widen spreads—assume worse fills than the chart suggests.",
                "<strong>High risk:</strong> Many altcoins go to zero; treat as tuition budget only.",
            ],
            [
                "Altcoins often trade like venture equity with 24/7 marks: narratives shift fast, unlock schedules matter, and liquidity can disappear on Sunday nights. Using <strong>SOL</strong> as a teaching example, study how network usage metrics relate to token velocity—but remember metrics can be gamed and narratives can detach.",
                "Compare depth on major pairs versus exotic pairs; imagine selling 2% of daily volume versus 0.02%—your realized price changes. This is why professionals stress sizing and why Equilima treats crypto education as risk education first.",
            ],
            [
                "Liquidity awareness prevents fantasy fills; you learn to respect order books.",
                "On-chain metrics can complement price—when interpreted skeptically.",
            ],
            [
                "Exchange listings, hacks, and regulatory bans can gap prices beyond any on-chain story.",
                "Correlation to <strong>BTC</strong> can spike to ~1 in crashes—diversification may fail exactly when needed.",
            ],
            [
                "If you explore alt markets, write down maximum loss you can afford—then assume you lose it. Anything else is self-deception, not research.",
            ],
        ),
        (
            "crypto-regulatory-headlines-reading-education",
            "Reading Crypto Regulatory Headlines Without Panic-Selling (Education)",
            "Enforcement actions, ETF flows, and tax reporting—general concepts, not legal advice.",
            "Separate noise from structural rule changes—this week’s news cycle practice.",
            "Equilima — Crypto",
            "BTC, ETH, COIN",
            WC,
            [
                "<strong>Not legal advice:</strong> Rules vary by jurisdiction; verify with counsel for your situation.",
                "<strong>This week:</strong> Headlines move fast—wait for primary sources before rewriting a thesis.",
                "<strong>Process:</strong> Tag news as “sentiment” vs “structure.”",
            ],
            [
                "Regulatory news is a sentiment supercharger: a single filing or speech snippet can move <strong>BTC</strong> and listed proxies like <strong>COIN</strong> within minutes. Learners should build a triage habit: Is this a proposed rule, an enforcement action, a court decision, or a politician’s quote? Each category has different persistence. ETF flow narratives can dominate weeks even when on-chain fundamentals barely budge.",
                "Tax and reporting obligations are real friction—education means reading IRS summaries and exchange 1099 FAQs, not trusting influencers. This week, practice summarizing one article in one sentence: what changed legally versus what changed emotionally?",
            ],
            [
                "Better classification reduces whipsaw—you react to durable changes, not every tweet.",
                "Understanding reporting builds compliance hygiene if you participate.",
            ],
            [
                "You can still lose money on correct macro reads if execution or custody fails.",
                "Rules change—yesterday’s structure may not apply tomorrow.",
            ],
            [
                "Keep a log of headlines you traded on emotionally versus ones you verified—your future self will thank you.",
            ],
        ),
        (
            "crypto-portfolio-sizing-btc-eth-stables-education",
            "Sizing, Stables, and Sleep: A Sober Crypto Portfolio Lesson (Illustrative)",
            "Why stablecoins, leverage, and concentration interact—education not allocation advice.",
            "Think in max loss, not max gain—examples with BTC/ETH.",
            "Equilima — Crypto",
            "BTC, ETH",
            WC,
            [
                "<strong>Leverage magnifies mistakes:</strong> Education-only warning—many blowups are sizing blowups.",
                "<strong>Stablecoins carry their own risks:</strong> Issuer, reserve, and depeg history matter.",
                "<strong>Equilima does not know your net worth:</strong> We cannot size for you.",
            ],
            [
                "Portfolio math is boring until it saves you. If you size <strong>BTC</strong> like a lottery ticket but mentally treat it like savings, you will make emotional decisions at the worst prices. A learning exercise is to write max loss in dollars, not percent—then compare to monthly expenses. Stablecoins are not risk-free cash: issuer transparency and bank-channel risk matter, especially in stress weeks.",
                "This week, if macro data spikes volatility, watch how leveraged positions cascade through funding rates—another reason education focuses on survival first.",
            ],
            [
                "Explicit max-loss planning reduces ruin risk; you trade from a plan, not adrenaline.",
                "Understanding stables teaches you plumbing—how money actually moves in crypto.",
            ],
            [
                "Plans do not stop black-swan exchange halts or smart-contract failures.",
                "Stablecoins have depegged before—assume tail risk exists.",
            ],
            [
                "Use Equilima’s crypto charts to visualize volatility regimes—then decide if your lifestyle can tolerate them without leverage.",
            ],
        ),
    ]
)

# —— Screener × 5 (first reuses expanded themes) ——
WS = "early April 2026, when factor crowding and earnings gaps make disciplined universes valuable"
ARTICLES.extend(
    [
        (
            "screener-liquidity-first-unh-jpm-xom",
            "Screener Playbook #1: Liquidity &amp; Tradability First (UNH, JPM, XOM examples)",
            "Why ADV and spreads belong at the top of your funnel—education, not a screen recipe.",
            "Build a short list you can actually exit—illustrative large caps.",
            "Equilima — Screener",
            "UNH, JPM, XOM",
            WS,
            [
                "<strong>Liquidity gates:</strong> Exclude names you cannot trade at your size without moving price.",
                "<strong>Examples:</strong> <strong>UNH</strong>, <strong>JPM</strong>, <strong>XOM</strong> often pass retail liquidity tests—still not buys by default.",
                "<strong>Equilima Screener:</strong> Encode rules you can repeat weekly.",
            ],
            [
                "Screens that ignore liquidity produce fantasy portfolios. A name can look perfect on ROIC and growth, but if average dollar volume is thin, your realized return includes impact costs the backtest forgot. Starting with examples like <strong>JPM</strong> or <strong>XOM</strong> teaches the habit: check spreads, check depth, check corporate action calendars. <strong>UNH</strong> illustrates how healthcare giants can be liquid yet still gap on regulatory headlines—liquidity reduces friction, not risk.",
                "This week, if volatility clusters around macro prints, liquidity can vanish faster than fundamentals change—your screen should survive that reality.",
            ],
            [
                "You avoid the classic mistake of loving illiquid story stocks you cannot exit.",
                "Repeatable liquidity rules make week-to-week comparisons honest.",
            ],
            [
                "Liquid names still gap on earnings—liquidity is not safety.",
                "Over-tight filters can empty your universe to nothing actionable.",
            ],
            [
                "Run one liquidity-first screen in Equilima, export results, and verify ADV yourself on a second source—build trust in your pipeline.",
            ],
        ),
        (
            "screener-quality-factors-pg-ko-pep",
            "Screener Playbook #2: Quality Factors Without Hero Worship (PG, KO, PEP)",
            "Margins, ROIC, and leverage screens—consumer staples as teaching examples.",
            "Why ‘quality’ is a bundle of metrics, not a vibe.",
            "Equilima — Screener",
            "PG, KO, PEP",
            WS,
            [
                "<strong>Define quality:</strong> Pick 3–4 metrics and document why each matters.",
                "<strong>Staples examples:</strong> <strong>PG</strong>, <strong>KO</strong>, <strong>PEP</strong> show durability vs growth tradeoffs.",
                "<strong>No rank:</strong> Equilima does not publish Buy/Hold/Sell.",
            ],
            [
                "Quality investing is often taught as a personality trait (“buy wonderful businesses”). In practice, it is a set of measurable patterns: gross margin stability, cash conversion, and sensible leverage. Screens on <strong>PG</strong>, <strong>KO</strong>, and <strong>PEP</strong> show how mature brands produce cash—but also how slow growth can mean multiple compression for years. Your screener should encode what you mean by quality, not import someone else’s slogan.",
                "This week, if rates move, ‘bond-proxy’ staples can swing too—quality is not the same as rate-immune.",
            ],
            [
                "Explicit metrics reduce storytelling bias—you see who actually passes tests.",
                "Staples teach baseline comparisons before you screen cyclicals.",
            ],
            [
                "Quality can underperform furious rallies in speculative names for long stretches.",
                "Accounting choices can flatter ROIC—verify with cash flow.",
            ],
            [
                "Build two screens: ‘quality strict’ vs ‘quality lenient’—count names and study overlaps. That exercise teaches sensitivity.",
            ],
        ),
        (
            "screener-momentum-nvda-meta-tsla-caveats",
            "Screener Playbook #3: Momentum With Guardrails (NVDA, META, TSLA caveats)",
            "Relative strength and trend filters—why you still need risk controls.",
            "Examples of high-beta names that pass momentum screens then mean-revert brutally.",
            "Equilima — Screener",
            "NVDA, META, TSLA",
            WS,
            [
                "<strong>Momentum is not prophecy:</strong> Trends persist until positioning exhausts.",
                "<strong>This week:</strong> AI leaders like <strong>NVDA</strong> can dominate screens—ask what invalidates the trend.",
                "<strong>Risk:</strong> Add drawdown or volatility caps in your process.",
            ],
            [
                "Momentum screens surface what worked—danger arrives when you confuse persistence with guarantee. <strong>META</strong> and <strong>TSLA</strong> are poster children for narrative velocity: flows can push prices far from fundamentals, then reverse hard. <strong>NVDA</strong> in 2026 is a case study in capex cycles colliding with sentiment. A learning approach pairs momentum with liquidity, valuation sanity, or event risk filters—not because fundamentals always win short term, but because survivability matters.",
                "This week, note how single-stock options activity can distort price discovery—your screen sees strength; the options book may show fragility.",
            ],
            [
                "Momentum plus guardrails teaches trend participation without cult behavior.",
                "You learn to define exit rules before entry—professional habit.",
            ],
            [
                "Guardrails can exit too early in parabolic regimes—there is no free lunch.",
                "Crowded factors can unwind simultaneously—diversification assumptions break.",
            ],
            [
                "Paper-trade a momentum screen with a forced stop rule—see how often stops save you versus chop you out.",
            ],
        ),
        (
            "screener-value-cvs-wba-contrarian",
            "Screener Playbook #4: ‘Cheap’ vs ‘Value Trap’ (CVS, WBA-style examples)",
            "Low P/E can signal distress—education on balance sheet red flags.",
            "Why screens need debt and FCF checks, not just multiples.",
            "Equilima — Screener",
            "CVS, WBA",
            WS,
            [
                "<strong>Multiple alone lies:</strong> Pair P/E with leverage, coverage, and FCF.",
                "<strong>Pharmacy/retail examples:</strong> <strong>CVS</strong>, <strong>WBA</strong>-type stories show operating pressure vs headline cheapness.",
                "<strong>Diligence:</strong> Read why the market is skeptical.",
            ],
            [
                "Value screens without quality checks are trap generators. A low multiple often prices real operational risk: reimbursement pressure, integration costs, or structural share loss. Using <strong>CVS</strong>- or <strong>WBA</strong>-style narratives, learners practice asking: Is cheapness cyclical or secular? Is debt funding buybacks or repairs? Is FCF stable or propped by working capital tricks?",
                "This week, if defensive rotations chatter picks up, ‘cheap’ defensives can still be value traps—your screen should surface leverage, not just yield.",
            ],
            [
                "You learn to respect the market’s skepticism instead of fighting it blindly.",
                "Combining multiples with balance-sheet health screens reduces obvious traps.",
            ],
            [
                "Some traps are genuinely misunderstood—screens cannot measure management quality.",
                "Turnarounds take years; screens refresh faster than operations fix.",
            ],
            [
                "For every ‘cheap’ name your screen finds, write one paragraph: ‘Why might the market be right to hate this?’ If you cannot, you have not finished.",
            ],
        ),
        (
            "screener-dividend-schd-style-jnj-pfe",
            "Screener Playbook #5: Dividend Durability, Not Just Yield (JNJ, PFE-style framing)",
            "Payout ratios, FCF coverage, and sector shocks—education only.",
            "High yield can precede cuts—learn warning signs.",
            "Equilima — Screener",
            "JNJ, PFE",
            WS,
            [
                "<strong>Yield is not income certainty:</strong> Check coverage and cyclicality.",
                "<strong>Healthcare examples:</strong> <strong>JNJ</strong> vs <strong>PFE</strong> illustrate different patent/cliff risks.",
                "<strong>Equilima Screener:</strong> Stack payout metrics with leverage tests.",
            ],
            [
                "Dividend investors often screen for highest yield first—that sorts toward distress. A durability approach asks: Is the dividend covered by free cash flow through a mild recession? What happens if R&amp;D fails or patents roll off? Comparing <strong>JNJ</strong>-style conglomerate resilience with <strong>PFE</strong>-style patent-cliff sensitivity is educational framing, not a call on either name.",
                "This week, if rates bounce, yield seekers rotate—your process should distinguish sustainable income from lottery tickets.",
            ],
            [
                "Durability screens focus on cash, not promises—fewer dividend surprises.",
                "You learn sector-specific risks that generic yield sorts miss.",
            ],
            [
                "Even durable dividends can freeze during crises—boards have discretion.",
                "Tax and foreign withholding complicate real yield—screens do not capture personal tax.",
            ],
            [
                "Build a dividend screen with FCF coverage &gt;1.2x and net debt/EBITDA caps—then read the footnote on why one high yielder fails your test.",
            ],
        ),
    ]
)

# —— Backtest × 5 ——
WB = "early April 2026, when hypothetical strategy posts flood social feeds—learn to verify"
ARTICLES.extend(
    [
        (
            "backtest-walk-forward-spy-qqq-education",
            "Walk-Forward Testing: Why One Window Lies (SPY, QQQ Education)",
            "Holdout samples and parameter stability—hypothetical examples only.",
            "Learn to split history so you are not peeking at the future.",
            "Equilima — Backtest",
            "SPY, QQQ",
            WB,
            [
                "<strong>Out-of-sample discipline:</strong> Tune on train, evaluate on holdout.",
                "<strong>Indices as teachers:</strong> <strong>SPY</strong>/<strong>QQQ</strong> show regime shifts clearly.",
                "<strong>Hypothetical:</strong> Past results may not repeat.",
            ],
            [
                "Walk-forward testing is how you simulate the experience of not knowing tomorrow. If you optimize a rule on all history including 2023–2025, you are implicitly cheating because you already saw those shocks. Instead, train on an earlier window, freeze parameters, and test forward—then roll the window. On <strong>SPY</strong>, you will see trend rules that shined in grinds and died in chop; on <strong>QQQ</strong>, tech-heavy drawdowns teach correlation shocks.",
                "This week, ignore any ‘perfect’ backtest that does not show multiple walk segments—ask what happened in 2018, 2020, and 2022 separately.",
            ],
            [
                "You internalize that edge is rare and fragile—healthy skepticism.",
                "Rolling tests reveal parameter drift before you commit capital.",
            ],
            [
                "Walk-forward reduces but does not eliminate overfitting—you can still luck into segments.",
                "Transaction costs still understate pain in live trading.",
            ],
            [
                "Run a two-window experiment in Equilima Backtest: tune on 2010–2018, test 2019–2024—journal where the rule broke.",
            ],
        ),
        (
            "backtest-costs-slippage-education",
            "Costs, Slippage, and the Death of Tiny Edges (Education)",
            "Commissions, spreads, and taxes eat hypothetical alpha—illustrative.",
            "Why retail ‘edges’ vanish when you model friction honestly.",
            "Equilima — Backtest",
            "SPY, IWM",
            WB,
            [
                "<strong>Friction is real:</strong> Add conservative slippage before bragging.",
                "<strong>Small caps:</strong> <strong>IWM</strong> constituents punish fantasy fills more than <strong>SPY</strong>.",
                "<strong>Not advice:</strong> Model, don’t promise.",
            ],
            [
                "Many viral backtests assume you buy the close and sell the open with no slip—markets do not work that way. Adding a few basis points per side changes compounding dramatically over hundreds of trades. When you test rules on <strong>IWM</strong>-like universes, impact costs dominate faster than on <strong>SPY</strong>. Taxes and borrow for shorts are another layer retail sims ignore.",
                "This week, if volatility pops, spreads widen—your hypothetical backtest from calm 2024 data lies politely.",
            ],
            [
                "Honest cost modeling prevents fairy-tale compounding curves.",
                "You learn why institutions care about execution algorithms.",
            ],
            [
                "Even good models cannot predict black-swan halts or liquidity vacuums.",
                "Over-estimating costs can also discard real learning—calibrate thoughtfully.",
            ],
            [
                "Re-run your favorite rule with double your assumed costs—if it dies, it was never robust.",
            ],
        ),
        (
            "backtest-overfitting-degrees-freedom",
            "Overfitting: Count Your Degrees of Freedom Before You Trust a Curve",
            "Why more parameters mean less trust—conceptual education.",
            "Sanity checks: simpler rules, fewer indicators, more skepticism.",
            "Equilima — Backtest",
            "QQQ, SPY",
            WB,
            [
                "<strong>Occam’s razor:</strong> If it needs five tweaks, it is probably art, not science.",
                "<strong>This week:</strong> Ignore strategies with more knobs than trades.",
                "<strong>Use Equilima Backtest</strong> to test simplification, not complication.",
            ],
            [
                "Each indicator, threshold, and filter is a degree of freedom—another chance to fit noise. Professionals count them; amateurs add RSI, MACD, Bollinger, volume filters, then marvel at in-sample CAGR. On <strong>QQQ</strong>, a two-parameter trend rule often survives scrutiny better than a twelve-parameter monster because it has fewer ways to lie. Simplicity is not guaranteed alpha—it is intellectual honesty.",
                "This week’s lesson: delete half your indicators and see if performance collapses—if yes, you were curve-fitting.",
            ],
            [
                "Simpler rules are easier to monitor and less likely to break silently.",
                "You build immunity to marketing backtests.",
            ],
            [
                "Simple can still be wrong for future regimes.",
                "Some edges are genuinely multi-factor—oversimplification loses signal.",
            ],
            [
                "Write your rule in one English sentence—if you need a paragraph, simplify before backtesting further.",
            ],
        ),
        (
            "backtest-regime-change-2020-2022-education",
            "Regime Change Lessons: 2020 vs 2022 for Strategy Humility",
            "Volatility spikes and rate shocks break naive rules—hypothetical education.",
            "Why a rule that ‘worked’ in one era dies in another.",
            "Equilima — Backtest",
            "SPY, QQQ",
            WB,
            [
                "<strong>Stress windows matter:</strong> Test 2020 liquidity crash and 2022 rate shock.",
                "<strong>Correlations jump:</strong> Diversification assumptions fail in stress.",
                "<strong>Past hypothetical:</strong> Not predictive.",
            ],
            [
                "2020 rewarded liquidity provision and bounce buyers; 2022 punished duration and high multiple growth. A momentum system might have thrived then choked; a mean-reversion system might have died then thrived. If your backtest only includes 2017–2019, you learned about low-vol grinds, not full cycles. Use <strong>SPY</strong> and <strong>QQQ</strong> as benchmarks while you stress your toy strategy—ask max drawdown, not max Instagram likes.",
                "This week, whenever someone posts a smooth equity curve, ask which regime funded it.",
            ],
            [
                "Regime awareness stops you from assuming the future rhymes perfectly.",
                "You learn to classify environments: rates up/down, vol up/down.",
            ],
            [
                "Regime labels are obvious in hindsight, fuzzy live.",
                "Even robust rules can underperform for years—patience vs stubbornness is subjective.",
            ],
            [
                "Overlay your hypothetical equity curve with a simple VIX or rates chart—note where pain clusters; plan mentally, not from Equilima advice.",
            ],
        ),
        (
            "backtest-position-sizing-kelly-caution",
            "Position Sizing &amp; Kelly Caution: Why Full Kelly Wrecks Retail Accounts",
            "Fractional sizing, max loss, and drawdown math—education not sizing advice.",
            "Illustrative why leverage magnifies estimation error.",
            "Equilima — Backtest",
            "SPY",
            WB,
            [
                "<strong>Estimation error dominates:</strong> Kelly uses unknown true probabilities.",
                "<strong>Fractional Kelly:</strong> Often discussed academically—still not personalized advice.",
                "<strong>Risk of ruin:</strong> Non-zero even with ‘edge’.",
            ],
            [
                "Kelly criterion math is elegant; real life gives you wrong win rates and correlated losses. Full Kelly on a mis-estimated edge is a fast path to ruin. Even half-Kelly can be aggressive if your drawdown tolerance is human, not spreadsheet. Using <strong>SPY</strong> as a boring benchmark, learners can simulate how a 20% strategy drawdown feels when leveraged 2x versus 1x—emotionally and mathematically.",
                "This week, if you see promoters quoting huge CAGR with huge leverage, run a drawdown table before dreaming.",
            ],
            [
                "Sizing education connects backtests to survivability—where most retail research dies.",
                "You learn to separate expected value from acceptable loss.",
            ],
            [
                "No formula knows your job security, health, or need for cash next month.",
                "Leverage providers can liquidate you before mean reversion arrives.",
            ],
            [
                "In Equilima Backtest, stress the same rule at half and full hypothetical size—feel how drawdown scales nonlinearly.",
            ],
        ),
    ]
)

# —— Markets × 5 ——
WM = "early April 2026 tape: breadth, rates, and sector rotation in the headlines"
ARTICLES.extend(
    [
        (
            "markets-breadth-spy-qqq-iwm-education",
            "Breadth Basics: When SPY Lies and IWM Tells the Truth",
            "Advance/decline and equal-weight intuition—education using major ETFs as examples.",
            "Why a green SPY day can mask ugly internals.",
            "Equilima — Markets",
            "SPY, QQQ, IWM",
            WM,
            [
                "<strong>Headline index ≠ average stock:</strong> Check breadth before narrating.",
                "<strong>This week:</strong> Mega-cap AI leaders can lift <strong>QQQ</strong> while <strong>IWM</strong> lags.",
                "<strong>Equilima Markets:</strong> Visualize context, not prophecy.",
            ],
            [
                "Market breadth measures how many stocks participate in a move. When <strong>SPY</strong> grinds higher on five names while decliners lead advancers, technicians call it a thin rally—fragile if leaders stall. <strong>IWM</strong> participation often signals whether risk appetite is broad or concentrated. <strong>QQQ</strong> leadership can be fundamental (earnings) or positional (flows)—breadth helps you guess which.",
                "This week, practice describing the tape in two sentences: index move + breadth move. If you cannot, you are narrating tickers, not markets.",
            ],
            [
                "Breadth awareness prevents false confidence during narrow rallies.",
                "You learn to pair macro headlines with micro participation.",
            ],
            [
                "Breadth can improve late in a move—timing signals are noisy.",
                "Some secular bull markets stay narrow for long periods—breadth is not destiny.",
            ],
            [
                "Track one breadth metric for five sessions alongside <strong>SPY</strong>—note divergences; verify in Equilima Markets.",
            ],
        ),
        (
            "markets-sector-rotation-xlre-xlk-education",
            "Sector Rotation 101: XLRE vs XLK and the Macro Dial",
            "Defensive vs growth tilt—ETF tickers as teaching handles only.",
            "Why rates and growth scare shift sector leadership.",
            "Equilima — Markets",
            "XLK, XLF, XLE",
            WM,
            [
                "<strong>Sectors express macro bets:</strong> Tech vs financials vs energy often rotate with rates and oil.",
                "<strong>This week:</strong> Watch whether <strong>XLK</strong> holds up if yields spike.",
                "<strong>Not a rotation call from Equilima:</strong> Framework only.",
            ],
            [
                "Sector ETFs like <strong>XLK</strong> bundle single-theme risk; <strong>XLF</strong> encodes curve and credit expectations; <strong>XLE</strong> tracks energy macro. Rotation is not a calendar trick—it is capital repricing growth, inflation, and risk appetite. Learners should map: rates up, which sectors historically struggled in textbooks—then verify live with data instead of memes.",
                "This week, if CPI surprises, notice whether defensives outperform cyclicals—that is a clue about the dominant macro fear, not a buy signal from us.",
            ],
            [
                "Rotation framing helps you interpret news without stock-picking every headline.",
                "ETF handles simplify sector beta for learners.",
            ],
            [
                "Historical sector relationships break in idiosyncratic shocks.",
                "ETFs rebalance and change—know what you hold.",
            ],
            [
                "Pick two sectors, write one macro variable each is sensitive to—then watch Equilima Markets for a week to see if your map helps.",
            ],
        ),
        (
            "markets-vix-vol-regime-education",
            "VIX and Vol Regimes: Fear Gauges Without Crystal Balls",
            "Implied volatility as sentiment—not a timing oracle.",
            "Why vol spikes cluster around macro events in April 2026 context.",
            "Equilima — Markets",
            "SPY, VIX",
            WM,
            [
                "<strong>VIX measures option demand:</strong> Not identical to realized volatility.",
                "<strong>Event clustering:</strong> FOMC/CPI weeks often lift vol.",
                "<strong>Risk:</strong> Short vol strategies can blow up—education warns, not recommends.",
            ],
            [
                "The VIX is often misread as ‘fear’ without acknowledging its construction: it is forward-looking implied vol on <strong>SPY</strong> options, shaped by demand for hedges. It can rise before events and collapse after—even if the world still feels uncertain. Learners should study vol regimes: low vol grind, rising vol transition, and panic spike. This week, if macro calendars are heavy, expect wider intraday ranges in index futures—plan position sizing mentally, not from Equilima.",
                "Comparing implied vs realized vol teaches whether options are expensive—useful conceptually, dangerous if traded naively.",
            ],
            [
                "Vol literacy reduces surprise when single-stock options warp prices.",
                "You learn event-risk planning without claiming edge.",
            ],
            [
                "Vol can stay elevated after spikes—mean reversion is not guaranteed on your timeline.",
                "Complex vol products exist—this article does not teach them operationally.",
            ],
            [
                "Log pre-event VIX and post-event moves for three events—build intuition, not a trading system from Equilima.",
            ],
        ),
        (
            "markets-rates-curve-tlt-education",
            "Rates &amp; the Curve: Why TLT Moves Ripple Through Stocks",
            "Duration, discounts, and growth multiples—bond ETF as teaching example.",
            "Not bond trading advice—macro literacy for equity investors.",
            "Equilima — Markets",
            "TLT, SPY",
            WM,
            [
                "<strong>Rates hit present value:</strong> Long-duration cash flows move more when yields jump.",
                "<strong>TLT as educator:</strong> See bond price sensitivity without picking corporates.",
                "<strong>This week:</strong> Dot plot chatter can move curves—separate from single-stock stories.",
            ],
            [
                "When long yields rise, growth equities often reprice faster than short-duration cash cows because more value sits in distant cash flows. <strong>TLT</strong> declines illustrate duration math viscerally. <strong>SPY</strong> aggregates many durations—mega-cap mix matters. This week, if you hear ‘rates up, stocks must fall,’ ask which stocks—banks may behave differently than software.",
                "Equilima Markets helps you watch these moves concurrently so you stop treating rates and equities as unrelated TV channels.",
            ],
            [
                "Rates literacy explains multiple compression without moralizing about bubbles.",
                "You connect Fed communication to discount-rate intuition.",
            ],
            [
                "Stocks can rally with yields if growth surprises dominate—single-factor stories fail.",
                "Bond ETFs carry roll and convexity nuances—do not oversimplify blindly.",
            ],
            [
                "Plot one week of <strong>TLT</strong> vs <strong>SPY</strong> returns—write a paragraph on correlation; revise after the next CPI.",
            ],
        ),
        (
            "markets-global-fx-efa-education",
            "Global Tape: FX Shocks and EFA for U.S.-Only Investors",
            "Why DXY moves hit multinationals—international ETF as example.",
            "Currency literacy without forex trading advice.",
            "Equilima — Markets",
            "DXY, EFA, AAPL",
            WM,
            [
                "<strong>Strong dollar headwind:</strong> Overseas earnings translated lower—think <strong>AAPL</strong>-style exposure conceptually.",
                "<strong>EFA</strong> shows non-U.S. beta for learners curious abroad.",
                "<strong>Not FX trade advice:</strong> Macro education.",
            ],
            [
                "U.S. investors often ignore FX until it punches EPS. A stronger dollar can compress reported international revenue for multinationals; a weaker dollar can flatter it—accounting is messy and hedging varies. <strong>EFA</strong>-style international equity exposure adds currency beta U.S. indices hide. <strong>DXY</strong> is an index, not a trade recommendation—use it to contextualize headlines.",
                "This week, if geopolitical headlines move FX, check whether your stock story is fundamentally domestic or global before blaming ‘random volatility.’",
            ],
            [
                "Global framing stops you from misattributing stock moves to idiosyncratic stories.",
                "You learn translation effects and revenue geography from filings—not tweets.",
            ],
            [
                "FX can mean-revert slowly—macro trades require patience and expertise.",
                "International ETFs carry tax and dividend quirks—read prospectuses.",
            ],
            [
                "Open a multinational 10-K segment note—map revenue by region—then watch <strong>DXY</strong> for a week alongside Equilima Markets.",
            ],
        ),
    ]
)


def build_entry(t: tuple) -> dict:
    slug, title, meta, excerpt, cluster, tickers, week, bullets, snap, bull, bear, bottom = t
    snapshot = "".join(p(x) for x in snap)
    bull_html = "".join(p(x) for x in bull)
    bear_html = "".join(p(x) for x in bear)
    bottom_html = "".join(p(x) for x in bottom)
    body = body_for(
        title=title,
        cluster=cluster,
        tickers=tickers,
        week=week,
        bullets=bullets,
        snapshot=snapshot,
        bull=bull_html,
        bear=bear_html,
        bottom=bottom_html,
    )
    return {
        "slug": slug,
        "title": title,
        "meta_description": meta,
        "excerpt": excerpt,
        "cluster_key": cluster,
        "body": body,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for t in ARTICLES:
        entry = build_entry(t)
        body = entry.pop("body")
        (OUT / f"{entry['slug']}.html").write_text(body, encoding="utf-8")
        manifest.append(
            {
                "slug": entry["slug"],
                "title": entry["title"],
                "meta_description": entry["meta_description"],
                "excerpt": entry["excerpt"],
                "cluster_key": entry["cluster_key"],
            }
        )
    (OUT / "manifest.json").write_text(json.dumps({"articles": manifest}, indent=2), encoding="utf-8")
    print(f"Wrote {len(manifest)} hub articles (5 each × 5 categories) to {OUT}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Generate 25 Equilima Learn hub articles (5 per category), each ≥1500 words.
Plain-language educational tone, bundled hero JPEGs (/learn/hubs/), inline SVG diagrams.

Run from repo root: python3 backend/scripts/generate_learn_tool_hubs.py
"""
from __future__ import annotations

import hashlib
import json
import random
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from learn_hub_paragraph_bank import (
    ARTICLE_HOOKS,
    CLUSTER_OPENERS,
    GPARAS,
    READABILITY_PARAS,
    ZACKS_SECTION_TITLES,
)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "learn_tool_hubs"

MIN_WORDS = 1500

# Bundled heroes: frontend/public/learn/hubs/hero-NN.jpg (see CREDITS.md). Same-origin = reliable loads.
HERO_CREDITS: list[tuple[str, str]] = [
    ("Austin Distel", "https://unsplash.com/@austindistel"),
    ("Luke Chesser", "https://unsplash.com/@lukechesser"),
    ("Cytonn Photography", "https://unsplash.com/@cytonn_photography"),
    ("Burak Kabak", "https://unsplash.com/@bkabakov"),
    ("Maxim Hopman", "https://unsplash.com/@nampoh"),
    ("Kanchanara", "https://unsplash.com/@kanchanara"),
    ("Kanchanara", "https://unsplash.com/@kanchanara"),
    ("Annie Spratt", "https://unsplash.com/@anniespratt"),
]


def word_count(html: str) -> int:
    plain = re.sub(r"<[^>]+>", " ", html)
    plain = re.sub(r"&[a-z]+;|&#\d+;|&#x[0-9a-f]+;", " ", plain, flags=re.I)
    plain = re.sub(r"\s+", " ", plain).strip()
    return len(plain.split()) if plain else 0


def _tk(tickers_csv: str) -> tuple[str, str, str]:
    ts = [x.strip() for x in tickers_csv.split(",") if x.strip()]
    if not ts:
        return "the example name", "its peer", "a benchmark"
    while len(ts) < 3:
        ts.append(ts[-1])
    return ts[0], ts[1], ts[2]


def _fill(tpl: str, tickers_csv: str, cluster: str, week: str) -> str:
    t0, t1, t2 = _tk(tickers_csv)
    return tpl.format(t0=t0, t1=t1, t2=t2, cluster=cluster, week=week)


def disclaimer_block() -> str:
    return """
<div class="eq-disclaimer rounded-xl border-2 border-amber-400/90 bg-amber-50 p-5 mb-8">
<p class="eq-disclaimer-kicker font-bold text-xs uppercase tracking-widest mb-3 text-amber-900">Important — not financial advice</p>
<p class="eq-p text-[15px] leading-relaxed mb-3 text-neutral-900">Equilima is <strong>not</strong> a registered investment adviser, broker-dealer, or financial planner. This content is for <strong>education and general research commentary</strong> only—not personalized buy/sell/hold advice for your situation. We do <strong>not</strong> publish price targets, ratings, or “our view” as investment recommendations. Investing and crypto involve risk of loss; past performance does not guarantee future results. <strong>Always verify</strong> prices, ratios, and news in Equilima or primary sources; numbers in static articles go stale quickly.</p>
<p class="text-sm leading-relaxed text-neutral-700">Ticker and token symbols are <strong>illustrative examples</strong> for learning, not recommendations. We use straightforward wording on purpose—if you want the short version first, read <strong>Key takeaways</strong>, then the sections below.</p>
</div>
""".strip()


def hero_figure(slug: str, title: str) -> str:
    h = int(hashlib.md5(slug.encode(), usedforsecurity=False).hexdigest(), 16)
    idx = h % len(HERO_CREDITS)
    nn = idx + 1
    photographer, profile = HERO_CREDITS[idx]
    src = f"/learn/hubs/hero-{nn:02d}.jpg"
    alt = f"Illustrative finance and markets imagery for: {title[:80]}"
    return f"""
<figure class="eq-figure my-10">
<img class="eq-figure-img w-full rounded-lg shadow-md" src="{src}" alt="{alt}" width="1600" height="1067" loading="lazy" decoding="async" />
<figcaption class="eq-caption mt-2 text-sm text-neutral-500">Photo by <a href="{profile}?utm_source=equilima&amp;utm_medium=referral" rel="noopener noreferrer" class="eq-a">{photographer}</a> on <a href="https://unsplash.com/?utm_source=equilima&amp;utm_medium=referral" rel="noopener noreferrer" class="eq-a">Unsplash</a> (bundled under Unsplash License — see site credits).</figcaption>
</figure>
""".strip()


def focus_tickers_section(tickers_csv: str, cluster: str, week: str) -> str:
    """Educational lens on 3 example names: news, sentiment, fundamentals, price—no ratings."""
    tpl = """
<h2 class="eq-h2">The names we keep using—and how to think about them (no picks)</h2>
<p class="eq-p eq-plain"><strong>Plain English:</strong> We circle <strong>{t0}</strong>, <strong>{t1}</strong>, and <strong>{t2}</strong> because they are liquid and constantly in the news—good <em>practice objects</em>. Around {week}, the <strong>exact</strong> headlines and moods will already be outdated: always reopen Equilima for live quotes, ratios, and recent catalysts before you rely on any narrative.</p>
<p class="eq-p">Below is <strong>not</strong> “Equilima’s outlook” on these stocks or tokens. It is a <strong>repeatable checklist</strong> pros use so hype does not replace homework. Your job is to fill in the numbers yourself.</p>
<h3 class="eq-h3">{t0}</h3>
<ul class="eq-ul list-disc pl-5 space-y-2 text-[17px] leading-relaxed text-neutral-800 mb-6">
<li><strong>News:</strong> What <em>fact</em> moved (earnings, guidance, regulation, product)? Cross-check with the company’s own filing or press release—not only a headline.</li>
<li><strong>Sentiment / mood:</strong> Are feeds celebrating or panicking? Extreme mood often means risk of snapback; it does not prove fundamentals flipped in a day.</li>
<li><strong>Fundamentals:</strong> In the last report, what happened to revenue growth, margins, and free cash flow versus the prior quarter? One weak line item can matter more than a catchy slogan.</li>
<li><strong>Price &amp; history:</strong> In Equilima, compare today’s price to the 52-week range and longer-term averages. Ask whether the move looks driven by earnings, macro (rates, FX), or pure positioning.</li>
</ul>
<h3 class="eq-h3">{t1}</h3>
<ul class="eq-ul list-disc pl-5 space-y-2 text-[17px] leading-relaxed text-neutral-800 mb-6">
<li><strong>News:</strong> Tie headlines to a dated source. If you cannot find the primary document, downgrade your confidence.</li>
<li><strong>Sentiment / mood:</strong> Options and social buzz can exaggerate short-term swings for {t1}. Notice the mood; do not confuse noise with a thesis.</li>
<li><strong>Fundamentals:</strong> Pick one metric you will track for two quarters (e.g., segment revenue, gross margin dollars, net debt). Consistency beats chasing every new metric name.</li>
<li><strong>Price &amp; history:</strong> Look for divergence: fundamentals stable but price violent usually means macro or liquidity; fundamentals deteriorating with price up means revisit your story.</li>
</ul>
<h3 class="eq-h3">{t2}</h3>
<ul class="eq-ul list-disc pl-5 space-y-2 text-[17px] leading-relaxed text-neutral-800 mb-6">
<li><strong>News:</strong> For {cluster} topics, ask whether the story is <em>stock-specific</em> or <em>everything-rerates</em> (index, sector ETF, rates).</li>
<li><strong>Sentiment / mood:</strong> Crowded trades can unwind fast. If “everyone knows” the story on {t2}, ask what is already priced.</li>
<li><strong>Fundamentals:</strong> Cash beats slogans. Does operating cash flow support the narrative you hear on podcasts?</li>
<li><strong>Price &amp; history:</strong> Zoom out: one bad week is not the same as a broken five-year trend—and vice versa. Let the app show the path; don’t guess from memory.</li>
</ul>
<p class="eq-p eq-muted text-[15px]"><strong>Reminder:</strong> This page is not live. Always double-check prices, ratios, and headlines in Equilima or the original filing before you rely on anything here.</p>
""".strip()
    return _fill(tpl, tickers_csv, cluster, week)


def takeaways_box(cluster: str, bullets: list[str]) -> str:
    bli = "".join(f'<li class="eq-li">{b}</li>' for b in bullets)
    return f"""
<div class="eq-takeaways rounded-2xl p-6 sm:p-7 mb-10">
<p class="eq-kicker text-xs font-semibold uppercase tracking-wider text-violet-800 mb-1">{cluster}</p>
<h2 class="eq-h2 text-xl font-bold text-neutral-900 mb-4">Key takeaways</h2>
<ul class="eq-ul list-disc pl-5 space-y-3 text-[17px] leading-relaxed text-neutral-800">{bli}</ul>
</div>
""".strip()


def svg_diagram(cluster: str, slug: str) -> str:
    h = int(hashlib.md5((slug + cluster).encode(), usedforsecurity=False).hexdigest(), 16)
    if "Research" in cluster:
        return _svg_research_loop(h)
    if "Crypto" in cluster:
        return _svg_crypto_stack(h)
    if "Screener" in cluster:
        return _svg_screener_funnel(h)
    if "Backtest" in cluster:
        return _svg_walk_forward(h)
    return _svg_markets_layers(h)


def _svg_wrap(inner: str, caption: str) -> str:
    return f"""
<figure class="eq-diagram my-10 mx-auto max-w-2xl">
<div class="eq-svg rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">{inner}</div>
<figcaption class="eq-caption mt-2 text-center text-sm text-neutral-500">{caption}</figcaption>
</figure>
""".strip()


def _svg_research_loop(_h: int) -> str:
    inner = """
<svg viewBox="0 0 520 200" xmlns="http://www.w3.org/2000/svg" aria-labelledby="t1" role="img">
<title id="t1">Research workflow: filing to metrics</title>
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7c3aed"/><stop offset="100%" stop-color="#4f46e5"/></linearGradient></defs>
<rect x="10" y="30" width="110" height="50" rx="8" fill="#f5f3ff" stroke="#7c3aed" stroke-width="2"/><text x="65" y="60" text-anchor="middle" font-size="12" font-family="Inter,system-ui,sans-serif" fill="#1e1b4b">10-K / 10-Q</text>
<path d="M125 55 H155" stroke="#64748b" stroke-width="2" marker-end="url(#arr)"/>
<rect x="160" y="30" width="110" height="50" rx="8" fill="#eef2ff" stroke="#4f46e5" stroke-width="2"/><text x="215" y="60" text-anchor="middle" font-size="12" font-family="Inter,system-ui,sans-serif" fill="#1e1b4b">Hypothesis</text>
<path d="M275 55 H305" stroke="#64748b" stroke-width="2"/>
<rect x="310" y="30" width="110" height="50" rx="8" fill="#ecfeff" stroke="#0891b2" stroke-width="2"/><text x="365" y="60" text-anchor="middle" font-size="12" font-family="Inter,system-ui,sans-serif" fill="#164e63">Check metrics</text>
<path d="M425 55 H455" stroke="#64748b" stroke-width="2"/>
<rect x="460" y="30" width="50" height="50" rx="25" fill="url(#g)"/><text x="485" y="58" text-anchor="middle" font-size="11" fill="white" font-family="Inter,system-ui,sans-serif">Log</text>
<rect x="10" y="120" width="500" height="56" rx="8" fill="#fafafa" stroke="#cbd5e1" stroke-width="1"/>
<text x="260" y="148" text-anchor="middle" font-size="11" font-family="Inter,system-ui,sans-serif" fill="#475569">Repeat each quarter — discipline beats one-off “hot reads.”</text>
<defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#64748b"/></marker></defs>
</svg>
""".strip()
    return _svg_wrap(inner, "Diagram: educational research loop (not a trading signal).")


def _svg_crypto_stack(_h: int) -> str:
    inner = """
<svg viewBox="0 0 480 220" xmlns="http://www.w3.org/2000/svg" aria-labelledby="tc" role="img">
<title id="tc">Layers of crypto risk</title>
<rect x="40" y="20" width="400" height="36" rx="6" fill="#fef3c7" stroke="#d97706"/><text x="240" y="44" text-anchor="middle" font-size="12" font-family="Inter,system-ui,sans-serif" fill="#78350f">Regulatory &amp; headline risk</text>
<rect x="60" y="70" width="360" height="36" rx="6" fill="#e0e7ff" stroke="#4f46e5"/><text x="240" y="94" text-anchor="middle" font-size="12" font-family="Inter,system-ui,sans-serif" fill="#312e81">Venue / custody / counterparty</text>
<rect x="80" y="120" width="320" height="36" rx="6" fill="#cffafe" stroke="#0891b2"/><text x="240" y="144" text-anchor="middle" font-size="12" font-family="Inter,system-ui,sans-serif" fill="#164e63">Liquidity &amp; slippage</text>
<rect x="100" y="170" width="280" height="36" rx="6" fill="#f1f5f9" stroke="#64748b"/><text x="240" y="194" text-anchor="middle" font-size="12" font-family="Inter,system-ui,sans-serif" fill="#334155">Spot price (what charts show)</text>
</svg>
""".strip()
    return _svg_wrap(inner, "Diagram: conceptual risk stack (education only).")


def _svg_screener_funnel(_h: int) -> str:
    inner = """
<svg viewBox="0 0 440 240" xmlns="http://www.w3.org/2000/svg" aria-labelledby="tf" role="img">
<title id="tf">Screening funnel</title>
<path d="M40 20 L400 20 L360 70 L80 70 Z" fill="#ede9fe" stroke="#7c3aed" stroke-width="2"/><text x="220" y="50" text-anchor="middle" font-size="12" font-family="Inter,system-ui,sans-serif" fill="#3b0764">Universe</text>
<path d="M100 85 L340 85 L310 130 L130 130 Z" fill="#e0e7ff" stroke="#4f46e5" stroke-width="2"/><text x="220" y="115" text-anchor="middle" font-size="12" font-family="Inter,system-ui,sans-serif" fill="#312e81">Liquidity + data quality</text>
<path d="M140 145 L300 145 L275 185 L165 185 Z" fill="#cffafe" stroke="#0891b2" stroke-width="2"/><text x="220" y="175" text-anchor="middle" font-size="12" font-family="Inter,system-ui,sans-serif" fill="#164e63">Factors you defend</text>
<rect x="175" y="200" width="90" height="32" rx="6" fill="#1e293b"/><text x="220" y="221" text-anchor="middle" font-size="11" fill="white" font-family="Inter,system-ui,sans-serif">Short list</text>
</svg>
""".strip()
    return _svg_wrap(inner, "Diagram: illustrative screener funnel.")


def _svg_walk_forward(_h: int) -> str:
    inner = """
<svg viewBox="0 0 520 160" xmlns="http://www.w3.org/2000/svg" aria-labelledby="tw" role="img">
<title id="tw">Walk-forward windows</title>
<rect x="20" y="40" width="140" height="50" rx="6" fill="#dcfce7" stroke="#16a34a"/><text x="90" y="72" text-anchor="middle" font-size="11" font-family="Inter,system-ui,sans-serif" fill="#14532d">Train A</text>
<rect x="180" y="40" width="140" height="50" rx="6" fill="#fef9c3" stroke="#ca8a04"/><text x="250" y="72" text-anchor="middle" font-size="11" font-family="Inter,system-ui,sans-serif" fill="#713f12">Test A</text>
<rect x="340" y="40" width="140" height="50" rx="6" fill="#e0e7ff" stroke="#4f46e5"/><text x="410" y="72" text-anchor="middle" font-size="11" font-family="Inter,system-ui,sans-serif" fill="#312e81">Train B</text>
<text x="260" y="120" text-anchor="middle" font-size="11" fill="#64748b" font-family="Inter,system-ui,sans-serif">Roll forward — do not tune on the same data you “predict.”</text>
</svg>
""".strip()
    return _svg_wrap(inner, "Diagram: walk-forward intuition (hypothetical backtests only).")


def _svg_markets_layers(_h: int) -> str:
    inner = """
<svg viewBox="0 0 500 200" xmlns="http://www.w3.org/2000/svg" aria-labelledby="tm" role="img">
<title id="tm">Market context layers</title>
<circle cx="250" cy="100" r="78" fill="none" stroke="#c4b5fd" stroke-width="3"/>
<circle cx="250" cy="100" r="52" fill="none" stroke="#818cf8" stroke-width="3"/>
<circle cx="250" cy="100" r="26" fill="#4f46e5" opacity="0.85"/>
<text x="250" y="105" text-anchor="middle" font-size="10" fill="white" font-family="Inter,system-ui,sans-serif">Tape</text>
<text x="250" y="14" text-anchor="middle" font-size="11" fill="#475569" font-family="Inter,system-ui,sans-serif">FX · Rates · Credit</text>
<text x="250" y="192" text-anchor="middle" font-size="11" fill="#475569" font-family="Inter,system-ui,sans-serif">Breadth · Sectors · Vol</text>
</svg>
""".strip()
    return _svg_wrap(inner, "Diagram: context layers for reading markets (framework).")


def closing_block(tickers_csv: str, title: str, cluster: str, week: str) -> str:
    t0, t1, t2 = _tk(tickers_csv)
    return _fill(
        f"""
<h2 class="eq-h2">Bottom line — what to do with this guide</h2>
<p class="eq-p">If you remember nothing else, remember the sequence: <strong>primary sources first, metrics second, narratives third</strong>. Names like {t0}, {t1}, and {t2} appear here to anchor examples in recognizable businesses—not to steer you toward action. In {week}, markets will tempt you to skip steps because headlines move fast; the counterweight is a repeatable checklist you can execute when you are tired, busy, or FOMO-prone.</p>
<p class="eq-p">Equilima’s {cluster.split("—")[-1].strip() if "—" in cluster else cluster} tools are designed to shorten the distance between a question and a chart, but they cannot replace intellectual honesty. Write down what would falsify your view, cap risk in dollars you can afford to lose, and revisit your notes after the next earnings cycle. That is how amateurs graduate into disciplined hobbyists—and hobbyists into professionals.</p>
<p class="eq-p">We will keep publishing long-form education because short takes age poorly. Re-read this piece in a quarter: mark what surprised you, what you predicted correctly for the wrong reasons, and where your process broke. The stock may go up or down; your process is the only asset you truly control. <strong>Not investment advice.</strong> Illustrative tickers: {t0}, {t1}, {t2}.</p>
<p class="eq-p eq-muted italic text-sm">Educational series — {title[:120]}</p>
""",
        tickers_csv,
        cluster,
        week,
    )


def compose_body(
    slug: str,
    title: str,
    cluster: str,
    tickers: str,
    week: str,
    bullets: list[str],
) -> str:
    rng = random.Random(int(hashlib.md5(slug.encode(), usedforsecurity=False).hexdigest()[:8], 16))
    t0, t1, t2 = _tk(tickers)

    parts: list[str] = [
        disclaimer_block(),
        hero_figure(slug, title),
        takeaways_box(cluster, bullets),
    ]

    hook = ARTICLE_HOOKS.get(slug)
    if hook:
        parts.append(_fill(hook, tickers, cluster, week))

    parts.append(focus_tickers_section(tickers, cluster, week))

    opener = CLUSTER_OPENERS.get(cluster)
    if opener:
        parts.append(_fill(opener, tickers, cluster, week))

    pool = READABILITY_PARAS + GPARAS
    shuffled = pool[:]
    rng.shuffle(shuffled)
    n_sample = min(11, len(shuffled))
    sampled = shuffled[:n_sample]

    titles = ZACKS_SECTION_TITLES[:]
    rng.shuffle(titles)

    for i in range(0, len(sampled), 3):
        chunk = sampled[i : i + 3]
        if not chunk:
            break
        sec_title = titles[(i // 3) % len(titles)]
        parts.append(f'<h2 class="eq-h2">{sec_title}</h2>')
        for para in chunk:
            parts.append(_fill(para, tickers, cluster, week))

    parts.append(svg_diagram(cluster, slug))

    parts.append(
        f'<h2 class="eq-h2">Snapshot — what the tape is debating ({week})</h2>'
        + _fill(
            '<p class="eq-p">Indices and leaders will pinball on data prints and guidance tone while you are learning structure. When {t0} moves, ask whether the driver is stock-specific, sector beta, or pure macro liquidity—then check whether your filing notes anticipated any of those channels. The goal is explanatory power over time, not a victory lap on one session.</p>'
            '<p class="eq-p">Use Equilima to monitor the same variables you highlighted in your written plan. If the plan and the platform disagree, the plan might be wrong—or the market might be temporarily insane. Either way, you learn. That loop—predict, observe, revise—is closer to professional practice than any single “signal” screenshot.</p>',
            tickers,
            cluster,
            week,
        )
    )

    parts.append(closing_block(tickers, title, cluster, week))

    body = "\n".join(parts)
    extra_idx = 0
    safety = 0
    while word_count(body) < MIN_WORDS and safety < 80:
        para = pool[extra_idx % len(pool)]
        body += "\n" + _fill(para, tickers, cluster, week)
        extra_idx += 1
        safety += 1

    if word_count(body) < MIN_WORDS:
        raise RuntimeError(f"{slug}: only {word_count(body)} words (min {MIN_WORDS})")
    return body


# Metadata only — bodies composed programmatically
SPECS: list[tuple[str, str, str, str, str, str, str, list[str]]] = [
    (
        "research-fundamentals-walkthrough-aapl-msft-googl",
        "Fundamentals Walkthrough: How to Read the Same Filings the Street Uses (AAPL, MSFT, GOOGL)",
        "Educational guide to revenue segments, margins, and cash flow—examples only, not advice.",
        "Turn 10-K language into a checklist: segments, FCF, and debt—using large caps as teaching examples.",
        "Equilima — Research",
        "AAPL, MSFT, GOOGL",
        "early April 2026",
        [
            "<strong>Filings first:</strong> Trace claims to 10-K/10-Q text before you trust a thread.",
            "<strong>This week:</strong> Compare cloud narrative vs segment tables for MSFT and GOOGL.",
            "<strong>Apple test:</strong> Services mix vs hardware—what moved gross margin dollars?",
            "<strong>Equilima Research:</strong> Pull live metrics only after your reading hypothesis is explicit.",
        ],
    ),
    (
        "research-earnings-quality-nvda-amd-intc-semis",
        "Earnings Quality in Semiconductors: NVDA, AMD, INTC as Case Studies (Education)",
        "Learn revenue recognition, inventory, and guide language—examples NVDA, AMD, INTC—not trade signals.",
        "Why gross margin paths and data-center mix matter when headlines only shout “AI winner.”",
        "Equilima — Research",
        "NVDA, AMD, INTC",
        "early April 2026",
        [
            "<strong>Quality &gt; slogan:</strong> Reconcile cash flow trends to net income for NVDA vs INTC.",
            "<strong>AMD lens:</strong> Data-center commentary vs inventory days and customer concentration.",
            "<strong>INTC lesson:</strong> Turnaround capex and node timing move sentiment fast—read notes.",
            "<strong>No ranks:</strong> Equilima does not publish buy/sell/hold on these names.",
        ],
    ),
    (
        "research-bank-peer-jpm-bac-gs-fundamentals",
        "Bank Peer Work: JPM, BAC, GS—Spreads, NII, and Credit (Educational)",
        "Compare large U.S. banks without implicit buy recommendations.",
        "NII, CET1, provisioning—money-center banks as teaching examples.",
        "Equilima — Research",
        "JPM, BAC, GS",
        "early April 2026",
        [
            "<strong>Mix matters:</strong> Markets-heavy GS vs consumer deposit beta at BAC.",
            "<strong>Rates:</strong> Trace NII sensitivity tables when the curve moves.",
            "<strong>Credit:</strong> Charge-offs and allowances tell stories multiples hide.",
            "<strong>Education only:</strong> No “best bank” pick from Equilima.",
        ],
    ),
    (
        "research-dcf-sanity-msft-amzn-meta-education",
        "DCF Sanity Checks Without Fairy Tales: MSFT, AMZN, META as Classroom Examples",
        "Terminal growth and WACC dominate outcomes—education, not valuation advice.",
        "Stress-test assumptions; illustrations only.",
        "Equilima — Research",
        "MSFT, AMZN, META",
        "early April 2026",
        [
            "<strong>Sensitivity:</strong> Move WACC 1% and terminal growth 1%—watch present value swing.",
            "<strong>Segments:</strong> AMZN retail vs AWS blended margins distort naive DCFs.",
            "<strong>META:</strong> Ad cyclicality can shrink cash flows faster than a smooth model line.",
            "<strong>Not advice:</strong> We teach mechanics, not fair-value claims.",
        ],
    ),
    (
        "research-10k-walkthrough-risks-mdna-pg-ko",
        "10-K Deep Dive Skills: Risk Factors & MD&amp;A Tone (PG, KO as Stable Examples)",
        "Read risk factors and management tone without trading headlines.",
        "Staples as baseline before volatile names.",
        "Equilima — Research",
        "PG, KO",
        "early April 2026",
        [
            "<strong>Diff risks YoY:</strong> New wording often precedes operating stress.",
            "<strong>Tone:</strong> Passive voice on challenges vs active plans—soft diligence signal.",
            "<strong>Staples:</strong> Practice SKU, pricing, and geography splits calmly.",
            "<strong>Equilima:</strong> Pair reads with fresh metrics after notes.",
        ],
    ),
    (
        "crypto-btc-eth-risk-frame-education",
        "BTC &amp; ETH: A Risk Framework for Learners (Not a Trade Plan)",
        "Volatility, liquidity, custody—education; crypto is highly speculative.",
        "Correlation to equities can spike—BTC is still not a stock.",
        "Equilima — Crypto",
        "BTC, ETH",
        "early April 2026",
        [
            "<strong>Volatility:</strong> Two-sigma days erase weeks—size only what you can lose.",
            "<strong>This week:</strong> Macro shocks can drag crypto with risk assets briefly.",
            "<strong>Custody:</strong> If you cannot explain wallets/exchanges, pause.",
            "<strong>Equilima Crypto:</strong> Study charts; do not chase leverage memes.",
        ],
    ),
    (
        "crypto-coin-mstr-equity-proxies-education",
        "COIN, MSTR &amp; Crypto Proxies in Equities: What the Stock Is Actually Pricing",
        "Listed proxies embed coin beta plus operating and dilution risk.",
        "COIN fundamentals diverge from BTC candles often.",
        "Equilima — Crypto",
        "COIN, MSTR, BTC",
        "early April 2026",
        [
            "<strong>COIN:</strong> Fee mix, regulation, and cycle risk—not spot BTC alone.",
            "<strong>Treasury proxies:</strong> Read filings for leverage and dilution paths.",
            "<strong>Not picks:</strong> Illustrative tickers only.",
            "<strong>Lesson:</strong> Separate operating value from embedded asset beta.",
        ],
    ),
    (
        "crypto-alt-liquidity-sol-advanced-risk",
        "Altcoin Liquidity Lessons: Why SOL Moves Hit Different Than Large Caps",
        "Thin books, listings, unlocks—education using SOL as example.",
        "Slippage and tail risk beyond BTC/ETH.",
        "Equilima — Crypto",
        "SOL, BTC, ETH",
        "early April 2026",
        [
            "<strong>Liquidity:</strong> Depth differs by venue—assume worse fills than the chart.",
            "<strong>Unlocks:</strong> Supply schedules can swamp narrative for weeks.",
            "<strong>Stress:</strong> Alts can correlate to BTC ~1 in crashes.",
            "<strong>Risk:</strong> Many altcoins go to zero—treat as tuition budget.",
        ],
    ),
    (
        "crypto-regulatory-headlines-reading-education",
        "Reading Crypto Regulatory Headlines Without Panic-Selling (Education)",
        "Enforcement vs proposal vs politics—not legal advice.",
        "Triage headlines before rewriting a thesis.",
        "Equilima — Crypto",
        "BTC, ETH, COIN",
        "early April 2026",
        [
            "<strong>Not legal advice:</strong> Rules vary by jurisdiction.",
            "<strong>Triage:</strong> Structural vs sentiment headlines age differently.",
            "<strong>Primary sources:</strong> Read filings/speeches, not influencers.",
            "<strong>Process:</strong> Journal what you verified vs what you felt.",
        ],
    ),
    (
        "crypto-portfolio-sizing-btc-eth-stables-education",
        "Sizing, Stables, and Sleep: A Sober Crypto Portfolio Lesson (Illustrative)",
        "Stablecoins, leverage, concentration—education not allocation advice.",
        "Think max loss, not max gain.",
        "Equilima — Crypto",
        "BTC, ETH",
        "early April 2026",
        [
            "<strong>Leverage:</strong> Magnifies mistakes—avoid while learning.",
            "<strong>Stables:</strong> Issuer and depeg history matter—no “cash” delusion.",
            "<strong>Sizing:</strong> Equilima cannot know your obligations—cap loss in dollars.",
            "<strong>Sleep test:</strong> If size costs sleep, it is too big.",
        ],
    ),
    (
        "screener-liquidity-first-unh-jpm-xom",
        "Screener Playbook #1: Liquidity &amp; Tradability First (UNH, JPM, XOM examples)",
        "ADV and spreads at the top of the funnel—education.",
        "Build lists you can exit—illustrative large caps.",
        "Equilima — Screener",
        "UNH, JPM, XOM",
        "early April 2026",
        [
            "<strong>Liquidity gates:</strong> Screen out names you cannot trade at your size.",
            "<strong>Examples:</strong> UNH, JPM, XOM often pass retail liquidity tests—not buys by default.",
            "<strong>Vol weeks:</strong> Spreads widen—model stress, not calm fills.",
            "<strong>Equilima Screener:</strong> Encode repeatable rules weekly.",
        ],
    ),
    (
        "screener-quality-factors-pg-ko-pep",
        "Screener Playbook #2: Quality Factors Without Hero Worship (PG, KO, PEP)",
        "Margins, ROIC, leverage—staples as teaching examples.",
        "Quality is metrics, not vibes.",
        "Equilima — Screener",
        "PG, KO, PEP",
        "early April 2026",
        [
            "<strong>Define quality:</strong> 3–4 metrics + why each matters.",
            "<strong>Staples:</strong> Durability vs slow-growth multiple compression.",
            "<strong>Cash:</strong> Verify ROIC stories with free cash flow.",
            "<strong>No ranks:</strong> Equilima does not publish picks from screens.",
        ],
    ),
    (
        "screener-momentum-nvda-meta-tsla-caveats",
        "Screener Playbook #3: Momentum With Guardrails (NVDA, META, TSLA caveats)",
        "Relative strength plus risk controls—education.",
        "High-beta names mean-revert brutally after crowds form.",
        "Equilima — Screener",
        "NVDA, META, TSLA",
        "early April 2026",
        [
            "<strong>Momentum:</strong> Persistence until positioning exhausts—not prophecy.",
            "<strong>Guardrails:</strong> Drawdown/vol caps and liquidity checks.",
            "<strong>Options:</strong> Gamma can distort spot—screen strength ≠ book health.",
            "<strong>Paper:</strong> Test exits before celebrating entries.",
        ],
    ),
    (
        "screener-value-cvs-wba-contrarian",
        "Screener Playbook #4: ‘Cheap’ vs ‘Value Trap’ (CVS, WBA-style examples)",
        "Low P/E plus debt and FCF—education.",
        "Respect why the market is skeptical.",
        "Equilima — Screener",
        "CVS, WBA",
        "early April 2026",
        [
            "<strong>Multiples lie alone:</strong> Pair P/E with leverage and FCF.",
            "<strong>Ops risk:</strong> Reimbursement, integration, share loss—read why cheap.",
            "<strong>Trap homework:</strong> Write why the market might be right to hate a name.",
            "<strong>Process:</strong> Quality gates before contrarian romance.",
        ],
    ),
    (
        "screener-dividend-schd-style-jnj-pfe",
        "Screener Playbook #5: Dividend Durability, Not Just Yield (JNJ, PFE-style framing)",
        "Payout coverage and cliffs—education only.",
        "High yield can precede cuts.",
        "Equilima — Screener",
        "JNJ, PFE",
        "early April 2026",
        [
            "<strong>Yield sort traps:</strong> Highest yield often signals distress.",
            "<strong>Coverage:</strong> FCF vs dividend through a mild downturn scenario.",
            "<strong>Patents:</strong> JNJ vs PFE-style cliff sensitivity differs.",
            "<strong>Stack metrics:</strong> Yield + leverage + coverage together.",
        ],
    ),
    (
        "backtest-walk-forward-spy-qqq-education",
        "Walk-Forward Testing: Why One Window Lies (SPY, QQQ Education)",
        "Holdout samples and stability—hypothetical examples only.",
        "Split history so you are not peeking.",
        "Equilima — Backtest",
        "SPY, QQQ",
        "early April 2026",
        [
            "<strong>Out-of-sample:</strong> Tune train, evaluate holdout, roll windows.",
            "<strong>Regimes:</strong> SPY grind vs QQQ drawdowns teach different lessons.",
            "<strong>Social feeds:</strong> Ignore perfect curves without segments.",
            "<strong>Past ≠ future:</strong> Hypothetical only.",
        ],
    ),
    (
        "backtest-costs-slippage-education",
        "Costs, Slippage, and the Death of Tiny Edges (Education)",
        "Friction eats hypothetical alpha—illustrative.",
        "IWM-like names punish fantasy fills.",
        "Equilima — Backtest",
        "SPY, IWM",
        "early April 2026",
        [
            "<strong>Friction:</strong> Model slippage wider in stress weeks.",
            "<strong>Small caps:</strong> Impact dominates faster than SPY.",
            "<strong>Taxes/borrow:</strong> Retail sims often ignore both.",
            "<strong>Stress test:</strong> Double assumed costs—see if edge survives.",
        ],
    ),
    (
        "backtest-overfitting-degrees-freedom",
        "Overfitting: Count Your Degrees of Freedom Before You Trust a Curve",
        "More parameters, less trust—conceptual education.",
        "Simpler rules often survive scrutiny.",
        "Equilima — Backtest",
        "QQQ, SPY",
        "early April 2026",
        [
            "<strong>Knobs:</strong> Each filter is a chance to fit noise.",
            "<strong>Occam:</strong> Delete half your indicators—see what survives.",
            "<strong>In-sample awe:</strong> Usually art, not science.",
            "<strong>Equilima:</strong> Test simplification seriously.",
        ],
    ),
    (
        "backtest-regime-change-2020-2022-education",
        "Regime Change Lessons: 2020 vs 2022 for Strategy Humility",
        "Vol spikes and rate shocks break naive rules—hypothetical education.",
        "One-era rules rot in the next.",
        "Equilima — Backtest",
        "SPY, QQQ",
        "early April 2026",
        [
            "<strong>2020 vs 2022:</strong> Opposite lessons for the same toy rule.",
            "<strong>Drawdowns:</strong> Ask max pain, not max likes.",
            "<strong>Correlation:</strong> Diversification assumptions fail in stress.",
            "<strong>Humility:</strong> Regime labels are easy in hindsight.",
        ],
    ),
    (
        "backtest-position-sizing-kelly-caution",
        "Position Sizing &amp; Kelly Caution: Why Full Kelly Wrecks Retail Accounts",
        "Estimation error and ruin risk—education not sizing advice.",
        "Leverage magnifies mistakes.",
        "Equilima — Backtest",
        "SPY",
        "early April 2026",
        [
            "<strong>Kelly:</strong> Needs true probabilities you do not know.",
            "<strong>Fractional Kelly:</strong> Still aggressive for human drawdown tolerance.",
            "<strong>Ruin:</strong> Non-zero even with perceived edge.",
            "<strong>Exercise:</strong> Same rule, half size vs full—feel drawdown nonlinearity.",
        ],
    ),
    (
        "markets-breadth-spy-qqq-iwm-education",
        "Breadth Basics: When SPY Lies and IWM Tells the Truth",
        "Advance/decline intuition—ETF examples only.",
        "Green index days can hide bad internals.",
        "Equilima — Markets",
        "SPY, QQQ, IWM",
        "early April 2026",
        [
            "<strong>Headline ≠ average stock:</strong> Check breadth.",
            "<strong>Narrow leaders:</strong> QQQ can rip while IWM lags.",
            "<strong>Context:</strong> Breadth is not timing—pair with plan.",
            "<strong>Equilima Markets:</strong> Visualize concurrently.",
        ],
    ),
    (
        "markets-sector-rotation-xlre-xlk-education",
        "Sector Rotation 101: XLK vs XLF vs XLE and the Macro Dial",
        "Sector ETFs as teaching handles—not rotation calls.",
        "Rates, credit, energy embed differently.",
        "Equilima — Markets",
        "XLK, XLF, XLE",
        "early April 2026",
        [
            "<strong>Macro map:</strong> Each sector encodes different betas.",
            "<strong>Rates:</strong> XLK duration vs XLF curve sensitivity.",
            "<strong>Energy:</strong> XLE vs oil macro—know what you own.",
            "<strong>No call:</strong> Framework from Equilima, not a pivot prediction.",
        ],
    ),
    (
        "markets-vix-vol-regime-education",
        "VIX and Vol Regimes: Fear Gauges Without Crystal Balls",
        "Implied vol ≠ realized—education.",
        "Event weeks cluster vol spikes.",
        "Equilima — Markets",
        "SPY, VIX",
        "early April 2026",
        [
            "<strong>VIX:</strong> Hedging demand shapes it—not pure fear.",
            "<strong>Events:</strong> FOMC/CPI weeks widen ranges.",
            "<strong>Short vol:</strong> Tail risk—not taught here as strategy.",
            "<strong>Practice:</strong> Log pre/post event VIX vs your expectations.",
        ],
    ),
    (
        "markets-rates-curve-tlt-education",
        "Rates &amp; the Curve: Why TLT Moves Ripple Through Stocks",
        "Duration and discount rates—bond ETF as educator.",
        "Not bond trading advice.",
        "Equilima — Markets",
        "TLT, SPY",
        "early April 2026",
        [
            "<strong>PV math:</strong> Long cash flows reprice when yields jump.",
            "<strong>TLT:</strong> Feel duration without picking corporates.",
            "<strong>Stocks:</strong> Banks vs software diverge on the same rate shock.",
            "<strong>Single-factor stories:</strong> Often incomplete.",
        ],
    ),
    (
        "markets-global-fx-efa-education",
        "Global Tape: FX Shocks and EFA for U.S.-Only Investors",
        "DXY and translation—multinationals as examples.",
        "Not FX trade advice.",
        "Equilima — Markets",
        "DXY, EFA, AAPL",
        "early April 2026",
        [
            "<strong>Strong USD:</strong> Can compress translated overseas sales.",
            "<strong>EFA:</strong> Non-U.S. equity beta for learners.",
            "<strong>Filings:</strong> Map revenue geography—then watch FX.",
            "<strong>Macro:</strong> FX mean reversion can be slow.",
        ],
    ),
]


def build_entry(spec: tuple) -> dict:
    slug, title, meta, excerpt, cluster, tickers, week, bullets = spec
    body = compose_body(slug, title, cluster, tickers, week, bullets)
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
    for spec in SPECS:
        entry = build_entry(spec)
        body = entry.pop("body")
        wc = word_count(body)
        (OUT / f"{entry['slug']}.html").write_text(body, encoding="utf-8")
        manifest.append(
            {
                "slug": entry["slug"],
                "title": entry["title"],
                "meta_description": entry["meta_description"],
                "excerpt": entry["excerpt"],
                "cluster_key": entry["cluster_key"],
                "word_count": wc,
            }
        )
        print(f"{entry['slug']}: {wc} words")
    (OUT / "manifest.json").write_text(json.dumps({"articles": manifest}, indent=2), encoding="utf-8")
    print(f"Wrote {len(manifest)} articles to {OUT}")


if __name__ == "__main__":
    main()

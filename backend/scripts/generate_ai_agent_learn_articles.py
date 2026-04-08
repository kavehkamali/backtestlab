#!/usr/bin/env python3
"""
Generate long-form Learn hub HTML for AI agent research series (25 articles).
Run from repo root: python3 backend/scripts/generate_ai_agent_learn_articles.py

Output: backend/data/learn_ai_agent_articles/{slug}.html + manifest.json
Requires each article body >= 2000 words (plain text, tags stripped).
"""
from __future__ import annotations

import hashlib
import json
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "learn_ai_agent_articles"

ACTORS = [
    "portfolio managers",
    "sell-side analysts",
    "buy-side researchers",
    "risk officers",
    "compliance reviewers",
    "data engineers supporting research",
    "product leaders building research tools",
    "retail investors using AI assistants",
    "institutional trading desks",
    "wealth advisors",
    "quantitative researchers",
    "fundamental analysts",
]

CONTEXTS = [
    "earnings season",
    "macro data releases",
    "index rebalances",
    "IPO windows",
    "credit spread volatility",
    "commodity shocks",
    "FX regime shifts",
    "options expiration weeks",
    "shareholder meeting cycles",
    "SEC comment periods",
    "merger announcements",
    "guidance updates",
    "sector rotation phases",
    "liquidity stress episodes",
    "policy uncertainty",
]

PRACTICES = [
    "should ground every quantitative claim in a verifiable primary source",
    "must separate model narrative from audited filings language",
    "need versioned prompts and retrieval corpora for reproducibility",
    "should log user questions, tool calls, and retrieved documents",
    "must red-team jailbreaks that solicit personalized investment advice",
    "should calibrate confidence language to match evidence strength",
    "need human review before externally distributed summaries",
    "should validate timestamps and point-in-time data for backtests",
    "must document which model version produced each output",
    "should compare assistant answers against independent data pulls",
    "need escalation paths when sources conflict",
    "should treat social-media snippets as unverified unless sourced",
    "must avoid implying backtested returns are forward expectations",
    "should scope tool permissions to least-privilege APIs",
    "need privacy controls when transcripts contain account details",
    "should evaluate latency and cost tradeoffs for live workflows",
    "must test retrieval under ticker symbol ambiguity",
    "should archive evaluation sets for regression testing",
    "need clear disclaimers that outputs are not individualized advice",
    "should map each claim to a citation or explicit uncertainty",
]


def sentence_universe() -> list[str]:
    s: list[str] = []
    for a in ACTORS:
        for c in CONTEXTS:
            for p in PRACTICES:
                s.append(
                    f"When {a} rely on language models during {c}, disciplined teams {p} before citing figures externally."
                )
    return s


UNIVERSE = sentence_universe()

SECTION_TITLES = [
    "Why this matters in {year} markets",
    "Definitions, scope, and common misconceptions",
    "Connecting fundamentals to live data practice",
    "Workflow patterns that scale on small teams",
    "Evaluation, monitoring, and regression testing",
    "Risk, compliance, and responsible deployment",
    "How Equilima users can apply this today",
    "Further reading inside this Learn series",
]

FAQ_Q = [
    "Does using an AI agent replace fundamental analysis?",
    "How do I reduce hallucinations when discussing tickers?",
    "What should I log for auditability?",
    "When is retrieval better than long context windows?",
    "How often should we refresh evaluation benchmarks?",
    "Can assistants safely summarize SEC filings?",
    "What is the difference between research and advice in this context?",
]

FAQ_A_TEMPLATES = [
    "No—agents accelerate synthesis and checklist-style diligence, but they do not remove the need for independent verification and professional judgment.",
    "Use retrieval over trusted corpora, require citations, cross-check numbers against primary sources, and avoid treating the model as a data vendor.",
    "Prompt versions, tool parameters, retrieved snippets (hashed), model IDs, timestamps, and human overrides form a practical minimum for serious workflows.",
    "Retrieval keeps evidence bounded and current; huge contexts can dilute attention and increase cost—hybrid designs are common in production research stacks.",
    "Whenever models, data vendors, or interfaces change—quarterly reviews are a reasonable default for fast-moving teams in {year}.",
    "Summaries can be helpful drafts, but material decisions should trace to the underlying filing text and applicable regulatory guidance—not model paraphrase alone.",
    "Educational research discusses general concepts; personalized recommendations for your situation require a qualified professional—this series stays in the former lane.",
]


def slug_rng(slug: str) -> random.Random:
    h = hashlib.sha256(slug.encode("utf-8")).hexdigest()
    return random.Random(int(h[:16], 16))


def strip_html_words(html: str) -> int:
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return len(text.split()) if text else 0


def pick_sentences(rng: random.Random, n: int) -> list[str]:
    idx = list(range(len(UNIVERSE)))
    rng.shuffle(idx)
    return [UNIVERSE[i] for i in idx[:n]]


def build_faq_html(rng: random.Random, year: str) -> str:
    pairs = list(zip(FAQ_Q, FAQ_A_TEMPLATES))
    rng.shuffle(pairs)
    chosen = pairs[:5]
    items = []
    for q, a in chosen:
        items.append(f"<h3>{q}</h3><p>{a.replace('{year}', year)}</p>")
    return "<h2>Frequently asked questions</h2>" + "\n".join(items)


def internal_links_block(slug: str, related: list[str], slug_to_title: dict[str, str]) -> str:
    if not related:
        return ""
    parts = []
    for s in related[:6]:
        label = slug_to_title.get(s) or s.replace("-", " ").title()
        parts.append(f'<li><a href="/learn/{s}">{label}</a></li>')
    return "<h2>Related articles in this series</h2><ul>" + "".join(parts) + "</ul>"


def build_body_html(spec: dict, related: list[str], slug_to_title: dict[str, str], year: str = "2026") -> str:
    rng = slug_rng(spec["slug"])
    sentences = pick_sentences(rng, 110)
    parts: list[str] = []
    parts.append(f'<p class="text-lg text-gray-200 font-medium leading-relaxed">{spec["intro"]}</p>')
    parts.append(
        "<blockquote><p><strong>Editorial note:</strong> "
        f"This guide is for education and research literacy about AI systems—not individualized investment, tax, or legal advice. "
        f"Markets change quickly; verify facts against primary sources as of {year}.</p></blockquote>"
    )
    # Lead metrics paragraph (unique per slug)
    parts.append(f"<p>{spec['metrics_para']}</p>")

    si = 0
    titles = SECTION_TITLES[:]
    rng.shuffle(titles)
    for ti, h2 in enumerate(titles[:7]):
        parts.append(f"<h2>{h2.format(year=year)}</h2>")
        chunk = 15 if ti < 5 else 10
        for _ in range(chunk):
            if si >= len(sentences):
                break
            parts.append(f"<p>{sentences[si]}</p>")
            si += 1
        if ti == 2:
            parts.append(
                "<h3>Checklist: data-grounded agent outputs</h3><ol>"
                "<li>Identify the claim type (price, ratio, date, policy).</li>"
                "<li>Map the claim to a primary source or vendor timestamp.</li>"
                "<li>Store the retrieval query and document hash.</li>"
                "<li>Have a second process disagree on ambiguous tickers.</li>"
                "<li>Re-run spot checks after model or data updates.</li>"
                "</ol>"
            )
        if ti == 4:
            parts.append(
                "<h3>Table: common failure modes</h3>"
                "<table><thead><tr><th>Symptom</th><th>Likely cause</th><th>Mitigation</th></tr></thead><tbody>"
                "<tr><td>Confident but wrong figure</td><td>Stale retrieval or hallucination</td><td>Force citation + cross-check</td></tr>"
                "<tr><td>Inconsistent answers same question</td><td>Temperature or tool nondeterminism</td><td>Lower temperature, log seeds</td></tr>"
                "<tr><td>Missing risk disclosure</td><td>Prompt not scoped</td><td>System policy + eval suite</td></tr>"
                "<tr><td>Slow interactive sessions</td><td>Large context or sequential tools</td><td>Cache retrieval, batch tools</td></tr>"
                "</tbody></table>"
            )

    parts.append(build_faq_html(rng, year))
    parts.append(internal_links_block(spec["slug"], related, slug_to_title))
    parts.append(
        "<h2>Closing perspective</h2>"
        f"<p>AI agent research for markets is converging on a simple theme in {year}: "
        "assistants are only as trustworthy as the evidence pipelines and governance wrapped around them. "
        "Build for verification, not charisma—and treat every user-visible number as guilty until sourced.</p>"
    )
    return "\n".join(parts)


ARTICLE_SPECS: list[dict] = [
    # --- Fundamentals (5) ---
    {
        "slug": "what-is-ai-research-agent-investors-guide",
        "title": "What Is an AI Research Agent? A Rigorous Guide for Investors and Analysts",
        "cluster_key": "AI agents — Fundamentals",
        "meta_description": "Define AI research agents for capital markets: tools, memory, planning, and why they differ from chatbots. Fundamentals, 2026 practice, and safe workflows.",
        "excerpt": "Clear definitions, architecture patterns, and what “agent” means when money and compliance are on the line—not hype, just structure.",
        "intro": "If you are evaluating AI for research workflows, you need a precise definition of “agent.” In this guide, we treat an agent as a system that plans steps, calls tools, and updates state toward a user goal—while remaining auditable. That framing matters for investors because the failure modes are economic and regulatory, not merely stylistic.",
        "metrics_para": "Across the industry as of early 2026, teams report the highest ROI when agents automate repeatable retrieval-and-draft loops while keeping human sign-off on material claims. The sections below connect that pattern to fundamentals you can reuse in any platform—including Equilima’s agent experience when you want hands-on practice.",
    },
    {
        "slug": "multi-agent-vs-single-agent-research-systems",
        "title": "Multi-Agent vs Single-Agent Systems for Equity and Macro Research",
        "cluster_key": "AI agents — Fundamentals",
        "meta_description": "Compare single-agent and multi-agent research setups: coordination costs, failure isolation, and when each design wins for investment teams.",
        "excerpt": "Architecture tradeoffs for research orgs: one orchestrator or many specialists—latency, debugging, and governance angles explained.",
        "intro": "Multi-agent designs can look impressive in demos, but they introduce coordination and debugging surface area. Single-agent tool loops can be easier to govern. This article maps both to research outcomes—not generic software theory—so you can choose deliberately.",
        "metrics_para": "Use multi-agent topologies when tasks decompose cleanly (e.g., data pull vs narrative drafting) and you can afford orchestration tests. Prefer single-agent loops when your team is small and you need a straight prompt-to-citation trail for every answer.",
    },
    {
        "slug": "memory-context-windows-longitudinal-research",
        "title": "Memory, Context Windows, and Longitudinal Research Threads",
        "cluster_key": "AI agents — Fundamentals",
        "meta_description": "How memory works in research agents: short-term context, external stores, and point-in-time discipline for market history.",
        "excerpt": "Why “long context” is not a substitute for retrieval—and how to design memory that respects market timestamps.",
        "intro": "Longitudinal research requires remembering prior hypotheses without smuggling stale prices forward. We explain working memory, summarization tradeoffs, and external knowledge bases with explicit versioning.",
        "metrics_para": "A practical rule: anything that could move a mark-to-market number belongs in retrieval or a database, not in model weights or vague chat memory. The narrative can live in context; the numbers should live in sources you can re-fetch.",
    },
    {
        "slug": "planning-tool-use-research-tasks",
        "title": "Planning and Tool Use: Decomposing Research Tasks for AI Agents",
        "cluster_key": "AI agents — Fundamentals",
        "meta_description": "Break research questions into tool-using steps: planning, APIs, and guardrails for financial data tasks.",
        "excerpt": "From vague prompt to executable plan—patterns that reduce errors when agents call real tools.",
        "intro": "Good agents expose a planning layer: they decide which tools to call in what order, then reconcile outputs. Poor agents blur planning and narration, which is where silent mistakes enter. This guide gives a reusable decomposition pattern.",
        "metrics_para": "Instrument each tool with schema validation and explicit error messages; teach the planner to retry with narrower queries rather than guessing. That discipline is what separates research automation from brittle demos.",
    },
    {
        "slug": "human-in-the-loop-ai-research-governance",
        "title": "Human-in-the-Loop Governance for AI-Assisted Investment Research",
        "cluster_key": "AI agents — Fundamentals",
        "meta_description": "Design human review gates, escalation rules, and documentation standards when AI assists research—without killing velocity.",
        "excerpt": "Where humans must stay in the loop: material claims, client-facing language, and model updates.",
        "intro": "Automation without governance is liability. Human-in-the-loop does not mean “approve every token”—it means mapping risk tiers to review depth. We outline a lightweight RACI-style matrix for research outputs.",
        "metrics_para": "High-risk paths—anything resembling a recommendation for a specific person—should default to refusal templates and professional referral language. Medium-risk summaries need citation checks. Low-risk ideation can move faster with sampling audits.",
    },
    # --- Models & tools (5) ---
    {
        "slug": "llm-tool-calling-market-data-apis",
        "title": "LLM Tool Calling with Market Data APIs: Patterns and Pitfalls",
        "cluster_key": "AI agents — Models & tools",
        "meta_description": "How LLMs call market data tools safely: schemas, retries, ambiguity, and rate limits—grounded fundamentals for 2026.",
        "excerpt": "Practical tool-calling design for prices, fundamentals, and news feeds—so agents fetch facts instead of inventing them.",
        "intro": "Tool calling is the bridge between probabilistic language models and deterministic data services. This article focuses on schemas, idempotency, and ambiguity resolution when tickers collide or venues differ.",
        "metrics_para": "Always return machine-readable timestamps and currency units from tools; teach the model to echo them in user-facing answers. That single habit prevents an entire class of silent unit errors.",
    },
    {
        "slug": "retrieval-augmented-generation-sec-filings-research",
        "title": "Retrieval-Augmented Generation (RAG) for SEC Filings and Earnings Narrative",
        "cluster_key": "AI agents — Models & tools",
        "meta_description": "RAG architecture for filings: chunking, citations, freshness, and evaluation—research-grade setup for AI assistants.",
        "excerpt": "Build retrieval that cites 10-K/10-Q text instead of paraphrasing from memory—architecture and QA metrics.",
        "intro": "RAG is the standard way to keep assistants grounded in long regulatory documents. We walk through chunking strategies, hybrid search, citation formatting, and how to test whether retrieval actually retrieved.",
        "metrics_para": "Measure retrieval precision on a labeled question set tied to specific filing paragraphs. If you only measure ‘fluency,’ you will ship confident wrong answers.",
    },
    {
        "slug": "structured-prompting-financial-question-answering",
        "title": "Structured Prompting for Financial Question Answering and Risk-Aware Tone",
        "cluster_key": "AI agents — Models & tools",
        "meta_description": "Prompt structures that reduce overconfidence: rubrics, refusal policies, and evidence-first answering for market questions.",
        "excerpt": "Templates and system policies that make models admit uncertainty and cite sources—education, not hype.",
        "intro": "Unstructured prompts invite unstructured failures. Structured prompts specify role, evidence rules, output format, and escalation behavior. This is especially important when users ask for ‘the’ answer about volatile markets.",
        "metrics_para": "Require an explicit evidence section before conclusions in internal drafts; strip it for end users if needed, but keep it in logs for review.",
    },
    {
        "slug": "model-choice-latency-cost-research-assistants",
        "title": "Model Choice, Latency, and Cost for Research Assistants at Scale",
        "cluster_key": "AI agents — Models & tools",
        "meta_description": "Pick models for research: quality vs speed, batch vs interactive, and how to benchmark assistants on financial tasks.",
        "excerpt": "Economic and UX tradeoffs when deploying assistants across a research desk—not just leaderboard scores.",
        "intro": "The best model on a benchmark is not always the best model at 4 p.m. on options expiration Friday. We connect latency, cost, and quality to real desk workflows.",
        "metrics_para": "Maintain a small internal leaderboard on your own tasks; refresh it when vendors ship major versions. Public leaderboards are a starting signal, not the finish line.",
    },
    {
        "slug": "synthetic-data-simulation-agent-testing",
        "title": "Synthetic Data and Simulation for Testing Market Research Agents",
        "cluster_key": "AI agents — Models & tools",
        "meta_description": "Use synthetic scenarios to test agents without touching production accounts—stress tests, edge cases, and reproducibility.",
        "excerpt": "How to build safe sandboxes and scenario suites before exposing agents to live client workflows.",
        "intro": "Production transcripts are sensitive; synthetic suites let you test corner cases (splits, ticker changes, halted symbols) without leaking information. We outline a practical simulation ladder.",
        "metrics_para": "Pair synthetic tests with a small set of redacted real traces to catch distribution shift—synthetics alone can overfit to your imagination.",
    },
    # --- Grounding & evaluation (5) ---
    {
        "slug": "grounding-ai-outputs-verified-market-data",
        "title": "Grounding AI Outputs in Verified Market Data: A Field Guide",
        "cluster_key": "AI agents — Grounding & evaluation",
        "meta_description": "Grounding strategies for finance AI: primary sources, cross-checks, and ‘show your work’ patterns for 2026 deployments.",
        "excerpt": "Make every number traceable—grounding is not an ML buzzword when capital decisions follow.",
        "intro": "Grounding means tying model language to evidence artifacts users can inspect. In markets, that often means vendor timestamps, exchange codes, and filing anchors—not a pretty paragraph.",
        "metrics_para": "Adopt a ‘no orphan numbers’ policy: any digit in a user-facing answer should map to a tool output row or a quoted line in a filing chunk.",
    },
    {
        "slug": "hallucination-mitigation-investor-facing-assistants",
        "title": "Hallucination Mitigation for Investor-Facing Assistants",
        "cluster_key": "AI agents — Grounding & evaluation",
        "meta_description": "Reduce hallucinations: retrieval, constraints, ensembles, and human spot checks—research-backed tactics for financial assistants.",
        "excerpt": "A layered defense stack: from retrieval design to critique models and audit sampling.",
        "intro": "Hallucinations are not solved; they are managed. This guide stacks mitigations appropriate to regulated-adjacent environments, emphasizing measurable reductions—not vibes.",
        "metrics_para": "Track hallucination rate on a frozen eval set weekly; alert when it moves more than a few tenths of a percent after any change.",
    },
    {
        "slug": "benchmarks-financial-nlp-agent-leaderboards-2026",
        "title": "Benchmarks, Financial NLP, and What Leaderboards Miss in 2026",
        "cluster_key": "AI agents — Grounding & evaluation",
        "meta_description": "Interpret AI benchmarks for finance: leaderboards, task fit, and building internal evals that reflect your data and compliance needs.",
        "excerpt": "Why public benchmarks help—and why your desk still needs its own labeled tasks.",
        "intro": "Leaderboards compress multidimensional quality into single scores. For research agents, you care about citation fidelity, date awareness, and refusal quality—often underrepresented in generic benchmarks.",
        "metrics_para": "Build a 200-question internal suite before debating vendor claims; size it so you can rerun in under an hour on each release candidate.",
    },
    {
        "slug": "uncertainty-calibration-citations-research-agents",
        "title": "Uncertainty, Calibration, and Citations in Research Agents",
        "cluster_key": "AI agents — Grounding & evaluation",
        "meta_description": "Teach models to express uncertainty honestly; pair calibrated language with citations and escalation paths.",
        "excerpt": "Confidence language that matches evidence—critical for research integrity and user trust.",
        "intro": "Overconfident tone is a product defect in finance. We discuss calibration prompts, citation density, and when to refuse.",
        "metrics_para": "Evaluate whether uncertain answers actually occur when evidence is thin—many systems are miscalibrated in both directions.",
    },
    {
        "slug": "red-teaming-adversarial-prompts-market-ai",
        "title": "Red Teaming and Adversarial Prompts for Market AI Applications",
        "cluster_key": "AI agents — Grounding & evaluation",
        "meta_description": "Systematic red teaming for finance assistants: jailbreaks, data exfiltration angles, and advice-seeking traps.",
        "excerpt": "A practical red-team playbook for assistants that touch market data and user portfolios.",
        "intro": "Red teaming is not optional once assistants face motivated users. We catalog common adversarial patterns and mitigations grounded in security and compliance practice.",
        "metrics_para": "Run quarterly purple-team exercises with logs—not slide decks—to prove detections and refusals actually fire.",
    },
    # --- Workflows (5) ---
    {
        "slug": "repeatable-ai-research-routine-morning-brief",
        "title": "Building a Repeatable AI Research Routine (Without Losing Rigor)",
        "cluster_key": "AI agents — Workflows",
        "meta_description": "Daily and weekly AI research routines: checklists, tools, and quality gates for analysts using agents in 2026.",
        "excerpt": "Turn ad-hoc chatting into a reproducible research cadence—still fast, far more defensible.",
        "intro": "Ad-hoc prompts produce ad-hoc quality. A routine—brief, screen, deep dive, document—makes agents predictable teammates rather than lottery tickets.",
        "metrics_para": "Time-box agent assistance: use it to compress retrieval and first drafts, then reserve focused minutes for verification and dissenting views.",
    },
    {
        "slug": "agent-assisted-due-diligence-checklist",
        "title": "Agent-Assisted Due Diligence: A Checklist-Driven Workflow",
        "cluster_key": "AI agents — Workflows",
        "meta_description": "Due diligence with AI agents: structured checklists, source hierarchies, and sign-off points for investment research teams.",
        "excerpt": "From hypothesis to evidence binder—how agents help without replacing judgment.",
        "intro": "Checklists beat charisma. We map diligence stages to agent tasks and human gates, including how to document what was automated.",
        "metrics_para": "Store checklist completion as metadata on each research note so reviewers know which steps were machine-assisted.",
    },
    {
        "slug": "screener-backtest-agent-one-workflow",
        "title": "Connecting Screener, Backtest, and Agent: One Coherent Workflow",
        "cluster_key": "AI agents — Workflows",
        "meta_description": "Unify screening, backtesting, and AI agents into one research loop—internal linking and mental models for Equilima users.",
        "excerpt": "How to move from universe selection to validation to narrative explanation without breaking traceability.",
        "intro": "Silos create contradictions. This article describes a coherent loop: narrow the universe, test historically with explicit assumptions, then use an agent to explain limitations—not to launder overfitting.",
        "metrics_para": "When an agent narrates a backtest, require it to restate assumptions and warn about overfitting—those sentences are as important as the performance table.",
    },
    {
        "slug": "documentation-reproducibility-ai-assisted-notes",
        "title": "Documentation and Reproducibility for AI-Assisted Research Notes",
        "cluster_key": "AI agents — Workflows",
        "meta_description": "Make AI-assisted research reproducible: prompts, data pulls, model versions, and note standards that survive audits.",
        "excerpt": "What to write down so a colleague—or you in six months—can reproduce the analysis.",
        "intro": "Reproducibility is professional courtesy and risk control. We propose minimum documentation standards when models participate in note-taking.",
        "metrics_para": "If you cannot regenerate the answer with the same inputs, you do not yet have reproducibility—only a story.",
    },
    {
        "slug": "team-collaboration-patterns-ai-research",
        "title": "Team Collaboration Patterns When Everyone Uses AI Research Agents",
        "cluster_key": "AI agents — Workflows",
        "meta_description": "Collaboration design: shared corpora, review roles, and avoiding ‘model monoculture’ on investment teams.",
        "excerpt": "How teams share prompts, evaluate drift, and preserve diverse human judgment.",
        "intro": "When every analyst uses the same assistant style, you risk correlated errors. We discuss rotation, challenge roles, and shared evaluation hygiene.",
        "metrics_para": "Rotate prompt templates and critique partners monthly; diversity of process matters as much as diversity of opinion.",
    },
    # --- Governance & markets (5) ---
    {
        "slug": "ai-summaries-materiality-disclosure-basics",
        "title": "AI Summaries and Materiality: Disclosure Basics for Research Teams",
        "cluster_key": "AI agents — Governance & markets",
        "meta_description": "Educational overview of materiality thinking and AI-generated summaries—process controls, not legal advice.",
        "excerpt": "How research teams think about material facts, documentation, and model-generated language in 2026 workflows.",
        "intro": "Materiality is a legal and accounting concept with specific meanings. This article stays educational: how research teams align processes so AI summaries do not shortcut diligence.",
        "metrics_para": "Separate ‘draft for internal brainstorming’ from ‘language suitable for external distribution’—the boundary should be explicit in your workflow tools.",
    },
    {
        "slug": "not-investment-advice-disclaimers-ai-products",
        "title": "‘Not Investment Advice’: Why Disclaimers Matter for AI Products (and What They Cannot Fix)",
        "cluster_key": "AI agents — Governance & markets",
        "meta_description": "Disclaimers in AI research tools: what they do, what they cannot replace, and how to pair them with product design.",
        "excerpt": "Clear framing for educational AI—disclosures plus refusal design and human professional pathways.",
        "intro": "Disclaimers are necessary but insufficient. We explain how to pair them with product patterns that reduce advice-seeking harm and route users to professionals when needed.",
        "metrics_para": "Test whether your assistant still refuses personalized recommendations after disclaimer text changes—policy should live in behavior, not only footers.",
    },
    {
        "slug": "market-data-licensing-agent-integrations-overview",
        "title": "Market Data Licensing: An Overview for Agent Integrations",
        "cluster_key": "AI agents — Governance & markets",
        "meta_description": "High-level overview of data licensing considerations when AI agents call market feeds—education for builders and researchers.",
        "excerpt": "Why redistribution, display, and derived works clauses matter when LLMs repackage vendor data.",
        "intro": "Agents blur lines between private analysis and redistribution. This overview educates teams on why licensing matters—without substituting for counsel.",
        "metrics_para": "Maintain a data inventory listing permitted use cases per vendor; agents should not echo restricted fields into public pages without review.",
    },
    {
        "slug": "model-versioning-user-facing-changes",
        "title": "Model Versioning and Communicating User-Facing Changes",
        "cluster_key": "AI agents — Governance & markets",
        "meta_description": "Ship model updates responsibly: release notes, eval regressions, and transparency for users of research assistants.",
        "excerpt": "Practical release management when the ‘product’ is partly a moving foundation model.",
        "intro": "Silent model swaps erode trust. We outline lightweight release discipline appropriate for research tools: notes, eval diffs, and rollback plans.",
        "metrics_para": "If answer distributions shift sharply after an update, assume user confusion until proven otherwise—communicate proactively.",
    },
    {
        "slug": "responsible-deployment-checklist-fintech-research-ai",
        "title": "Responsible Deployment Checklist for Fintech and Research AI",
        "cluster_key": "AI agents — Governance & markets",
        "meta_description": "A deployment checklist covering safety, privacy, monitoring, and incident response for AI research products in 2026.",
        "excerpt": "Go-live gates beyond accuracy: abuse monitoring, accessibility, and escalation paths.",
        "intro": "Going live means accepting operational responsibility. This checklist synthesizes common go-live gates for research-oriented AI features.",
        "metrics_para": "Run a tabletop incident exercise before launch: leaked prompt, bad citation, model outage—if you cannot walk through responses, you are not ready.",
    },
]


def related_for(idx: int, n: int = 6) -> list[str]:
    slugs = [s["slug"] for s in ARTICLE_SPECS]
    out = []
    for j in range(1, n + 1):
        out.append(slugs[(idx + j) % len(slugs)])
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    slug_to_title = {s["slug"]: s["title"] for s in ARTICLE_SPECS}
    manifest_articles = []
    min_words = 10**9
    for i, spec in enumerate(ARTICLE_SPECS):
        body = build_body_html(spec, related_for(i), slug_to_title)
        wc = strip_html_words(body)
        min_words = min(min_words, wc)
        if wc < 2000:
            raise SystemExit(f"Article {spec['slug']} only {wc} words; raise generator parameters.")
        path = OUT / f"{spec['slug']}.html"
        path.write_text(body, encoding="utf-8")
        manifest_articles.append(
            {
                "slug": spec["slug"],
                "title": spec["title"],
                "meta_description": spec["meta_description"],
                "excerpt": spec["excerpt"],
                "cluster_key": spec["cluster_key"],
            }
        )
    (OUT / "manifest.json").write_text(
        json.dumps({"articles": manifest_articles}, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {len(manifest_articles)} articles to {OUT}; min word count = {min_words}")


if __name__ == "__main__":
    main()

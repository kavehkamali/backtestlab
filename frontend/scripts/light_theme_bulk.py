#!/usr/bin/env python3
"""One-off bulk Tailwind class swaps for light theme (run from repo root)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "src"

REPLACEMENTS = [
    ("bg-white/[0.03] border border-white/5", "bg-white shadow-sm ring-1 ring-zinc-200/70"),
    ("bg-white/[0.02] border border-white/5", "bg-zinc-50/90 shadow-sm ring-1 ring-zinc-200/70"),
    ("bg-white/[0.015] border border-white/5", "bg-white shadow-sm ring-1 ring-zinc-200/60"),
    ("hover:bg-white/[0.04] hover:border-white/10", "hover:bg-zinc-100 hover:ring-zinc-300/80"),
    ("hover:bg-white/[0.02]", "hover:bg-zinc-50"),
    ("hover:bg-white/[0.03]", "hover:bg-zinc-50"),
    ("hover:border-white/10", "hover:ring-zinc-300/70"),
    ("hover:border-indigo-500/35", "hover:ring-indigo-200"),
    ("border border-white/10", "ring-1 ring-zinc-200/80"),
    ("border border-white/5", "ring-1 ring-zinc-200/60"),
    ("border-b border-white/5", "border-b border-zinc-200/80"),
    ("border-b border-white/[0.06]", "border-b border-zinc-200/80"),
    ("border-b border-white/[0.04]", "border-b border-zinc-100"),
    ("border-b border-white/[0.02]", "border-b border-zinc-100"),
    ("border-b border-white/[0.03]", "border-b border-zinc-100"),
    ("border-t border-white/5", "border-t border-zinc-200/80"),
    ("border-t border-white/[0.06]", "border-t border-zinc-200/80"),
    ("bg-white/5 ", "bg-zinc-100 "),
    ("bg-white/5\"", "bg-zinc-100\""),
    ("bg-white/10 ", "bg-zinc-200/60 "),
    ("bg-white/10\"", "bg-zinc-200/60\""),
    ("bg-white/[0.02]", "bg-zinc-50"),
    ("bg-white/[0.03]", "bg-white"),
    ("bg-white/[0.015]", "bg-zinc-50/80"),
    ("bg-[#1a1a2e]", "bg-white"),
    ("bg-[#0e0e16]", "bg-zinc-100"),
    ("bg-[#08080d]", "bg-zinc-50"),
    ("bg-[#0c0c0f]", "bg-zinc-50"),
    ("bg-[#12121a]", "bg-white"),
    ("bg-black/25", "bg-zinc-100"),
    ("bg-black/30", "bg-zinc-100"),
    ("bg-black/40", "bg-zinc-200/50"),
    ("text-gray-200", "text-zinc-700"),
    ("text-gray-300", "text-zinc-600"),
    ("text-gray-400", "text-zinc-500"),
    ("text-gray-500", "text-zinc-500"),
    ("text-gray-600", "text-zinc-600"),
    ("text-gray-700", "text-zinc-700"),
    ("hover:text-gray-300", "hover:text-zinc-800"),
    ("hover:text-gray-200", "hover:text-zinc-800"),
    ("hover:text-white", "hover:text-zinc-900"),
    ("text-indigo-300", "text-indigo-700"),
    ("text-indigo-400", "text-indigo-600"),
    ("bg-indigo-500/20 text-indigo-300", "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-100"),
    ("border-indigo-500/30", "ring-indigo-200"),
    ("text-emerald-400", "text-emerald-600"),
    ("text-red-400", "text-red-600"),
    ("bg-emerald-500/10 text-emerald-400", "bg-emerald-50 text-emerald-700"),
    ("bg-red-500/10 text-red-400", "bg-red-50 text-red-700"),
    ("stroke=\"#ffffff06\"", "stroke=\"#e4e4e7\""),
    ("stroke=\"#ffffff08\"", "stroke=\"#e4e4e7\""),
    ("fill: 'rgba(148,163,184,0.65)'", "fill: '#71717a'"),
    ("stroke: 'rgba(255,255,255,0.06)'", "stroke: '#d4d4d8'"),
]

FILES = [
    "components/ScreenerPanel.jsx",
    "components/ResultsPanel.jsx",
    "components/StockDetail.jsx",
    "components/NewsPanel.jsx",
    "components/AccountPanel.jsx",
    "components/ResearchPanel.jsx",
    "components/InteractiveSnowflake.jsx",
    "components/terminal/TerminalPanel.jsx",
    "components/terminal/WatchlistSidebar.jsx",
    "components/terminal/AiInsightPanel.jsx",
    "components/terminal/CandlestickChart.jsx",
    "components/AdminPanel.jsx",
    "components/AdminArticlesTab.jsx",
]

def process_file(path: Path) -> bool:
    raw = path.read_text(encoding="utf-8")
    s = raw
    for a, b in REPLACEMENTS:
        s = s.replace(a, b)
    if s != raw:
        path.write_text(s, encoding="utf-8")
        return True
    return False


def main():
    changed = []
    for rel in FILES:
        p = ROOT / rel
        if not p.exists():
            continue
        if process_file(p):
            changed.append(rel)
    print("Updated:", "\n  ".join(changed) if changed else "(none)")


if __name__ == "__main__":
    main()

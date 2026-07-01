import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { fetchWarehouseFinancials, fetchWarehouseFilings } from '../../api';
import ProChart from './ProChart';
import {
  Panel, KeyStatsCard, PerformanceCard, RiskCard, ValuationCard, TargetsCard,
  FinancialsCard, FilingsCard, AboutCard, RangeCard, money, num, pct,
} from './cards';

const CLASS_LABEL = {
  stock: 'Stock', etf: 'ETF / Fund', crypto: 'Crypto', commodity: 'Commodity',
  index: 'Index', forex: 'Currency', bond: 'Bond / Yield',
};

function isDark() { return typeof document !== 'undefined' && document.documentElement.classList.contains('dark'); }

// Card registry: each declares supported classes, availability, base priority,
// grid span, and a render fn. The page composes the applicable set per asset.
function buildRegistry(dark) {
  return [
    { id: 'keystats', classes: '*', span: 2, prio: 90, ok: (c) => !!c.s, node: (c) => <KeyStatsCard s={c.s} ac={c.ac} /> },
    { id: 'performance', classes: '*', span: 1, prio: 80, ok: (c) => c.rm?.performance && Object.keys(c.rm.performance).length, node: (c) => <PerformanceCard perf={c.rm.performance} /> },
    { id: 'range', classes: '*', span: 1, prio: 75, ok: (c) => c.s.low_52w != null && c.s.high_52w != null && c.s.price != null, node: (c) => <RangeCard s={c.s} /> },
    { id: 'valuation', classes: ['stock', 'etf'], span: 1, prio: 70, ok: (c) => c.s.pe_trailing != null || c.s.price_to_book != null, node: (c) => <ValuationCard s={c.s} /> },
    { id: 'targets', classes: ['stock'], span: 1, prio: 65, ok: (c) => c.s.target_mean != null || c.s.recommendation, node: (c) => <TargetsCard s={c.s} /> },
    { id: 'financials', classes: ['stock'], span: 2, prio: 60, ok: (c) => c.financials?.annual?.length, node: (c) => <FinancialsCard financials={c.financials} dark={dark} /> },
    { id: 'risk', classes: '*', span: 1, prio: 50, ok: (c) => c.rm && Object.keys(c.rm).length, node: (c) => <RiskCard rm={c.rm} /> },
    { id: 'filings', classes: ['stock'], span: 1, prio: 45, ok: (c) => c.filings?.length, node: (c) => <FilingsCard filings={c.filings} /> },
    { id: 'about', classes: '*', span: 2, prio: 20, ok: (c) => !!c.s.description, node: (c) => <AboutCard s={c.s} /> },
  ];
}

// Agent intent → boost matching cards so "show financials" surfaces that card.
function intentBoost(id, intent) {
  const t = String(intent || '').toLowerCase();
  const map = {
    financials: /financ|earnings|revenue|income|statement|profit/,
    valuation: /valuation|cheap|expensive|p\/e|multiple|overvalued|undervalued/,
    targets: /target|analyst|upside|consensus|rating/,
    risk: /risk|volatil|drawdown|sharpe|beta/,
    filings: /filing|sec|8-k|10-k|10-q|disclosure/,
  };
  return map[id]?.test(t) ? 100 : 0;
}

export default function ResearchDashboard({ symbol, data, loading = false, intent = '', onNavigate }) {
  const [dark, setDark] = useState(isDark());
  const [financials, setFinancials] = useState(null);
  const [filings, setFilings] = useState(null);

  const s = data?.summary || {};
  const ac = data?.asset_class || 'stock';
  const rm = data?.risk_metrics || {};

  useEffect(() => {
    const onTheme = () => setDark(isDark());
    window.addEventListener('eq-theme-changed', onTheme);
    return () => window.removeEventListener('eq-theme-changed', onTheme);
  }, []);

  // Stock-only extras from the warehouse (EDGAR).
  useEffect(() => {
    setFinancials(null); setFilings(null);
    if (ac !== 'stock' || !symbol) return;
    let cancel = false;
    fetchWarehouseFinancials(symbol).then((r) => { if (!cancel) setFinancials(r?.available ? r : null); });
    fetchWarehouseFilings(symbol).then((r) => { if (!cancel) setFilings(r?.available ? r.filings : null); });
    return () => { cancel = true; };
  }, [symbol, ac]);

  const ctx = { s, ac, data, rm, financials, filings, dark };

  const cards = useMemo(() => {
    if (!data) return [];  // chart-first: cards fill in once research data arrives
    const reg = buildRegistry(dark);
    return reg
      .filter((card) => (card.classes === '*' || card.classes.includes(ac)) && card.ok(ctx))
      .map((card) => ({ ...card, score: card.prio + intentBoost(card.id, intent) }))
      .sort((a, b) => b.score - a.score);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ac, dark, intent, financials, filings, data]);

  const up = (s.change || 0) >= 0;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-zinc-200/70 shadow-sm dark:bg-zinc-900/70 dark:ring-zinc-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{s.name || symbol}</h2>
            {data && <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-900">{CLASS_LABEL[ac] || ac}</span>}
          </div>
          <div className="mt-0.5 text-xs text-zinc-400">
            {symbol}{s.exchange ? ` · ${s.exchange}` : ''}{s.sector ? ` · ${s.sector}` : ''}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {s.price != null ? num(s.price) : '—'} <span className="text-xs font-medium text-zinc-400">{s.currency || ''}</span>
          </div>
          <div className={`font-mono text-sm font-semibold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {s.change != null ? `${s.change >= 0 ? '+' : ''}${num(s.change)} (${pct(s.change_pct)})` : ''}
          </div>
        </div>
      </div>

      {/* Pro price chart — always, full width */}
      <Panel title="Price" actions={
        <button type="button" onClick={() => onNavigate?.('terminal', symbol)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40">
          <BarChart3 className="h-3.5 w-3.5" /> Full terminal
        </button>}>
        <ProChart symbol={symbol} height={380} />
      </Panel>

      {/* Adaptive card grid */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {cards.map((card) => (
          <div key={card.id} className={card.span === 2 ? 'lg:col-span-2' : ''}>{card.node(ctx)}</div>
        ))}
      </div>

      {!data && loading && (
        <div className="flex items-center gap-2 rounded-2xl bg-white p-4 text-xs text-zinc-400 ring-1 ring-zinc-200/70 dark:bg-zinc-900/70 dark:ring-zinc-800">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading fundamentals, stats & financials…
        </div>
      )}
    </div>
  );
}

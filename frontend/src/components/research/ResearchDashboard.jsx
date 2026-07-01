import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { fetchWarehouseFinancials, fetchWarehouseFilings } from '../../api';
import ProChart from './ProChart';
import {
  Panel, KeyStatsCard, PerformanceCard, RiskCard, ValuationCard, TargetsCard,
  FinancialsCard, FilingsCard, AboutCard, RangeCard,
  ProfitabilityCard, GrowthCard, BalanceCard, OwnershipCard, DividendCard,
  ScoresCard, SupplyCard, FundReturnsCard, VolumeCard,
  money, num, pct,
} from './cards';

const CLASS_LABEL = {
  stock: 'Stock', etf: 'ETF / Fund', crypto: 'Crypto', commodity: 'Commodity',
  index: 'Index', forex: 'Currency', bond: 'Bond / Yield',
};

function isDark() { return typeof document !== 'undefined' && document.documentElement.classList.contains('dark'); }

/** Inline 90-day sparkline for the quote header, drawn from the research chart payload. */
function Spark({ chart, up }) {
  const pts = useMemo(() => {
    const rows = (chart || []).slice(-90).map((p) => Number(p.close)).filter(Number.isFinite);
    if (rows.length < 8) return null;
    const min = Math.min(...rows), max = Math.max(...rows);
    const span = max - min || 1;
    const W = 132, H = 40;
    const step = W / (rows.length - 1);
    const d = rows.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(H - 3 - ((v - min) / span) * (H - 6)).toFixed(1)}`).join('');
    return { d, W, H, last: rows[rows.length - 1], first: rows[0] };
  }, [chart]);
  if (!pts) return null;
  const color = up ? 'var(--eq-gain)' : 'var(--eq-loss)';
  return (
    <svg width={pts.W} height={pts.H} viewBox={`0 0 ${pts.W} ${pts.H}`} className="hidden shrink-0 sm:block" aria-hidden>
      <defs>
        <linearGradient id="eq-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${pts.d}L${pts.W},${pts.H}L0,${pts.H}Z`} fill="url(#eq-spark-fill)" stroke="none" />
      <path d={pts.d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Card registry: each declares supported classes, availability, base priority,
// grid span, and a render fn. The page composes the applicable set per asset.
function buildRegistry(dark) {
  return [
    { id: 'keystats', classes: '*', span: 2, prio: 90, ok: (c) => !!c.s, node: (c) => <KeyStatsCard s={c.s} ac={c.ac} /> },
    { id: 'performance', classes: '*', span: 1, prio: 80, ok: (c) => c.rm?.performance && Object.keys(c.rm.performance).length, node: (c) => <PerformanceCard perf={c.rm.performance} /> },
    { id: 'range', classes: '*', span: 1, prio: 75, ok: (c) => c.s.low_52w != null && c.s.high_52w != null && c.s.price != null, node: (c) => <RangeCard s={c.s} /> },
    { id: 'profitability', classes: ['stock'], span: 1, prio: 72, ok: (c) => !!c.data?.profitability, node: (c) => <ProfitabilityCard p={c.data.profitability} /> },
    { id: 'valuation', classes: ['stock', 'etf'], span: 1, prio: 70, ok: (c) => c.s.pe_trailing != null || c.s.price_to_book != null, node: (c) => <ValuationCard s={c.s} /> },
    { id: 'growth', classes: ['stock'], span: 2, prio: 68, ok: (c) => !!c.data?.growth, node: (c) => <GrowthCard g={c.data.growth} /> },
    { id: 'targets', classes: ['stock'], span: 1, prio: 65, ok: (c) => c.s.target_mean != null || c.s.recommendation, node: (c) => <TargetsCard s={c.s} /> },
    { id: 'supply', classes: ['crypto'], span: 1, prio: 72, ok: (c) => c.s.circulating_supply != null, node: (c) => <SupplyCard s={c.s} /> },
    { id: 'fundreturns', classes: ['etf'], span: 1, prio: 72, ok: (c) => c.s.ytd_return != null || c.s.nav_price != null, node: (c) => <FundReturnsCard s={c.s} /> },
    { id: 'financials', classes: ['stock'], span: 2, prio: 60, ok: (c) => c.financials?.annual?.length, node: (c) => <FinancialsCard financials={c.financials} dark={dark} /> },
    { id: 'balance', classes: ['stock'], span: 1, prio: 58, ok: (c) => !!c.data?.balance, node: (c) => <BalanceCard b={c.data.balance} /> },
    { id: 'ownership', classes: ['stock'], span: 1, prio: 56, ok: (c) => !!c.data?.ownership, node: (c) => <OwnershipCard o={c.data.ownership} /> },
    { id: 'dividend', classes: ['stock'], span: 1, prio: 54, ok: (c) => c.s.dividend_yield_pct != null || c.s.dividend_rate != null, node: (c) => <DividendCard s={c.s} /> },
    { id: 'scores', classes: ['stock'], span: 1, prio: 52, ok: (c) => !!c.data?.snowflake, node: (c) => <ScoresCard sf={c.data.snowflake} /> },
    { id: 'risk', classes: '*', span: 1, prio: 50, ok: (c) => c.rm && Object.keys(c.rm).length, node: (c) => <RiskCard rm={c.rm} /> },
    { id: 'volume', classes: '*', span: 1, prio: 48, ok: (c) => c.s.volume && c.s.avg_volume, node: (c) => <VolumeCard s={c.s} /> },
    { id: 'filings', classes: ['stock'], span: 1, prio: 45, ok: (c) => c.filings?.length, node: (c) => <FilingsCard filings={c.filings} /> },
    { id: 'about', classes: '*', span: 2, prio: 20, ok: (c) => !!c.s.description, node: (c) => <AboutCard s={c.s} /> },
  ];
}

// Agent intent → boost matching cards so "show financials" surfaces that card.
function intentBoost(id, intent) {
  const t = String(intent || '').toLowerCase();
  const map = {
    financials: /financ|earnings|revenue|income|statement|profit/,
    profitability: /margin|profitab|roe|roa|return on/,
    growth: /growth|cash flow|fcf|ebitda/,
    balance: /balance|debt|cash|liquid|solven/,
    ownership: /ownership|insider|institution|short interest|squeeze/,
    dividend: /dividend|yield|payout|income invest/,
    valuation: /valuation|cheap|expensive|p\/e|multiple|overvalued|undervalued/,
    targets: /target|analyst|upside|consensus|rating/,
    risk: /risk|volatil|drawdown|sharpe|beta/,
    supply: /supply|circulating|halving|tokenomics/,
    fundreturns: /fund|nav|aum|expense/,
    volume: /volume|liquidity|activity/,
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
      {/* Quote header */}
      <div className="eq-card eq-fade-up flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-tight text-[var(--eq-text)]">{s.name || symbol}</h2>
            {data && <span className="eq-chip eq-chip-accent shrink-0">{CLASS_LABEL[ac] || ac}</span>}
          </div>
          <div className="eq-num mt-0.5 text-[11px] text-[var(--eq-text3)]">
            {symbol}{s.exchange ? ` · ${s.exchange}` : ''}{s.sector ? ` · ${s.sector}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-5">
          <Spark chart={data?.chart} up={up} />
          <div className="text-right">
            <div className="eq-num text-[26px] font-bold leading-tight text-[var(--eq-text)]">
              {s.price != null ? num(s.price) : '—'}
              <span className="ml-1.5 text-[11px] font-medium text-[var(--eq-text3)]">{s.currency || ''}</span>
            </div>
            <div className={`eq-num text-[12.5px] font-semibold ${up ? 'eq-gain' : 'eq-loss'}`}>
              {s.change != null ? `${s.change >= 0 ? '+' : ''}${num(s.change)} (${pct(s.change_pct)})` : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Pro price chart — always, full width */}
      <Panel title="Price" actions={
        <button type="button" onClick={() => onNavigate?.('terminal', symbol)}
          className="eq-btn eq-btn-ghost !px-2 !py-1 !text-[11px] !text-[var(--eq-accent)]">
          <BarChart3 className="h-3.5 w-3.5" strokeWidth={1.8} /> Full terminal
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
        <div className="eq-card flex items-center gap-2 p-4 text-xs text-[var(--eq-text3)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading fundamentals, stats & financials…
        </div>
      )}
    </div>
  );
}

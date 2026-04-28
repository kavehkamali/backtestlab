import { useState, useEffect, useMemo } from 'react';
import { Search, Loader2, X, ChevronDown, ChevronRight, ArrowUpDown, SlidersHorizontal, Columns3, ExternalLink } from 'lucide-react';
import { runScreener, fetchScreenerLists, fetchStockDetail } from '../api';
import StockDetail from './StockDetail';
import InteractiveSnowflake from './InteractiveSnowflake';

const STRATEGY_LABELS = {
  sma_crossover: 'SMA', ema_crossover: 'EMA', rsi: 'RSI', macd: 'MACD',
  bollinger_bands: 'BB', mean_reversion: 'MR', momentum: 'MOM',
};
const ALL_STRATEGIES = Object.keys(STRATEGY_LABELS);

// ─── Column definitions ───
const COLUMNS = {
  // Always visible
  symbol: { label: 'Symbol', group: 'core', default: true, alwaysOn: true },
  sparkline: { label: '60D Chart', group: 'core', default: true },
  price: { label: 'Price', group: 'core', default: true, sortable: true, align: 'right', fmt: v => `$${v}` },
  // Performance
  change_1d: { label: '1D %', group: 'performance', default: true, sortable: true, align: 'right', pct: true },
  change_5d: { label: '5D %', group: 'performance', default: true, sortable: true, align: 'right', pct: true },
  change_20d: { label: '1M %', group: 'performance', default: true, sortable: true, align: 'right', pct: true },
  change_60d: { label: '3M %', group: 'performance', default: false, sortable: true, align: 'right', pct: true },
  pct_from_52w_high: { label: '52W Hi %', group: 'performance', default: true, sortable: true, align: 'right', pct: true },
  // Technical
  rsi: { label: 'RSI', group: 'technical', default: true, sortable: true, align: 'center', custom: 'rsi' },
  vol_ratio: { label: 'Vol Ratio', group: 'technical', default: true, sortable: true, align: 'center', fmt: v => `${v}x` },
  bb_pos: { label: 'BB Pos', group: 'technical', default: false, sortable: true, align: 'center', fmt: v => v?.toFixed(2) },
  volatility: { label: 'Volatility', group: 'technical', default: false, sortable: true, align: 'right', fmt: v => v ? `${v}%` : '—' },
  macd_hist: { label: 'MACD', group: 'technical', default: false, sortable: true, align: 'right', fmt: v => v?.toFixed(3) },
  // Fundamentals
  market_cap: { label: 'Mkt Cap', group: 'fundamental', default: true, sortable: true, align: 'right', fmt: v => fmtCap(v) },
  pe_ratio: { label: 'P/E', group: 'fundamental', default: true, sortable: true, align: 'right', fmt: v => v?.toFixed(1) || '—' },
  forward_pe: { label: 'Fwd P/E', group: 'fundamental', default: false, sortable: true, align: 'right', fmt: v => v?.toFixed(1) || '—' },
  eps: { label: 'EPS', group: 'fundamental', default: false, sortable: true, align: 'right', fmt: v => v != null ? `$${v.toFixed(2)}` : '—' },
  dividend_yield: { label: 'Div %', group: 'fundamental', default: false, sortable: true, align: 'right', fmt: v => v != null ? `${v}%` : '—' },
  beta: { label: 'Beta', group: 'fundamental', default: false, sortable: true, align: 'right', fmt: v => v?.toFixed(2) || '—' },
  profit_margin: { label: 'Margin %', group: 'fundamental', default: false, sortable: true, align: 'right', fmt: v => v != null ? `${v}%` : '—' },
  revenue_growth: { label: 'Rev Grw %', group: 'fundamental', default: false, sortable: true, align: 'right', pct: true },
  earnings_growth: { label: 'Earn Grw %', group: 'fundamental', default: false, sortable: true, align: 'right', pct: true },
  return_on_equity: { label: 'ROE %', group: 'fundamental', default: false, sortable: true, align: 'right', fmt: v => v != null ? `${v}%` : '—' },
  price_to_book: { label: 'P/B', group: 'fundamental', default: false, sortable: true, align: 'right', fmt: v => v?.toFixed(2) || '—' },
  debt_to_equity: { label: 'D/E', group: 'fundamental', default: false, sortable: true, align: 'right', fmt: v => v?.toFixed(1) || '—' },
  current_ratio: { label: 'Curr Ratio', group: 'fundamental', default: false, sortable: true, align: 'right', fmt: v => v?.toFixed(2) || '—' },
  // Ownership
  short_pct_float: { label: 'Short %', group: 'ownership', default: false, sortable: true, align: 'right', fmt: v => v != null ? `${v}%` : '—' },
  short_ratio: { label: 'Short Ratio', group: 'ownership', default: false, sortable: true, align: 'right', fmt: v => v?.toFixed(1) || '—' },
  insider_pct: { label: 'Insider %', group: 'ownership', default: false, sortable: true, align: 'right', fmt: v => v != null ? `${v}%` : '—' },
  institution_pct: { label: 'Inst %', group: 'ownership', default: false, sortable: true, align: 'right', fmt: v => v != null ? `${v}%` : '—' },
  // Info
  sector: { label: 'Sector', group: 'info', default: false, align: 'left' },
  industry: { label: 'Industry', group: 'info', default: false, align: 'left' },
  // Signals (always at end)
  signals: { label: 'Signals', group: 'signals', default: true, alwaysOn: true },
  buy_count: { label: 'Score', group: 'signals', default: true, sortable: true, alwaysOn: true, custom: 'score' },
};

const COL_GROUPS = {
  core: 'Core', performance: 'Performance', technical: 'Technical',
  fundamental: 'Fundamentals', ownership: 'Ownership', info: 'Info',
};

function fmtCap(v) {
  if (!v) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v}`;
}

// ─── Default thresholds ───
const DEFAULT_FILTERS = {
  rsi_min: 0, rsi_max: 100,
  change_1d_min: -100, change_1d_max: 100,
  change_5d_min: -100, change_5d_max: 100,
  change_20d_min: -100, change_20d_max: 100,
  change_60d_min: -100, change_60d_max: 100,
  pct_from_52w_high_min: -100, pct_from_52w_high_max: 0,
  vol_ratio_min: 0, vol_ratio_max: 50,
  volatility_min: 0, volatility_max: 200,
  bb_pos_min: 0, bb_pos_max: 1,
  min_buy_signals: 0,
  above_sma20: 'any', above_sma50: 'any', above_sma200: 'any',
  macd_trend: 'any',
  market_cap_min: 0, market_cap_max: 999999,
  pe_min: 0, pe_max: 999,
  dividend_yield_min: 0, dividend_yield_max: 100,
  beta_min: 0, beta_max: 10,
  short_pct_min: 0, short_pct_max: 100,
  insider_pct_min: 0, insider_pct_max: 100,
  profit_margin_min: -100, profit_margin_max: 100,
};

// ─── Tiny components ───
function SignalDot({ signal }) {
  if (signal === 1) return <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 mx-auto" title="BUY" />;
  if (signal === -1) return <div className="w-2.5 h-2.5 rounded-full bg-red-400 mx-auto" title="SELL" />;
  return <div className="w-2 h-2 rounded-full bg-gray-700 mx-auto" title="NEUTRAL" />;
}

function Sparkline({ data, width = 80, height = 24 }) {
  if (!data?.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`).join(' ');
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline fill="none" stroke={data[data.length - 1] >= data[0] ? '#22c55e' : '#ef4444'} strokeWidth="1.5" points={points} />
    </svg>
  );
}

function RsiBar({ value }) {
  const color = value >= 70 ? 'bg-red-400' : value <= 30 ? 'bg-emerald-400' : 'bg-indigo-400';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-[10px] font-mono ${value >= 70 ? 'text-red-600' : value <= 30 ? 'text-emerald-600' : 'text-zinc-500'}`}>{value}</span>
    </div>
  );
}

function ScoreBar({ count, total }) {
  const pct = (count / total) * 100;
  const color = pct >= 66 ? 'bg-emerald-400' : pct >= 33 ? 'bg-yellow-400' : 'bg-red-400';
  const tc = pct >= 66 ? 'text-emerald-300' : pct >= 33 ? 'text-yellow-300' : 'text-zinc-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-bold ${tc}`}>{count}/{total}</span>
    </div>
  );
}

function PctCell({ value }) {
  if (value == null) return <span className="text-zinc-700">—</span>;
  const c = value > 0 ? 'text-emerald-600' : value < 0 ? 'text-red-600' : 'text-zinc-500';
  return <span className={`${c} font-mono`}>{value > 0 ? '+' : ''}{value}%</span>;
}

function RangeRow({ label, value_min, value_max, step = 1, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-zinc-500 w-20 shrink-0">{label}</span>
      <input type="text" inputMode="decimal" value={value_min} onChange={e => onChange('min', parseFloat(e.target.value) || 0)}
        className="w-16 bg-zinc-100 ring-1 ring-zinc-200/80 rounded px-1.5 py-0.5 text-[10px] text-zinc-900 text-center focus:outline-none focus:border-indigo-500/50" />
      <span className="text-zinc-600 text-[10px]">to</span>
      <input type="text" inputMode="decimal" value={value_max} onChange={e => onChange('max', parseFloat(e.target.value) || 0)}
        className="w-16 bg-zinc-100 ring-1 ring-zinc-200/80 rounded px-1.5 py-0.5 text-[10px] text-zinc-900 text-center focus:outline-none focus:border-indigo-500/50" />
    </div>
  );
}

function ToggleRow({ label, value, onChange, options }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-zinc-500 w-20 shrink-0">{label}</span>
      <div className="flex gap-0.5">
        {options.map(o => (
          <button key={o.value} onClick={() => onChange(o.value)}
            className={`px-2 py-0.5 rounded text-[9px] font-medium ${value === o.value ? 'bg-indigo-500/20 text-indigo-700' : 'bg-zinc-100 text-zinc-600 hover:text-zinc-500'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main ───
export default function ScreenerPanel({ onOpenResearch }) {
  const [lists, setLists] = useState([]);
  const [activeList, setActiveList] = useState('sp500');
  const [results, setResults] = useState(null);
  const [listName, setListName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState('buy_count');
  const [sortAsc, setSortAsc] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStock, setSelectedStock] = useState(null);
  const [stockDetail, setStockDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Panels
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });

  // Column visibility
  const [visibleCols, setVisibleCols] = useState(() => {
    const init = {};
    Object.entries(COLUMNS).forEach(([k, v]) => { init[k] = v.default; });
    return init;
  });

  // ─── Interactive Snowflake Filters ───
  const scoreCut = (val, labels) => labels[Math.max(0, Math.min(labels.length - 1, Math.round(Number(val) || 0)))];
  const SF_QUALITY_DIMS = [
    { key: 'value', label: 'Value', color: '#818cf8' },
    { key: 'future', label: 'Future', color: '#34d399' },
    { key: 'past', label: 'Past', color: '#fbbf24' },
    { key: 'health', label: 'Health', color: '#22d3ee' },
    { key: 'dividend', label: 'Dividend', color: '#f472b6' },
  ];
  const SF_FUNDAMENTAL_DIMS = [
    { key: 'valuation', label: 'Valuation', color: '#818cf8', formatThreshold: v => `P/E <= ${scoreCut(v, ['50+', '50', '35', '25', '18', '12', '8'])}` },
    { key: 'growth', label: 'Growth', color: '#34d399', formatThreshold: v => `Rev >= ${scoreCut(v, ['-10%', '0%', '5%', '10%', '20%', '35%', '50%'])}` },
    { key: 'profitability', label: 'Profit', color: '#fbbf24', formatThreshold: v => `Mrg >= ${scoreCut(v, ['-5%', '0%', '5%', '10%', '20%', '35%', '50%'])}` },
    { key: 'balance', label: 'Balance', color: '#22d3ee', formatThreshold: v => `D/E <= ${scoreCut(v, ['400+', '400', '250', '150', '80', '40', '20'])}` },
    { key: 'income', label: 'Income', color: '#f472b6', formatThreshold: v => `Div >= ${scoreCut(v, ['0%', '0.5%', '1%', '2%', '3%', '4%', '6%'])}` },
  ];
  const SF_TECHNICAL_DIMS = [
    { key: 'rsi_score', label: 'RSI', color: '#818cf8', formatThreshold: v => `RSI >= ${scoreCut(v, ['20', '30', '40', '50', '60', '70', '80'])}` },
    { key: 'macd_score', label: 'MACD', color: '#34d399' },
    { key: 'volume_score', label: 'Volume', color: '#fbbf24', formatThreshold: v => `Vol >= ${scoreCut(v, ['0.3x', '0.6x', '0.8x', '1.0x', '1.5x', '2.0x', '3.0x'])}` },
    { key: 'trend_score', label: 'Trend', color: '#22d3ee', formatThreshold: v => `${Math.round(Number(v) || 0)}/6` },
    { key: 'bb_score', label: 'Bollinger', color: '#f472b6' },
  ];
  const SF_MOMENTUM_DIMS = [
    { key: 'mom_1d', label: '1D', color: '#818cf8', formatThreshold: v => `>= ${scoreCut(v, ['-10%', '-5%', '0%', '+3%', '+8%', '+15%', '+15%'])}` },
    { key: 'mom_5d', label: '5D', color: '#34d399', formatThreshold: v => `>= ${scoreCut(v, ['-10%', '-5%', '0%', '+3%', '+8%', '+15%', '+15%'])}` },
    { key: 'mom_20d', label: '1M', color: '#fbbf24', formatThreshold: v => `>= ${scoreCut(v, ['-10%', '-5%', '0%', '+3%', '+8%', '+15%', '+15%'])}` },
    { key: 'mom_60d', label: '3M', color: '#22d3ee', formatThreshold: v => `>= ${scoreCut(v, ['-10%', '-5%', '0%', '+3%', '+8%', '+15%', '+15%'])}` },
    { key: 'mom_52w', label: '52W', color: '#f472b6', formatThreshold: v => `near ${scoreCut(v, ['-20%', '-15%', '-10%', '-5%', '0%', '+5%', '+10%'])}` },
  ];

  const [sfQualityEnabled, setSfQualityEnabled] = useState(false);
  const [sfFundEnabled, setSfFundEnabled] = useState(false);
  const [sfTechEnabled, setSfTechEnabled] = useState(false);
  const [sfMomEnabled, setSfMomEnabled] = useState(false);
  const [sfQuality, setSfQuality] = useState({ value: 3, future: 3, past: 3, health: 3, dividend: 3 });
  const [sfFund, setSfFund] = useState({ valuation: 3, growth: 3, profitability: 3, balance: 3, income: 3 });
  const [sfTech, setSfTech] = useState({ rsi_score: 3, macd_score: 3, volume_score: 3, trend_score: 3, bb_score: 3 });
  const [sfMom, setSfMom] = useState({ mom_1d: 3, mom_5d: 3, mom_20d: 3, mom_60d: 3, mom_52w: 3 });

  const anySfActive = sfQualityEnabled || sfFundEnabled || sfTechEnabled || sfMomEnabled;

  // Helper: compute technical/momentum scores from stock data (0-6)
  const computeFundScores = (r) => {
    const sc = (val, thresholds, reverse = false) => {
      if (val == null) return 3;
      const scores = reverse ? [6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6];
      for (let i = 0; i < thresholds.length; i++) { if (val < thresholds[i]) return scores[i]; }
      return scores[scores.length - 1];
    };
    const avg = (vals) => {
      const nums = vals.filter(v => v != null && Number.isFinite(Number(v)));
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 3;
    };
    return {
      valuation: Math.round(avg([sc(r.pe_ratio, [8, 12, 18, 25, 35, 50], true), sc(r.price_to_book, [1, 2, 3, 5, 8, 15], true)]) * 10) / 10,
      growth: Math.round(avg([sc(r.revenue_growth, [-10, 0, 5, 10, 20, 35]), sc(r.earnings_growth, [-10, 0, 5, 10, 20, 35])]) * 10) / 10,
      profitability: Math.round(avg([sc(r.profit_margin, [-5, 0, 5, 10, 20, 35]), sc(r.return_on_equity, [-5, 0, 5, 10, 20, 35])]) * 10) / 10,
      balance: Math.round(avg([sc(r.debt_to_equity, [20, 40, 80, 150, 250, 400], true), sc(r.current_ratio, [0.5, 0.8, 1.0, 1.5, 2.0, 3.0])]) * 10) / 10,
      income: sc(r.dividend_yield, [0, 0.5, 1, 2, 3, 4]),
    };
  };
  const computeTechScores = (r) => {
    const sc = (val, thresholds) => {
      if (val == null) return 3;
      for (let i = 0; i < thresholds.length; i++) { if (val < thresholds[i]) return i; }
      return thresholds.length;
    };
    return {
      rsi_score: sc(r.rsi, [20, 30, 40, 50, 60, 70]),
      macd_score: r.macd_trend === 'rising' ? (r.macd_hist > 0 ? 5 : 3) : (r.macd_hist < 0 ? 1 : 3),
      volume_score: sc(r.vol_ratio, [0.3, 0.6, 0.8, 1.0, 1.5, 2.0]),
      trend_score: (r.above_sma20 ? 2 : 0) + (r.above_sma50 ? 2 : 0) + (r.above_sma200 ? 2 : 0),
      bb_score: sc(r.bb_pos, [0.05, 0.15, 0.3, 0.5, 0.7, 0.85]),
    };
  };
  const computeMomScores = (r) => {
    const sc = (val) => {
      if (val == null) return 3;
      if (val < -10) return 0; if (val < -5) return 1; if (val < 0) return 2;
      if (val < 3) return 3; if (val < 8) return 4; if (val < 15) return 5;
      return 6;
    };
    return {
      mom_1d: sc(r.change_1d),
      mom_5d: sc(r.change_5d),
      mom_20d: sc(r.change_20d),
      mom_60d: sc(r.change_60d),
      mom_52w: sc(r.pct_from_52w_high != null ? r.pct_from_52w_high + 10 : null), // shift so -10% = 0
    };
  };

  useEffect(() => {
    fetchScreenerLists().then(d => setLists(d.lists)).catch(() => {});
    // Auto-load all stocks on first visit
    setLoading(true);
    runScreener({ list_id: 'sp500', strategies: ALL_STRATEGIES })
      .then(res => { setResults(res.results); setListName(res.list_name); setActiveList('sp500'); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleCol = (key) => {
    if (COLUMNS[key].alwaysOn) return;
    setVisibleCols(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const updateFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));
  const resetFilters = () => setFilters({ ...DEFAULT_FILTERS });

  const activeFilterCount = useMemo(() => {
    let c = 0;
    const d = DEFAULT_FILTERS;
    Object.keys(d).forEach(k => { if (filters[k] !== d[k]) c++; });
    return c;
  }, [filters]);

  const handleScan = async (listId) => {
    const id = listId || activeList;
    setActiveList(id);
    setLoading(true);
    setError(null);
    setSelectedStock(null);
    setStockDetail(null);
    try {
      const res = await runScreener({ list_id: id, strategies: ALL_STRATEGIES });
      setResults(res.results);
      setListName(res.list_name);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleStockClick = async (symbol) => {
    setSelectedStock(symbol);
    setDetailLoading(true);
    try { setStockDetail(await fetchStockDetail(symbol)); }
    catch { setStockDetail(null); }
    finally { setDetailLoading(false); }
  };

  const openResearch = (symbol) => {
    const sym = symbol ? String(symbol).trim().toUpperCase() : '';
    if (!sym) return;
    onOpenResearch?.(sym);
  };

  useEffect(() => {
    const onAgentTicker = async (e) => {
      const { tab, ticker } = e.detail || {};
      if (tab !== 'screener' || !ticker) return;
      const sym = String(ticker).trim().toUpperCase();
      setSearchTerm(sym);
      setSelectedStock(sym);
      setDetailLoading(true);
      try {
        setStockDetail(await fetchStockDetail(sym));
      } catch {
        setStockDetail(null);
      } finally {
        setDetailLoading(false);
      }
    };
    window.addEventListener('eq-agent-open-ticker', onAgentTicker);
    return () => window.removeEventListener('eq-agent-open-ticker', onAgentTicker);
  }, []);

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const filteredResults = useMemo(() => {
    if (!results) return [];
    let out = results;

    if (searchTerm) {
      const t = searchTerm.toUpperCase();
      out = out.filter(r => r.symbol.includes(t) || (r.name || '').toUpperCase().includes(t));
    }

    const f = filters;
    out = out.filter(r => {
      if (r.rsi < f.rsi_min || r.rsi > f.rsi_max) return false;
      if (r.change_1d < f.change_1d_min || r.change_1d > f.change_1d_max) return false;
      if (r.change_5d < f.change_5d_min || r.change_5d > f.change_5d_max) return false;
      if (r.change_20d < f.change_20d_min || r.change_20d > f.change_20d_max) return false;
      if (r.change_60d < f.change_60d_min || r.change_60d > f.change_60d_max) return false;
      if (r.pct_from_52w_high < f.pct_from_52w_high_min || r.pct_from_52w_high > f.pct_from_52w_high_max) return false;
      if (r.vol_ratio < f.vol_ratio_min || r.vol_ratio > f.vol_ratio_max) return false;
      if (r.volatility < f.volatility_min || r.volatility > f.volatility_max) return false;
      if (r.bb_pos < f.bb_pos_min || r.bb_pos > f.bb_pos_max) return false;
      if (r.buy_count < f.min_buy_signals) return false;
      if (f.above_sma20 === 'yes' && !r.above_sma20) return false;
      if (f.above_sma20 === 'no' && r.above_sma20) return false;
      if (f.above_sma50 === 'yes' && !r.above_sma50) return false;
      if (f.above_sma50 === 'no' && r.above_sma50) return false;
      if (f.above_sma200 === 'yes' && !r.above_sma200) return false;
      if (f.above_sma200 === 'no' && r.above_sma200) return false;
      if (f.macd_trend === 'rising' && r.macd_trend !== 'rising') return false;
      if (f.macd_trend === 'falling' && r.macd_trend !== 'falling') return false;
      // Fundamental filters
      if (r.market_cap != null) {
        const mcB = r.market_cap / 1e9;
        if (mcB < f.market_cap_min || mcB > f.market_cap_max) return false;
      }
      if (r.pe_ratio != null && (r.pe_ratio < f.pe_min || r.pe_ratio > f.pe_max)) return false;
      if (r.dividend_yield != null && (r.dividend_yield < f.dividend_yield_min || r.dividend_yield > f.dividend_yield_max)) return false;
      if (r.beta != null && (r.beta < f.beta_min || r.beta > f.beta_max)) return false;
      if (r.short_pct_float != null && (r.short_pct_float < f.short_pct_min || r.short_pct_float > f.short_pct_max)) return false;
      if (r.insider_pct != null && (r.insider_pct < f.insider_pct_min || r.insider_pct > f.insider_pct_max)) return false;
      if (r.profit_margin != null && (r.profit_margin < f.profit_margin_min || r.profit_margin > f.profit_margin_max)) return false;
      // Interactive snowflake filters
      if (sfQualityEnabled && r.snowflake) {
        const sf = r.snowflake;
        for (const d of SF_QUALITY_DIMS) {
          if ((sf[d.key] || 0) < sfQuality[d.key]) return false;
        }
      }
      if (sfFundEnabled) {
        const fs = computeFundScores(r);
        for (const d of SF_FUNDAMENTAL_DIMS) {
          if ((fs[d.key] || 0) < sfFund[d.key]) return false;
        }
      }
      if (sfTechEnabled) {
        const ts = computeTechScores(r);
        for (const d of SF_TECHNICAL_DIMS) {
          if ((ts[d.key] || 0) < sfTech[d.key]) return false;
        }
      }
      if (sfMomEnabled) {
        const ms = computeMomScores(r);
        for (const d of SF_MOMENTUM_DIMS) {
          if ((ms[d.key] || 0) < sfMom[d.key]) return false;
        }
      }
      return true;
    });

    return [...out].sort((a, b) => {
      let va, vb;
      if (sortKey.startsWith('sf_')) {
        const sfKey = sortKey.replace('sf_', '');
        va = a.snowflake?.[sfKey] ?? -Infinity;
        vb = b.snowflake?.[sfKey] ?? -Infinity;
      } else {
        va = a[sortKey] ?? -Infinity;
        vb = b[sortKey] ?? -Infinity;
      }
      if (typeof va === 'boolean') { va = va ? 1 : 0; vb = vb ? 1 : 0; }
      return sortAsc ? va - vb : vb - va;
    });
  }, [results, searchTerm, filters, sortKey, sortAsc, sfQualityEnabled, sfFundEnabled, sfTechEnabled, sfMomEnabled, sfQuality, sfFund, sfTech, sfMom]);

  const marketLists = lists.filter(l => l.group === 'Markets');
  const sectorLists = lists.filter(l => l.group === 'Sectors');
  const yesNoAny = [{ value: 'any', label: 'Any' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
  const trendOpts = [{ value: 'any', label: 'Any' }, { value: 'rising', label: 'Rising' }, { value: 'falling', label: 'Falling' }];

  // Visible column keys in order
  const visCols = Object.keys(COLUMNS).filter(k => visibleCols[k]);

  // Render a cell
  const renderCell = (r, colKey) => {
    const col = COLUMNS[colKey];
    if (colKey === 'symbol') return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openResearch(r.symbol);
        }}
        className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:text-indigo-900 hover:underline"
        title={`Open full research for ${r.symbol}`}
      >
        {r.symbol}
        <ExternalLink className="h-3 w-3" />
      </button>
    );
    if (colKey === 'sparkline') return <Sparkline data={r.sparkline} />;
    if (col.custom === 'rsi') return <RsiBar value={r.rsi} />;
    if (col.custom === 'score') return <ScoreBar count={r.buy_count} total={r.total_strategies} />;
    if (colKey === 'signals') return (
      <div className="flex gap-0.5 justify-center">
        {ALL_STRATEGIES.map(s => <SignalDot key={s} signal={r.signals[s] || 0} />)}
      </div>
    );
    if (colKey === 'vol_ratio') {
      return <span className={`text-[10px] font-mono ${r.vol_ratio >= 1.5 ? 'text-yellow-400' : 'text-zinc-500'}`}>{r.vol_ratio}x</span>;
    }
    if (col.pct) return <PctCell value={r[colKey]} />;
    if (col.fmt) {
      const val = r[colKey];
      return <span className="text-zinc-600">{col.fmt(val)}</span>;
    }
    return <span className="text-zinc-500">{r[colKey] ?? '—'}</span>;
  };

  return (
    <div className="space-y-3">
      {/* ─── Top bar ─── */}
      <div className="flex flex-wrap items-center gap-2">
        {marketLists.map(l => (
          <button key={l.id} onClick={() => handleScan(l.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeList === l.id && results ? 'bg-indigo-500/20 text-indigo-700 border ring-indigo-200'
                : 'bg-white text-zinc-500 ring-1 ring-zinc-200/60 hover:text-zinc-900 hover:ring-zinc-300/70'
            }`}>
            {l.name} <span className="ml-1 text-zinc-600">{l.count}</span>
          </button>
        ))}
        <div className="w-px h-6 bg-zinc-200/60" />
        <div className="relative group">
          <button className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            activeList.startsWith('sector_') && results ? 'bg-indigo-500/20 text-indigo-700 ring-indigo-200'
              : 'bg-white text-zinc-500 ring-1 ring-zinc-200/70 hover:text-zinc-900 hover:ring-zinc-300/70'
          }`}>
            Sectors <ChevronDown className="w-3 h-3" />
          </button>
          <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block bg-white ring-1 ring-zinc-200/80 rounded-xl shadow-2xl py-1 min-w-[180px]">
            {sectorLists.map(l => (
              <button key={l.id} onClick={() => handleScan(l.id)}
                className="w-full text-left px-3 py-2 text-xs text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 flex justify-between">
                <span>{l.name}</span><span className="text-zinc-600">{l.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        {/* Columns toggle */}
        <button onClick={() => { setColumnsOpen(!columnsOpen); setFiltersOpen(false); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            columnsOpen ? 'bg-indigo-500/20 text-indigo-700 border ring-indigo-200'
              : 'bg-white text-zinc-500 ring-1 ring-zinc-200/60 hover:text-zinc-900 hover:ring-zinc-300/70'
          }`}>
          <Columns3 className="w-3 h-3" /> Columns
        </button>

        {/* Filters toggle */}
        <button onClick={() => { setFiltersOpen(!filtersOpen); setColumnsOpen(false); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            filtersOpen || activeFilterCount > 0 ? 'bg-indigo-500/20 text-indigo-700 border ring-indigo-200'
              : 'bg-white text-zinc-500 ring-1 ring-zinc-200/60 hover:text-zinc-900 hover:ring-zinc-300/70'
          }`}>
          <SlidersHorizontal className="w-3 h-3" /> Filters
          {activeFilterCount > 0 && <span className="bg-indigo-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">{activeFilterCount}</span>}
        </button>

        {results && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search ticker or name..."
              className="bg-zinc-100 ring-1 ring-zinc-200/80 rounded-lg pl-8 pr-3 py-1.5 text-zinc-900 text-xs w-36 focus:outline-none focus:border-indigo-500/50 focus:w-52 transition-all" />
          </div>
        )}
      </div>

      {/* ─── Columns Panel ─── */}
      {columnsOpen && (
        <div className="bg-zinc-50/90 shadow-sm ring-1 ring-zinc-200/70 rounded-xl p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Object.entries(COL_GROUPS).map(([groupKey, groupLabel]) => (
              <div key={groupKey}>
                <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-2 font-semibold">{groupLabel}</div>
                <div className="space-y-1">
                  {Object.entries(COLUMNS).filter(([, v]) => v.group === groupKey).map(([colKey, col]) => (
                    <label key={colKey} className={`flex items-center gap-1.5 cursor-pointer ${col.alwaysOn ? 'opacity-50' : ''}`}>
                      <input type="checkbox" checked={visibleCols[colKey]} onChange={() => toggleCol(colKey)}
                        disabled={col.alwaysOn} className="accent-indigo-500 w-3 h-3" />
                      <span className={`text-[10px] ${visibleCols[colKey] ? 'text-zinc-700' : 'text-zinc-600'}`}>{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-200/80">
            <button onClick={() => {
              const all = {};
              Object.keys(COLUMNS).forEach(k => { all[k] = true; });
              setVisibleCols(all);
            }} className="px-2 py-1 rounded text-[10px] bg-zinc-100 text-zinc-500 hover:text-zinc-900">Show All</button>
            <button onClick={() => {
              const def = {};
              Object.entries(COLUMNS).forEach(([k, v]) => { def[k] = v.default; });
              setVisibleCols(def);
            }} className="px-2 py-1 rounded text-[10px] bg-zinc-100 text-zinc-500 hover:text-zinc-900">Reset Default</button>
          </div>
        </div>
      )}

      {/* ─── Filters Panel ─── */}
      {filtersOpen && (
        <div className="bg-zinc-50/90 shadow-sm ring-1 ring-zinc-200/70 rounded-xl overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-x-6 gap-y-2 p-4">
            <div>
              <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-2 font-semibold">Performance</div>
              <div className="space-y-1.5">
                <RangeRow label="1D Change %" value_min={filters.change_1d_min} value_max={filters.change_1d_max} onChange={(s, v) => updateFilter(s === 'min' ? 'change_1d_min' : 'change_1d_max', v)} />
                <RangeRow label="5D Change %" value_min={filters.change_5d_min} value_max={filters.change_5d_max} onChange={(s, v) => updateFilter(s === 'min' ? 'change_5d_min' : 'change_5d_max', v)} />
                <RangeRow label="1M Change %" value_min={filters.change_20d_min} value_max={filters.change_20d_max} onChange={(s, v) => updateFilter(s === 'min' ? 'change_20d_min' : 'change_20d_max', v)} />
                <RangeRow label="3M Change %" value_min={filters.change_60d_min} value_max={filters.change_60d_max} onChange={(s, v) => updateFilter(s === 'min' ? 'change_60d_min' : 'change_60d_max', v)} />
                <RangeRow label="From 52W Hi" value_min={filters.pct_from_52w_high_min} value_max={filters.pct_from_52w_high_max} onChange={(s, v) => updateFilter(s === 'min' ? 'pct_from_52w_high_min' : 'pct_from_52w_high_max', v)} />
              </div>
            </div>
            <div>
              <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-2 font-semibold">Technical</div>
              <div className="space-y-1.5">
                <RangeRow label="RSI (14)" value_min={filters.rsi_min} value_max={filters.rsi_max} onChange={(s, v) => updateFilter(s === 'min' ? 'rsi_min' : 'rsi_max', v)} />
                <RangeRow label="BB Position" step={0.05} value_min={filters.bb_pos_min} value_max={filters.bb_pos_max} onChange={(s, v) => updateFilter(s === 'min' ? 'bb_pos_min' : 'bb_pos_max', v)} />
                <RangeRow label="Volatility %" value_min={filters.volatility_min} value_max={filters.volatility_max} onChange={(s, v) => updateFilter(s === 'min' ? 'volatility_min' : 'volatility_max', v)} />
                <RangeRow label="Vol Ratio" step={0.1} value_min={filters.vol_ratio_min} value_max={filters.vol_ratio_max} onChange={(s, v) => updateFilter(s === 'min' ? 'vol_ratio_min' : 'vol_ratio_max', v)} />
                <ToggleRow label="MACD Trend" value={filters.macd_trend} onChange={v => updateFilter('macd_trend', v)} options={trendOpts} />
                <ToggleRow label="Above SMA 20" value={filters.above_sma20} onChange={v => updateFilter('above_sma20', v)} options={yesNoAny} />
                <ToggleRow label="Above SMA 50" value={filters.above_sma50} onChange={v => updateFilter('above_sma50', v)} options={yesNoAny} />
                <ToggleRow label="Above SMA 200" value={filters.above_sma200} onChange={v => updateFilter('above_sma200', v)} options={yesNoAny} />
              </div>
            </div>
            <div>
              <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-2 font-semibold">Fundamentals</div>
              <div className="space-y-1.5">
                <RangeRow label="Mkt Cap ($B)" step={0.1} value_min={filters.market_cap_min} value_max={filters.market_cap_max} onChange={(s, v) => updateFilter(s === 'min' ? 'market_cap_min' : 'market_cap_max', v)} />
                <RangeRow label="P/E Ratio" step={0.1} value_min={filters.pe_min} value_max={filters.pe_max} onChange={(s, v) => updateFilter(s === 'min' ? 'pe_min' : 'pe_max', v)} />
                <RangeRow label="Div Yield %" step={0.1} value_min={filters.dividend_yield_min} value_max={filters.dividend_yield_max} onChange={(s, v) => updateFilter(s === 'min' ? 'dividend_yield_min' : 'dividend_yield_max', v)} />
                <RangeRow label="Beta" step={0.1} value_min={filters.beta_min} value_max={filters.beta_max} onChange={(s, v) => updateFilter(s === 'min' ? 'beta_min' : 'beta_max', v)} />
                <RangeRow label="Profit Mrg %" value_min={filters.profit_margin_min} value_max={filters.profit_margin_max} onChange={(s, v) => updateFilter(s === 'min' ? 'profit_margin_min' : 'profit_margin_max', v)} />
              </div>
            </div>
            <div>
              <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-2 font-semibold">Ownership & Signals</div>
              <div className="space-y-1.5">
                <RangeRow label="Short Float %" step={0.1} value_min={filters.short_pct_min} value_max={filters.short_pct_max} onChange={(s, v) => updateFilter(s === 'min' ? 'short_pct_min' : 'short_pct_max', v)} />
                <RangeRow label="Insider Own %" step={0.1} value_min={filters.insider_pct_min} value_max={filters.insider_pct_max} onChange={(s, v) => updateFilter(s === 'min' ? 'insider_pct_min' : 'insider_pct_max', v)} />
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] text-zinc-500 w-20 shrink-0">Min Signals</span>
                  <div className="flex gap-0.5">
                    {[0,1,2,3,4,5,6,7].map(n => (
                      <button key={n} onClick={() => updateFilter('min_buy_signals', n)}
                        className={`w-6 h-6 rounded text-[10px] font-medium ${filters.min_buy_signals === n ? 'bg-indigo-500/20 text-indigo-700' : 'bg-zinc-100 text-zinc-600 hover:text-zinc-500'}`}>{n}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-200/80">
                <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-2 font-semibold">Quick Presets</div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setFilters({ ...DEFAULT_FILTERS, rsi_max: 30 })} className="px-2 py-1 rounded text-[10px] bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20">Oversold</button>
                  <button onClick={() => setFilters({ ...DEFAULT_FILTERS, rsi_min: 70 })} className="px-2 py-1 rounded text-[10px] bg-red-500/10 text-red-600 hover:bg-red-500/20">Overbought</button>
                  <button onClick={() => setFilters({ ...DEFAULT_FILTERS, above_sma20: 'yes', above_sma50: 'yes', above_sma200: 'yes', min_buy_signals: 3 })} className="px-2 py-1 rounded text-[10px] bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20">Bullish</button>
                  <button onClick={() => setFilters({ ...DEFAULT_FILTERS, above_sma200: 'no', pct_from_52w_high_min: -50, pct_from_52w_high_max: -20 })} className="px-2 py-1 rounded text-[10px] bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20">Deep Value</button>
                  <button onClick={() => setFilters({ ...DEFAULT_FILTERS, market_cap_min: 0, market_cap_max: 2 })} className="px-2 py-1 rounded text-[10px] bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20">Small Cap</button>
                  <button onClick={() => setFilters({ ...DEFAULT_FILTERS, dividend_yield_min: 3 })} className="px-2 py-1 rounded text-[10px] bg-purple-500/10 text-purple-400 hover:bg-purple-500/20">High Dividend</button>
                  <button onClick={() => setFilters({ ...DEFAULT_FILTERS, short_pct_min: 15 })} className="px-2 py-1 rounded text-[10px] bg-orange-500/10 text-orange-400 hover:bg-orange-500/20">High Short</button>
                  <button onClick={resetFilters} className="px-2 py-1 rounded text-[10px] bg-zinc-100 text-zinc-500 hover:text-zinc-900">Reset All</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Interactive Snowflake Filters ─── */}
      {results && (
        <div className="bg-white shadow-sm ring-1 ring-zinc-200/60 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Visual Filters</span>
              <span className="text-[9px] text-zinc-600">Drag points to set minimum thresholds</span>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => { setSfQualityEnabled(false); setSfFundEnabled(false); setSfTechEnabled(false); setSfMomEnabled(false); }}
                className="px-2 py-0.5 rounded text-[9px] text-zinc-500 hover:text-zinc-900 bg-zinc-100">All Off</button>
              <button onClick={() => { setSfQualityEnabled(true); setSfFundEnabled(true); setSfTechEnabled(true); setSfMomEnabled(true); }}
                className="px-2 py-0.5 rounded text-[9px] text-zinc-500 hover:text-zinc-900 bg-zinc-100">All On</button>
              <button onClick={() => {
                setSfQuality({ value: 3, future: 3, past: 3, health: 3, dividend: 3 });
                setSfFund({ valuation: 3, growth: 3, profitability: 3, balance: 3, income: 3 });
                setSfTech({ rsi_score: 3, macd_score: 3, volume_score: 3, trend_score: 3, bb_score: 3 });
                setSfMom({ mom_1d: 3, mom_5d: 3, mom_20d: 3, mom_60d: 3, mom_52w: 3 });
              }}
                className="px-2 py-0.5 rounded text-[9px] text-zinc-500 hover:text-zinc-900 bg-zinc-100">Reset Shapes</button>
            </div>
          </div>
          <div className="flex justify-around flex-wrap gap-2">
            <InteractiveSnowflake
              title="Quality"
              dims={SF_QUALITY_DIMS}
              values={sfQuality}
              onChange={(key, val) => setSfQuality(prev => ({ ...prev, [key]: val }))}
              enabled={sfQualityEnabled}
              onToggle={() => setSfQualityEnabled(p => !p)}
            />
            <InteractiveSnowflake
              title="Fundamentals"
              dims={SF_FUNDAMENTAL_DIMS}
              values={sfFund}
              onChange={(key, val) => setSfFund(prev => ({ ...prev, [key]: val }))}
              enabled={sfFundEnabled}
              onToggle={() => setSfFundEnabled(p => !p)}
            />
            <InteractiveSnowflake
              title="Technical"
              dims={SF_TECHNICAL_DIMS}
              values={sfTech}
              onChange={(key, val) => setSfTech(prev => ({ ...prev, [key]: val }))}
              enabled={sfTechEnabled}
              onToggle={() => setSfTechEnabled(p => !p)}
            />
            <InteractiveSnowflake
              title="Momentum"
              dims={SF_MOMENTUM_DIMS}
              values={sfMom}
              onChange={(key, val) => setSfMom(prev => ({ ...prev, [key]: val }))}
              enabled={sfMomEnabled}
              onToggle={() => setSfMomEnabled(p => !p)}
            />
          </div>
          {anySfActive && (
            <div className="text-center mt-2 text-[9px] text-indigo-600">
              Snowflake filters active — showing stocks that meet all minimum thresholds
            </div>
          )}
        </div>
      )}

      {/* ─── Status bar ─── */}
      {results && (
        <div className="flex items-center gap-2 text-[10px] text-zinc-600">
          <span className="text-zinc-500 font-medium">{listName}</span>
          <span>·</span><span>{filteredResults.length} of {results.length} stocks</span>
          {activeFilterCount > 0 && <>
            <span>·</span><span className="text-indigo-600">{activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}</span>
            <button onClick={resetFilters} className="text-zinc-500 hover:text-zinc-900 underline">clear</button>
          </>}
        </div>
      )}

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 text-sm">{error}</div>}
      {loading && <div className="flex items-center justify-center h-48 text-zinc-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Scanning stocks...</div>}
      {!loading && !results && <div className="flex items-center justify-center h-48 text-zinc-600 text-sm">Select a market or sector above to scan</div>}

      {/* ─── Table + Detail ─── */}
      {!loading && results && (
        <div className={`grid gap-4 ${selectedStock ? 'grid-cols-1 xl:grid-cols-[1fr_420px]' : 'grid-cols-1'}`}>
          <div className="bg-white shadow-sm ring-1 ring-zinc-200/70 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-zinc-100 z-10">
                  <tr className="text-zinc-500 border-b border-zinc-200/80">
                    {visCols.map(colKey => {
                      const col = COLUMNS[colKey];
                      if (colKey === 'signals') {
                        return <th key={colKey} className="py-2.5 px-1 font-medium text-center" colSpan={1}>
                          <span className="text-[9px]">{ALL_STRATEGIES.map(s => STRATEGY_LABELS[s]).join(' ')}</span>
                        </th>;
                      }
                      return (
                        <th key={colKey}
                          className={`py-2.5 px-2 font-medium whitespace-nowrap ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.sortable ? 'cursor-pointer hover:text-zinc-600' : ''}`}
                          style={col.minW ? { minWidth: col.minW } : undefined}
                          onClick={() => col.sortable && handleSort(colKey)}>
                          {col.label}
                          {sortKey === colKey && <ArrowUpDown className="inline w-2.5 h-2.5 ml-0.5" />}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map(r => (
                    <tr key={r.symbol} onClick={() => handleStockClick(r.symbol)}
                      className={`border-b border-zinc-100 cursor-pointer transition-colors ${selectedStock === r.symbol ? 'bg-indigo-500/10' : 'hover:bg-zinc-50'}`}>
                      {visCols.map(colKey => {
                        const col = COLUMNS[colKey];
                        return (
                          <td key={colKey} className={`py-1.5 px-2 text-[10px] ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                            {renderCell(r, colKey)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredResults.length === 0 && <div className="text-center py-8 text-zinc-600 text-xs">No stocks match your filters</div>}
            </div>
          </div>

          {selectedStock && (
            <div className="bg-white shadow-sm ring-1 ring-zinc-200/70 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200/80">
                <span className="text-sm font-semibold text-zinc-900">{selectedStock}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openResearch(selectedStock)}
                    className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100"
                  >
                    <ExternalLink className="h-3 w-3" /> Full Research
                  </button>
                  <button onClick={() => { setSelectedStock(null); setStockDetail(null); }} className="text-zinc-500 hover:text-zinc-900"><X className="w-4 h-4" /></button>
                </div>
              </div>
              {detailLoading ? <div className="flex items-center justify-center h-48 text-zinc-500"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...</div>
                : stockDetail ? <StockDetail data={stockDetail} />
                : <div className="p-4 text-zinc-500 text-sm">Failed to load</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

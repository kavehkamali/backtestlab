import { useState, useEffect, useMemo } from 'react';
import { Search, Loader2, X, ChevronDown, ChevronRight, ArrowUpDown, SlidersHorizontal, Columns3 } from 'lucide-react';
import { runScreener, fetchScreenerLists, fetchStockDetail } from '../api';
import StockDetail from './StockDetail';
import { MiniSnowflake } from './SnowflakeChart';

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
  // Snowflake
  snowflake: { label: 'Snowflake', group: 'snowflake', default: true, custom: 'snowflake', align: 'center' },
  sf_total: { label: 'SF Score', group: 'snowflake', default: false, sortable: true, align: 'center' },
  sf_value: { label: 'SF Value', group: 'snowflake', default: false, sortable: true, align: 'center' },
  sf_future: { label: 'SF Future', group: 'snowflake', default: false, sortable: true, align: 'center' },
  sf_past: { label: 'SF Past', group: 'snowflake', default: false, sortable: true, align: 'center' },
  sf_health: { label: 'SF Health', group: 'snowflake', default: false, sortable: true, align: 'center' },
  sf_dividend: { label: 'SF Dividend', group: 'snowflake', default: false, sortable: true, align: 'center' },
  // Signals (always at end)
  signals: { label: 'Signals', group: 'signals', default: true, alwaysOn: true },
  buy_count: { label: 'Score', group: 'signals', default: true, sortable: true, alwaysOn: true, custom: 'score' },
};

const COL_GROUPS = {
  core: 'Core', performance: 'Performance', technical: 'Technical',
  fundamental: 'Fundamentals', ownership: 'Ownership', snowflake: 'Snowflake', info: 'Info',
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
  sf_total_min: 0, sf_total_max: 6,
  sf_value_min: 0, sf_value_max: 6,
  sf_future_min: 0, sf_future_max: 6,
  sf_past_min: 0, sf_past_max: 6,
  sf_health_min: 0, sf_health_max: 6,
  sf_dividend_min: 0, sf_dividend_max: 6,
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
      <div className="w-12 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-[10px] font-mono ${value >= 70 ? 'text-red-400' : value <= 30 ? 'text-emerald-400' : 'text-gray-400'}`}>{value}</span>
    </div>
  );
}

function ScoreBar({ count, total }) {
  const pct = (count / total) * 100;
  const color = pct >= 66 ? 'bg-emerald-400' : pct >= 33 ? 'bg-yellow-400' : 'bg-red-400';
  const tc = pct >= 66 ? 'text-emerald-300' : pct >= 33 ? 'text-yellow-300' : 'text-gray-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-bold ${tc}`}>{count}/{total}</span>
    </div>
  );
}

function PctCell({ value }) {
  if (value == null) return <span className="text-gray-700">—</span>;
  const c = value > 0 ? 'text-emerald-400' : value < 0 ? 'text-red-400' : 'text-gray-500';
  return <span className={`${c} font-mono`}>{value > 0 ? '+' : ''}{value}%</span>;
}

function RangeRow({ label, value_min, value_max, step = 1, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-500 w-20 shrink-0">{label}</span>
      <input type="number" step={step} value={value_min} onChange={e => onChange('min', parseFloat(e.target.value) || 0)}
        className="w-16 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white text-center focus:outline-none focus:border-indigo-500/50" />
      <span className="text-gray-600 text-[10px]">to</span>
      <input type="number" step={step} value={value_max} onChange={e => onChange('max', parseFloat(e.target.value) || 0)}
        className="w-16 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white text-center focus:outline-none focus:border-indigo-500/50" />
    </div>
  );
}

function ToggleRow({ label, value, onChange, options }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-500 w-20 shrink-0">{label}</span>
      <div className="flex gap-0.5">
        {options.map(o => (
          <button key={o.value} onClick={() => onChange(o.value)}
            className={`px-2 py-0.5 rounded text-[9px] font-medium ${value === o.value ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/5 text-gray-600 hover:text-gray-400'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main ───
export default function ScreenerPanel() {
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

  useEffect(() => {
    fetchScreenerLists().then(d => setLists(d.lists)).catch(() => {});
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
      // Snowflake filters
      const sf = r.snowflake;
      if (sf) {
        if (sf.total < f.sf_total_min || sf.total > f.sf_total_max) return false;
        if (sf.value < f.sf_value_min || sf.value > f.sf_value_max) return false;
        if (sf.future < f.sf_future_min || sf.future > f.sf_future_max) return false;
        if (sf.past < f.sf_past_min || sf.past > f.sf_past_max) return false;
        if (sf.health < f.sf_health_min || sf.health > f.sf_health_max) return false;
        if (sf.dividend < f.sf_dividend_min || sf.dividend > f.sf_dividend_max) return false;
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
  }, [results, searchTerm, filters, sortKey, sortAsc]);

  const marketLists = lists.filter(l => l.group === 'Markets');
  const sectorLists = lists.filter(l => l.group === 'Sectors');
  const yesNoAny = [{ value: 'any', label: 'Any' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
  const trendOpts = [{ value: 'any', label: 'Any' }, { value: 'rising', label: 'Rising' }, { value: 'falling', label: 'Falling' }];

  // Visible column keys in order
  const visCols = Object.keys(COLUMNS).filter(k => visibleCols[k]);

  // Render a cell
  const renderCell = (r, colKey) => {
    const col = COLUMNS[colKey];
    if (colKey === 'symbol') return <span className="font-semibold text-white">{r.symbol}</span>;
    if (colKey === 'sparkline') return <Sparkline data={r.sparkline} />;
    if (col.custom === 'rsi') return <RsiBar value={r.rsi} />;
    if (col.custom === 'score') return <ScoreBar count={r.buy_count} total={r.total_strategies} />;
    if (col.custom === 'snowflake') return <MiniSnowflake data={r.snowflake} />;
    if (colKey === 'sf_total') return <span className="text-white font-bold text-[10px]">{r.snowflake?.total ?? '—'}</span>;
    if (colKey.startsWith('sf_')) {
      const sfKey = colKey.replace('sf_', '');
      const val = r.snowflake?.[sfKey];
      const color = val >= 4 ? 'text-emerald-400' : val >= 2 ? 'text-yellow-400' : 'text-red-400';
      return <span className={`${color} text-[10px] font-mono`}>{val ?? '—'}</span>;
    }
    if (colKey === 'signals') return (
      <div className="flex gap-0.5 justify-center">
        {ALL_STRATEGIES.map(s => <SignalDot key={s} signal={r.signals[s] || 0} />)}
      </div>
    );
    if (colKey === 'vol_ratio') {
      return <span className={`text-[10px] font-mono ${r.vol_ratio >= 1.5 ? 'text-yellow-400' : 'text-gray-500'}`}>{r.vol_ratio}x</span>;
    }
    if (col.pct) return <PctCell value={r[colKey]} />;
    if (col.fmt) {
      const val = r[colKey];
      return <span className="text-gray-300">{col.fmt(val)}</span>;
    }
    return <span className="text-gray-400">{r[colKey] ?? '—'}</span>;
  };

  return (
    <div className="space-y-3">
      {/* ─── Top bar ─── */}
      <div className="flex flex-wrap items-center gap-2">
        {marketLists.map(l => (
          <button key={l.id} onClick={() => handleScan(l.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeList === l.id && results ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'bg-white/[0.03] text-gray-400 border border-white/5 hover:text-white hover:border-white/10'
            }`}>
            {l.name} <span className="ml-1 text-gray-600">{l.count}</span>
          </button>
        ))}
        <div className="w-px h-6 bg-white/10" />
        <div className="relative group">
          <button className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            activeList.startsWith('sector_') && results ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
              : 'bg-white/[0.03] text-gray-400 border-white/5 hover:text-white hover:border-white/10'
          }`}>
            Sectors <ChevronDown className="w-3 h-3" />
          </button>
          <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl py-1 min-w-[180px]">
            {sectorLists.map(l => (
              <button key={l.id} onClick={() => handleScan(l.id)}
                className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-white hover:bg-white/5 flex justify-between">
                <span>{l.name}</span><span className="text-gray-600">{l.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        {/* Columns toggle */}
        <button onClick={() => { setColumnsOpen(!columnsOpen); setFiltersOpen(false); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            columnsOpen ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
              : 'bg-white/[0.03] text-gray-400 border border-white/5 hover:text-white hover:border-white/10'
          }`}>
          <Columns3 className="w-3 h-3" /> Columns
        </button>

        {/* Filters toggle */}
        <button onClick={() => { setFiltersOpen(!filtersOpen); setColumnsOpen(false); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            filtersOpen || activeFilterCount > 0 ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
              : 'bg-white/[0.03] text-gray-400 border border-white/5 hover:text-white hover:border-white/10'
          }`}>
          <SlidersHorizontal className="w-3 h-3" /> Filters
          {activeFilterCount > 0 && <span className="bg-indigo-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">{activeFilterCount}</span>}
        </button>

        {results && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search ticker or name..."
              className="bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-white text-xs w-36 focus:outline-none focus:border-indigo-500/50 focus:w-52 transition-all" />
          </div>
        )}
      </div>

      {/* ─── Columns Panel ─── */}
      {columnsOpen && (
        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Object.entries(COL_GROUPS).map(([groupKey, groupLabel]) => (
              <div key={groupKey}>
                <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-2 font-semibold">{groupLabel}</div>
                <div className="space-y-1">
                  {Object.entries(COLUMNS).filter(([, v]) => v.group === groupKey).map(([colKey, col]) => (
                    <label key={colKey} className={`flex items-center gap-1.5 cursor-pointer ${col.alwaysOn ? 'opacity-50' : ''}`}>
                      <input type="checkbox" checked={visibleCols[colKey]} onChange={() => toggleCol(colKey)}
                        disabled={col.alwaysOn} className="accent-indigo-500 w-3 h-3" />
                      <span className={`text-[10px] ${visibleCols[colKey] ? 'text-gray-200' : 'text-gray-600'}`}>{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3 pt-3 border-t border-white/5">
            <button onClick={() => {
              const all = {};
              Object.keys(COLUMNS).forEach(k => { all[k] = true; });
              setVisibleCols(all);
            }} className="px-2 py-1 rounded text-[10px] bg-white/5 text-gray-400 hover:text-white">Show All</button>
            <button onClick={() => {
              const def = {};
              Object.entries(COLUMNS).forEach(([k, v]) => { def[k] = v.default; });
              setVisibleCols(def);
            }} className="px-2 py-1 rounded text-[10px] bg-white/5 text-gray-400 hover:text-white">Reset Default</button>
          </div>
        </div>
      )}

      {/* ─── Filters Panel ─── */}
      {filtersOpen && (
        <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-x-6 gap-y-2 p-4">
            <div>
              <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-2 font-semibold">Performance</div>
              <div className="space-y-1.5">
                <RangeRow label="1D Change %" value_min={filters.change_1d_min} value_max={filters.change_1d_max} onChange={(s, v) => updateFilter(s === 'min' ? 'change_1d_min' : 'change_1d_max', v)} />
                <RangeRow label="5D Change %" value_min={filters.change_5d_min} value_max={filters.change_5d_max} onChange={(s, v) => updateFilter(s === 'min' ? 'change_5d_min' : 'change_5d_max', v)} />
                <RangeRow label="1M Change %" value_min={filters.change_20d_min} value_max={filters.change_20d_max} onChange={(s, v) => updateFilter(s === 'min' ? 'change_20d_min' : 'change_20d_max', v)} />
                <RangeRow label="3M Change %" value_min={filters.change_60d_min} value_max={filters.change_60d_max} onChange={(s, v) => updateFilter(s === 'min' ? 'change_60d_min' : 'change_60d_max', v)} />
                <RangeRow label="From 52W Hi" value_min={filters.pct_from_52w_high_min} value_max={filters.pct_from_52w_high_max} onChange={(s, v) => updateFilter(s === 'min' ? 'pct_from_52w_high_min' : 'pct_from_52w_high_max', v)} />
              </div>
            </div>
            <div>
              <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-2 font-semibold">Technical</div>
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
              <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-2 font-semibold">Fundamentals</div>
              <div className="space-y-1.5">
                <RangeRow label="Mkt Cap ($B)" step={0.1} value_min={filters.market_cap_min} value_max={filters.market_cap_max} onChange={(s, v) => updateFilter(s === 'min' ? 'market_cap_min' : 'market_cap_max', v)} />
                <RangeRow label="P/E Ratio" step={0.1} value_min={filters.pe_min} value_max={filters.pe_max} onChange={(s, v) => updateFilter(s === 'min' ? 'pe_min' : 'pe_max', v)} />
                <RangeRow label="Div Yield %" step={0.1} value_min={filters.dividend_yield_min} value_max={filters.dividend_yield_max} onChange={(s, v) => updateFilter(s === 'min' ? 'dividend_yield_min' : 'dividend_yield_max', v)} />
                <RangeRow label="Beta" step={0.1} value_min={filters.beta_min} value_max={filters.beta_max} onChange={(s, v) => updateFilter(s === 'min' ? 'beta_min' : 'beta_max', v)} />
                <RangeRow label="Profit Mrg %" value_min={filters.profit_margin_min} value_max={filters.profit_margin_max} onChange={(s, v) => updateFilter(s === 'min' ? 'profit_margin_min' : 'profit_margin_max', v)} />
              </div>
            </div>
            <div>
              <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-2 font-semibold">Ownership & Signals</div>
              <div className="space-y-1.5">
                <RangeRow label="Short Float %" step={0.1} value_min={filters.short_pct_min} value_max={filters.short_pct_max} onChange={(s, v) => updateFilter(s === 'min' ? 'short_pct_min' : 'short_pct_max', v)} />
                <RangeRow label="Insider Own %" step={0.1} value_min={filters.insider_pct_min} value_max={filters.insider_pct_max} onChange={(s, v) => updateFilter(s === 'min' ? 'insider_pct_min' : 'insider_pct_max', v)} />
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] text-gray-500 w-20 shrink-0">Min Signals</span>
                  <div className="flex gap-0.5">
                    {[0,1,2,3,4,5,6,7].map(n => (
                      <button key={n} onClick={() => updateFilter('min_buy_signals', n)}
                        className={`w-6 h-6 rounded text-[10px] font-medium ${filters.min_buy_signals === n ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/5 text-gray-600 hover:text-gray-400'}`}>{n}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-white/5">
                <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-2 font-semibold">Quick Presets</div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setFilters({ ...DEFAULT_FILTERS, rsi_max: 30 })} className="px-2 py-1 rounded text-[10px] bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">Oversold</button>
                  <button onClick={() => setFilters({ ...DEFAULT_FILTERS, rsi_min: 70 })} className="px-2 py-1 rounded text-[10px] bg-red-500/10 text-red-400 hover:bg-red-500/20">Overbought</button>
                  <button onClick={() => setFilters({ ...DEFAULT_FILTERS, above_sma20: 'yes', above_sma50: 'yes', above_sma200: 'yes', min_buy_signals: 3 })} className="px-2 py-1 rounded text-[10px] bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20">Bullish</button>
                  <button onClick={() => setFilters({ ...DEFAULT_FILTERS, above_sma200: 'no', pct_from_52w_high_min: -50, pct_from_52w_high_max: -20 })} className="px-2 py-1 rounded text-[10px] bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20">Deep Value</button>
                  <button onClick={() => setFilters({ ...DEFAULT_FILTERS, market_cap_min: 0, market_cap_max: 2 })} className="px-2 py-1 rounded text-[10px] bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20">Small Cap</button>
                  <button onClick={() => setFilters({ ...DEFAULT_FILTERS, dividend_yield_min: 3 })} className="px-2 py-1 rounded text-[10px] bg-purple-500/10 text-purple-400 hover:bg-purple-500/20">High Dividend</button>
                  <button onClick={() => setFilters({ ...DEFAULT_FILTERS, short_pct_min: 15 })} className="px-2 py-1 rounded text-[10px] bg-orange-500/10 text-orange-400 hover:bg-orange-500/20">High Short</button>
                  <button onClick={() => setFilters({ ...DEFAULT_FILTERS, sf_total_min: 4 })} className="px-2 py-1 rounded text-[10px] bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20">Top Snowflake</button>
                  <button onClick={resetFilters} className="px-2 py-1 rounded text-[10px] bg-white/5 text-gray-400 hover:text-white">Reset All</button>
                </div>
              </div>
            </div>

            {/* Snowflake Filters */}
            <div>
              <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-2 font-semibold">Snowflake (0-6)</div>
              <div className="space-y-1.5">
                <RangeRow label="Total Score" step={0.5} value_min={filters.sf_total_min} value_max={filters.sf_total_max} onChange={(s, v) => updateFilter(s === 'min' ? 'sf_total_min' : 'sf_total_max', v)} />
                <RangeRow label="Value" step={0.5} value_min={filters.sf_value_min} value_max={filters.sf_value_max} onChange={(s, v) => updateFilter(s === 'min' ? 'sf_value_min' : 'sf_value_max', v)} />
                <RangeRow label="Future" step={0.5} value_min={filters.sf_future_min} value_max={filters.sf_future_max} onChange={(s, v) => updateFilter(s === 'min' ? 'sf_future_min' : 'sf_future_max', v)} />
                <RangeRow label="Past" step={0.5} value_min={filters.sf_past_min} value_max={filters.sf_past_max} onChange={(s, v) => updateFilter(s === 'min' ? 'sf_past_min' : 'sf_past_max', v)} />
                <RangeRow label="Health" step={0.5} value_min={filters.sf_health_min} value_max={filters.sf_health_max} onChange={(s, v) => updateFilter(s === 'min' ? 'sf_health_min' : 'sf_health_max', v)} />
                <RangeRow label="Dividend" step={0.5} value_min={filters.sf_dividend_min} value_max={filters.sf_dividend_max} onChange={(s, v) => updateFilter(s === 'min' ? 'sf_dividend_min' : 'sf_dividend_max', v)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Status bar ─── */}
      {results && (
        <div className="flex items-center gap-2 text-[10px] text-gray-600">
          <span className="text-gray-400 font-medium">{listName}</span>
          <span>·</span><span>{filteredResults.length} of {results.length} stocks</span>
          {activeFilterCount > 0 && <>
            <span>·</span><span className="text-indigo-400">{activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}</span>
            <button onClick={resetFilters} className="text-gray-500 hover:text-white underline">clear</button>
          </>}
        </div>
      )}

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}
      {loading && <div className="flex items-center justify-center h-48 text-gray-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Scanning stocks...</div>}
      {!loading && !results && <div className="flex items-center justify-center h-48 text-gray-600 text-sm">Select a market or sector above to scan</div>}

      {/* ─── Table + Detail ─── */}
      {!loading && results && (
        <div className={`grid gap-4 ${selectedStock ? 'grid-cols-1 xl:grid-cols-[1fr_420px]' : 'grid-cols-1'}`}>
          <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-[#0e0e16] z-10">
                  <tr className="text-gray-500 border-b border-white/5">
                    {visCols.map(colKey => {
                      const col = COLUMNS[colKey];
                      if (colKey === 'signals') {
                        return <th key={colKey} className="py-2.5 px-1 font-medium text-center" colSpan={1}>
                          <span className="text-[9px]">{ALL_STRATEGIES.map(s => STRATEGY_LABELS[s]).join(' ')}</span>
                        </th>;
                      }
                      return (
                        <th key={colKey}
                          className={`py-2.5 px-2 font-medium whitespace-nowrap ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.sortable ? 'cursor-pointer hover:text-gray-300' : ''}`}
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
                      className={`border-b border-white/[0.02] cursor-pointer transition-colors ${selectedStock === r.symbol ? 'bg-indigo-500/10' : 'hover:bg-white/[0.02]'}`}>
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
              {filteredResults.length === 0 && <div className="text-center py-8 text-gray-600 text-xs">No stocks match your filters</div>}
            </div>
          </div>

          {selectedStock && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <span className="text-sm font-semibold text-white">{selectedStock}</span>
                <button onClick={() => { setSelectedStock(null); setStockDetail(null); }} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              {detailLoading ? <div className="flex items-center justify-center h-48 text-gray-500"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...</div>
                : stockDetail ? <StockDetail data={stockDetail} />
                : <div className="p-4 text-gray-500 text-sm">Failed to load</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

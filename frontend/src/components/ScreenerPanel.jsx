import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Loader2, X, ChevronDown, ChevronLeft, ChevronRight, ArrowUpDown, SlidersHorizontal, Columns3, ExternalLink } from 'lucide-react';
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
/** Labeled segmented control for the quick-filter bar. */
function QuickSeg({ label, value, options, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="eq-label !text-[9px] whitespace-nowrap">{label}</span>
      <div className="eq-seg">
        {options.map(([v, l]) => (
          <button key={v} type="button" onClick={() => onChange(v)} className="eq-seg-item !font-sans whitespace-nowrap" data-on={value === v}>{l}</button>
        ))}
      </div>
    </div>
  );
}

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
      <div className="w-12 h-1.5 bg-[var(--eq-card2)] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-[10px] font-mono ${value >= 70 ? 'text-[var(--eq-loss)]' : value <= 30 ? 'text-[var(--eq-gain)]' : 'text-[var(--eq-text3)]'}`}>{value}</span>
    </div>
  );
}

function ScoreBar({ count, total }) {
  const pct = (count / total) * 100;
  const color = pct >= 66 ? 'bg-emerald-400' : pct >= 33 ? 'bg-[var(--eq-warn)]' : 'bg-red-400';
  const tc = pct >= 66 ? 'text-[var(--eq-gain)]' : pct >= 33 ? 'text-[var(--eq-warn)]' : 'text-[var(--eq-text3)]';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 h-1.5 bg-[var(--eq-card2)] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-bold ${tc}`}>{count}/{total}</span>
    </div>
  );
}

function PctCell({ value }) {
  if (value == null) return <span className="text-[var(--eq-text2)]">—</span>;
  const c = value > 0 ? 'text-[var(--eq-gain)]' : value < 0 ? 'text-[var(--eq-loss)]' : 'text-[var(--eq-text3)]';
  return <span className={`${c} font-mono`}>{value > 0 ? '+' : ''}{value}%</span>;
}

/** Dual-thumb range slider. `defMin/defMax` are the filter's "off" values;
 *  a thumb parked at the domain edge writes the off value (∞ semantics). */
function DualRange({ label, min, max, step = 1, valueMin, valueMax, defMin, defMax, unit = '', fmt, onChange }) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lo = clamp(valueMin ?? min, min, max);
  const hi = valueMax >= defMax && defMax > max ? max : clamp(valueMax ?? max, min, max);
  const pct = (v) => ((v - min) / (max - min)) * 100;
  const active = (valueMin ?? defMin) !== defMin || (valueMax ?? defMax) !== defMax;
  const show = (v, isHi) => {
    if (isHi && v >= max && defMax > max) return '∞';
    if (!isHi && v <= min && defMin < min) return '−∞';
    return (fmt ? fmt(v) : v) + unit;
  };
  const write = (side, v) => {
    if (side === 'min') onChange('min', v <= min && defMin < min ? defMin : v);
    else onChange('max', v >= max && defMax > max ? defMax : v);
  };
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <span className="truncate text-[10.5px] text-[var(--eq-text2)]">{label}</span>
        <span className={`eq-num shrink-0 text-[10px] ${active ? 'font-semibold text-[var(--eq-accent)]' : 'text-[var(--eq-text3)]'}`}>
          {show(lo, false)} – {show(hi, true)}
        </span>
      </div>
      <div className="eq-range">
        <div className="eq-range-track" />
        <div className="eq-range-fill" style={{ left: `${pct(lo)}%`, width: `${Math.max(0, pct(hi) - pct(lo))}%`, opacity: active ? 0.8 : 0.25 }} />
        <input type="range" min={min} max={max} step={step} value={lo}
          onChange={(e) => write('min', Math.min(parseFloat(e.target.value), hi))} />
        <input type="range" min={min} max={max} step={step} value={hi}
          onChange={(e) => write('max', Math.max(parseFloat(e.target.value), lo))} />
      </div>
    </div>
  );
}

function RangeRow({ label, value_min, value_max, step = 1, onChange }) {
  const inputCls = 'eq-num w-14 shrink-0 rounded bg-[var(--eq-card2)] px-1 py-0.5 text-center text-[10px] text-[var(--eq-text)] ring-1 ring-[var(--eq-border)] focus:outline-none focus:ring-[var(--eq-accent-ring)]';
  return (
    <div className="flex items-center gap-1.5">
      <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--eq-text3)]" title={label}>{label}</span>
      <input type="text" inputMode="decimal" value={value_min} onChange={e => onChange('min', parseFloat(e.target.value) || 0)} className={inputCls} />
      <span className="shrink-0 text-[10px] text-[var(--eq-text3)]">–</span>
      <input type="text" inputMode="decimal" value={value_max} onChange={e => onChange('max', parseFloat(e.target.value) || 0)} className={inputCls} />
    </div>
  );
}

function ToggleRow({ label, value, onChange, options }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--eq-text3)]" title={label}>{label}</span>
      <div className="flex shrink-0 gap-0.5">
        {options.map(o => (
          <button key={o.value} onClick={() => onChange(o.value)}
            className={`px-2 py-0.5 rounded text-[9px] font-medium ${value === o.value ? 'bg-[var(--eq-accent-soft)] text-[var(--eq-accent)]' : 'bg-[var(--eq-card2)] text-[var(--eq-text2)] hover:text-[var(--eq-text3)]'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function deriveScreenerAssistantIntent(message) {
  const text = String(message || '').toLowerCase();
  const scoreCut = (val, labels) => labels[Math.max(0, Math.min(labels.length - 1, Math.round(Number(val) || 0)))];
  const filters = {};
  const chips = [];
  const snowflake = {
    enable: { quality: false, fund: false, tech: false, mom: false },
    controllers: [],
    quality: { value: 3, future: 3, past: 3, health: 3, dividend: 3 },
    fund: { valuation: 3, growth: 3, profitability: 3, balance: 3, income: 3 },
    tech: { rsi_score: 3, macd_score: 3, volume_score: 3, trend_score: 3, bb_score: 3 },
    mom: { mom_1d: 3, mom_5d: 3, mom_20d: 3, mom_60d: 3, mom_52w: 3 },
    custom: null,
  };
  let listId = 'sp500';
  let listLabel = 'S&P 500';
  let sortKey = 'buy_count';
  let sortAsc = false;

  if (/(small|low cap|micro)/.test(text)) {
    filters.market_cap_min = 0;
    filters.market_cap_max = /micro/.test(text) ? 0.35 : 2;
    listId = 'smallcap';
    listLabel = 'Small Caps';
    chips.push(/micro/.test(text) ? 'Micro/small cap' : 'Small cap');
  } else if (/(large|mega|blue chip|quality)/.test(text)) {
    filters.market_cap_min = 20;
    listId = 'sp500';
    chips.push('Large cap');
  }

  if (/(profitable|profit|margin|quality)/.test(text)) {
    filters.profit_margin_min = 8;
    sortKey = 'profit_margin';
    chips.push('Profitable');
    snowflake.enable.quality = true;
    snowflake.enable.fund = true;
    snowflake.quality = { value: 3, future: 4, past: 4, health: 4, dividend: 2 };
    snowflake.fund = { valuation: 2.5, growth: 3.5, profitability: 4, balance: 3.5, income: 2 };
  }
  if (/(cheap|value|reasonable valuation|low p\/?e|undervalued)/.test(text)) {
    filters.pe_min = 1;
    filters.pe_max = 25;
    sortKey = 'pe_ratio';
    sortAsc = true;
    chips.push('Value');
    snowflake.enable.fund = true;
    snowflake.fund = { ...snowflake.fund, valuation: 4.5, profitability: Math.max(snowflake.fund.profitability, 3), balance: Math.max(snowflake.fund.balance, 3) };
  }
  if (/(dividend|income|yield)/.test(text)) {
    filters.dividend_yield_min = 2;
    sortKey = 'dividend_yield';
    chips.push('Dividend');
    snowflake.enable.quality = true;
    snowflake.enable.fund = true;
    snowflake.quality = { ...snowflake.quality, dividend: 4, health: Math.max(snowflake.quality.health, 3) };
    snowflake.fund = { ...snowflake.fund, income: 4, balance: Math.max(snowflake.fund.balance, 3) };
  }
  if (/(low beta|defensive|lower risk|stable)/.test(text)) {
    filters.beta_min = 0;
    filters.beta_max = 1.2;
    chips.push('Lower beta');
    snowflake.enable.quality = true;
    snowflake.enable.fund = true;
    snowflake.quality = { ...snowflake.quality, health: 4, value: Math.max(snowflake.quality.value, 3) };
    snowflake.fund = { ...snowflake.fund, balance: 4, profitability: Math.max(snowflake.fund.profitability, 3) };
  }
  if (/(oversold|dip|pullback)/.test(text)) {
    filters.rsi_min = 0;
    filters.rsi_max = 40;
    filters.pct_from_52w_high_min = -45;
    filters.pct_from_52w_high_max = -5;
    sortKey = 'rsi';
    sortAsc = true;
    chips.push('Oversold');
    snowflake.enable.tech = true;
    snowflake.tech = { rsi_score: 1.5, macd_score: 2, volume_score: 2, trend_score: 1.5, bb_score: 1.5 };
  }
  if (/(momentum|breakout|trend|strength|strong)/.test(text)) {
    filters.change_20d_min = 2;
    filters.above_sma20 = 'yes';
    filters.above_sma50 = 'yes';
    filters.min_buy_signals = Math.max(filters.min_buy_signals || 0, 3);
    sortKey = 'buy_count';
    sortAsc = false;
    chips.push('Momentum');
    snowflake.enable.tech = true;
    snowflake.enable.mom = true;
    snowflake.tech = { rsi_score: 3.5, macd_score: 4, volume_score: 3.5, trend_score: 4.5, bb_score: 3 };
    snowflake.mom = { mom_1d: 3, mom_5d: 3.5, mom_20d: 4, mom_60d: 4, mom_52w: 3.5 };
  }
  if (/(short squeeze|high short|short interest)/.test(text)) {
    filters.short_pct_min = 12;
    sortKey = 'short_pct_float';
    chips.push('High short interest');
  }
  if (/(tech|software|semiconductor|ai\b)/.test(text)) {
    chips.push('Tech focus');
    listId = 'sector_technology';
    listLabel = 'Technology';
  }
  if (!snowflake.enable.quality && !snowflake.enable.fund && !snowflake.enable.tech && !snowflake.enable.mom) {
    snowflake.enable.fund = true;
    snowflake.enable.tech = true;
  }
  if (/remove\s+(quality|fundamental|fundamentals|technical|momentum|income|dividend|value)/.test(text)) {
    if (/quality/.test(text)) snowflake.enable.quality = false;
    if (/fundamental|fundamentals|value|income|dividend/.test(text)) snowflake.enable.fund = false;
    if (/technical/.test(text)) snowflake.enable.tech = false;
    if (/momentum/.test(text)) snowflake.enable.mom = false;
  }

  const customDims = [];
  const addCustomDim = (key, sourceKey, label, color, formatThreshold) => {
    if (customDims.some((d) => d.key === key)) return;
    customDims.push({ key, sourceKey, label, color, formatThreshold });
  };
  if (/custom|snowflake|screen|find|show|filter/.test(text)) {
    if (/cheap|value|valuation|undervalued|low p\/?e/.test(text)) addCustomDim('agent_valuation', 'valuation', 'Value', '#818cf8', v => `P/E <= ${scoreCut(v, ['50+', '50', '35', '25', '18', '12', '8'])}`);
    if (/growth|revenue|earnings|future/.test(text)) addCustomDim('agent_growth', 'growth', 'Growth', '#34d399', v => `Rev >= ${scoreCut(v, ['-10%', '0%', '5%', '10%', '20%', '35%', '50%'])}`);
    if (/profit|margin|profitable|quality/.test(text)) addCustomDim('agent_profit', 'profitability', 'Profit', '#fbbf24', v => `Mrg >= ${scoreCut(v, ['-5%', '0%', '5%', '10%', '20%', '35%', '50%'])}`);
    if (/debt|balance|safe|stable|defensive|risk/.test(text)) addCustomDim('agent_balance', 'balance', 'Balance', '#22d3ee', v => `D/E <= ${scoreCut(v, ['400+', '400', '250', '150', '80', '40', '20'])}`);
    if (/dividend|income|yield/.test(text)) addCustomDim('agent_income', 'income', 'Income', '#f472b6', v => `Div >= ${scoreCut(v, ['0%', '0.5%', '1%', '2%', '3%', '4%', '6%'])}`);
    if (/trend|breakout|above sma|strength|momentum/.test(text)) addCustomDim('agent_trend', 'trend_score', 'Trend', '#38bdf8', v => `${Math.round(Number(v) || 0)}/6`);
    if (/volume|liquidity|buzz/.test(text)) addCustomDim('agent_volume', 'volume_score', 'Volume', '#fb923c', v => `Vol >= ${scoreCut(v, ['0.3x', '0.6x', '0.8x', '1.0x', '1.5x', '2.0x', '3.0x'])}`);
    if (/rsi|oversold|overbought|dip/.test(text)) addCustomDim('agent_rsi', 'rsi_score', 'RSI', '#a78bfa', v => `RSI >= ${scoreCut(v, ['20', '30', '40', '50', '60', '70', '80'])}`);
    if (/1m|one month|short term|swing/.test(text)) addCustomDim('agent_mom20', 'mom_20d', '1M', '#facc15', v => `>= ${scoreCut(v, ['-10%', '-5%', '0%', '+3%', '+8%', '+15%', '+15%'])}`);
    if (/3m|three month|medium term|momentum/.test(text)) addCustomDim('agent_mom60', 'mom_60d', '3M', '#2dd4bf', v => `>= ${scoreCut(v, ['-10%', '-5%', '0%', '+3%', '+8%', '+15%', '+15%'])}`);
  }
  if (customDims.length < 3 && /snowflake|custom|screen|find|show|filter/.test(text)) {
    addCustomDim('agent_valuation', 'valuation', 'Value', '#818cf8', v => `P/E <= ${scoreCut(v, ['50+', '50', '35', '25', '18', '12', '8'])}`);
    addCustomDim('agent_profit', 'profitability', 'Profit', '#fbbf24', v => `Mrg >= ${scoreCut(v, ['-5%', '0%', '5%', '10%', '20%', '35%', '50%'])}`);
    addCustomDim('agent_trend', 'trend_score', 'Trend', '#38bdf8', v => `${Math.round(Number(v) || 0)}/6`);
    addCustomDim('agent_mom20', 'mom_20d', '1M', '#facc15', v => `>= ${scoreCut(v, ['-10%', '-5%', '0%', '+3%', '+8%', '+15%', '+15%'])}`);
  }
  if (customDims.length >= 3) {
    const values = Object.fromEntries(customDims.map((d) => [d.key, /oversold|dip/.test(text) && d.sourceKey === 'rsi_score' ? 1.5 : 3.5]));
    snowflake.custom = {
      title: chips.slice(0, 2).join(' + ') || 'Agent Screen',
      dims: customDims.slice(0, 5),
      values,
      enabled: true,
    };
  }
  snowflake.controllers = [
    ...(snowflake.enable.quality ? ['quality'] : []),
    ...(snowflake.enable.fund ? ['fund'] : []),
    ...(snowflake.enable.tech ? ['tech'] : []),
    ...(snowflake.enable.mom ? ['mom'] : []),
    ...(snowflake.custom ? ['agent'] : []),
  ];

  return {
    listId,
    listLabel,
    filters,
    sortKey,
    sortAsc,
    chips: chips.length ? chips : ['Assistant filter setup'],
    snowflake,
  };
}

// ─── Main ───
export default function ScreenerPanel({ onOpenResearch, agentIntent = null }) {
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
  const [assistantIntent, setAssistantIntent] = useState(null);
  const [assistantSymbols, setAssistantSymbols] = useState([]);
  const appliedAgentIntentRef = useRef('');

  // Panels
  const [filtersOpen, setFiltersOpen] = useState(true);
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
  const [sfAgent, setSfAgent] = useState(null);
  const [activeSnowflakeIds, setActiveSnowflakeIds] = useState(['quality', 'fund', 'tech', 'mom']);

  const anySfActive = sfQualityEnabled || sfFundEnabled || sfTechEnabled || sfMomEnabled || Boolean(sfAgent?.enabled);
  const validListIds = useMemo(() => new Set((lists || []).map((l) => l.id)), [lists]);

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
  const snowflakeScoreValue = (r, key) => {
    if (r.snowflake && Object.prototype.hasOwnProperty.call(r.snowflake, key)) return r.snowflake[key] ?? 3;
    const fs = computeFundScores(r);
    if (Object.prototype.hasOwnProperty.call(fs, key)) return fs[key] ?? 3;
    const ts = computeTechScores(r);
    if (Object.prototype.hasOwnProperty.call(ts, key)) return ts[key] ?? 3;
    const ms = computeMomScores(r);
    if (Object.prototype.hasOwnProperty.call(ms, key)) return ms[key] ?? 3;
    return 3;
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

  useEffect(() => {
    const intent = agentIntent || assistantIntent;
    if (!intent) return;
    const signature = JSON.stringify({
      listId: intent.listId,
      filters: intent.filters,
      sortKey: intent.sortKey,
      sortAsc: intent.sortAsc,
      snowflake: intent.snowflake,
    });
    if (appliedAgentIntentRef.current === signature) return;
    appliedAgentIntentRef.current = signature;

    setFilters({ ...DEFAULT_FILTERS, ...(intent.filters || {}) });
    if (intent.sortKey) setSortKey(intent.sortKey);
    setSortAsc(Boolean(intent.sortAsc));
    if (intent.snowflake) {
      const sf = intent.snowflake;
      setSfQualityEnabled(Boolean(sf.enable?.quality));
      setSfFundEnabled(Boolean(sf.enable?.fund));
      setSfTechEnabled(Boolean(sf.enable?.tech));
      setSfMomEnabled(Boolean(sf.enable?.mom));
      if (sf.quality) setSfQuality((prev) => ({ ...prev, ...sf.quality }));
      if (sf.fund) setSfFund((prev) => ({ ...prev, ...sf.fund }));
      if (sf.tech) setSfTech((prev) => ({ ...prev, ...sf.tech }));
      if (sf.mom) setSfMom((prev) => ({ ...prev, ...sf.mom }));
      setSfAgent(null);  // snowflake UI retired — assistant screens map to normal filters
      setActiveSnowflakeIds(sf.controllers?.length ? sf.controllers : ['fund', 'tech']);
    }
    setFiltersOpen(false);
    setColumnsOpen(false);
    const nextListId = intent.listId && (validListIds.size === 0 || validListIds.has(intent.listId))
      ? intent.listId
      : 'sp500';
    if (nextListId && nextListId !== activeList) {
      handleScan(nextListId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentIntent, assistantIntent, validListIds]);

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

  useEffect(() => {
    const onAssistantQuery = (e) => {
      const message = e.detail?.message;
      if (!message) return;
      setAssistantIntent(deriveScreenerAssistantIntent(message));
    };
    window.addEventListener('eq-screener-assistant-query', onAssistantQuery);
    return () => window.removeEventListener('eq-screener-assistant-query', onAssistantQuery);
  }, []);

  useEffect(() => {
    const onAssistantTickers = (e) => {
      const next = [...new Set((e.detail?.tickers || [])
        .map((s) => String(s || '').trim().toUpperCase())
        .filter(Boolean))]
        .slice(0, 12);
      if (next.length) setAssistantSymbols(next);
    };
    window.addEventListener('eq-screener-assistant-tickers', onAssistantTickers);
    return () => window.removeEventListener('eq-screener-assistant-tickers', onAssistantTickers);
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
      if (sfAgent?.enabled && sfAgent?.dims?.length) {
        for (const d of sfAgent.dims) {
          const sourceKey = d.sourceKey || d.key;
          if (snowflakeScoreValue(r, sourceKey) < (sfAgent.values?.[d.key] ?? 3)) return false;
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
  }, [results, searchTerm, filters, sortKey, sortAsc, sfQualityEnabled, sfFundEnabled, sfTechEnabled, sfMomEnabled, sfQuality, sfFund, sfTech, sfMom, sfAgent]);

  const marketLists = lists.filter(l => l.group === 'Markets');
  const sectorLists = lists.filter(l => l.group === 'Sectors');
  const yesNoAny = [{ value: 'any', label: 'Any' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
  const trendOpts = [{ value: 'any', label: 'Any' }, { value: 'rising', label: 'Rising' }, { value: 'falling', label: 'Falling' }];
  const appliedFilterChips = useMemo(() => {
    const chips = [];
    const addRange = (label, minKey, maxKey, suffix = '') => {
      if (filters[minKey] !== DEFAULT_FILTERS[minKey] || filters[maxKey] !== DEFAULT_FILTERS[maxKey]) {
        chips.push(`${label}: ${filters[minKey]}-${filters[maxKey]}${suffix}`);
      }
    };
    addRange('RSI', 'rsi_min', 'rsi_max');
    addRange('1D', 'change_1d_min', 'change_1d_max', '%');
    addRange('5D', 'change_5d_min', 'change_5d_max', '%');
    addRange('1M', 'change_20d_min', 'change_20d_max', '%');
    addRange('3M', 'change_60d_min', 'change_60d_max', '%');
    addRange('52W High', 'pct_from_52w_high_min', 'pct_from_52w_high_max', '%');
    addRange('Volume', 'vol_ratio_min', 'vol_ratio_max', 'x');
    addRange('Volatility', 'volatility_min', 'volatility_max', '%');
    addRange('Market cap', 'market_cap_min', 'market_cap_max', 'B');
    addRange('P/E', 'pe_min', 'pe_max');
    addRange('Dividend', 'dividend_yield_min', 'dividend_yield_max', '%');
    addRange('Beta', 'beta_min', 'beta_max');
    addRange('Short', 'short_pct_min', 'short_pct_max', '%');
    addRange('Insider', 'insider_pct_min', 'insider_pct_max', '%');
    addRange('Margin', 'profit_margin_min', 'profit_margin_max', '%');
    if (filters.min_buy_signals !== DEFAULT_FILTERS.min_buy_signals) chips.push(`Signals >= ${filters.min_buy_signals}`);
    if (filters.above_sma20 !== 'any') chips.push(`SMA20: ${filters.above_sma20}`);
    if (filters.above_sma50 !== 'any') chips.push(`SMA50: ${filters.above_sma50}`);
    if (filters.above_sma200 !== 'any') chips.push(`SMA200: ${filters.above_sma200}`);
    if (filters.macd_trend !== 'any') chips.push(`MACD: ${filters.macd_trend}`);
    if (sfQualityEnabled) chips.push('Snowflake: Quality');
    if (sfFundEnabled) chips.push('Snowflake: Fundamentals');
    if (sfTechEnabled) chips.push('Snowflake: Technical');
    if (sfMomEnabled) chips.push('Snowflake: Momentum');
    if (sfAgent?.enabled) chips.push(`Snowflake: ${sfAgent.title || 'Agent'}`);
    return chips;
  }, [filters, sfAgent, sfFundEnabled, sfMomEnabled, sfQualityEnabled, sfTechEnabled]);

  // Visible column keys in order
  const visCols = Object.keys(COLUMNS).filter(k => visibleCols[k]);
  const visibleAgentIntent = agentIntent || assistantIntent;
  const activeAssistantSymbolIndex = Math.max(0, assistantSymbols.indexOf(selectedStock));
  const openAssistantSymbolOffset = (delta) => {
    if (!assistantSymbols.length) return;
    const base = selectedStock && assistantSymbols.includes(selectedStock)
      ? assistantSymbols.indexOf(selectedStock)
      : activeAssistantSymbolIndex;
    const next = assistantSymbols[(base + delta + assistantSymbols.length) % assistantSymbols.length];
    if (next) handleStockClick(next);
  };
  const snowflakeControllers = [
    {
      id: 'quality',
      title: 'Quality',
      dims: SF_QUALITY_DIMS,
      values: sfQuality,
      enabled: sfQualityEnabled,
      onChange: (key, val) => setSfQuality(prev => ({ ...prev, [key]: val })),
      onToggle: () => setSfQualityEnabled(p => !p),
    },
    {
      id: 'fund',
      title: 'Fundamentals',
      dims: SF_FUNDAMENTAL_DIMS,
      values: sfFund,
      enabled: sfFundEnabled,
      onChange: (key, val) => setSfFund(prev => ({ ...prev, [key]: val })),
      onToggle: () => setSfFundEnabled(p => !p),
    },
    {
      id: 'tech',
      title: 'Technical',
      dims: SF_TECHNICAL_DIMS,
      values: sfTech,
      enabled: sfTechEnabled,
      onChange: (key, val) => setSfTech(prev => ({ ...prev, [key]: val })),
      onToggle: () => setSfTechEnabled(p => !p),
    },
    {
      id: 'mom',
      title: 'Momentum',
      dims: SF_MOMENTUM_DIMS,
      values: sfMom,
      enabled: sfMomEnabled,
      onChange: (key, val) => setSfMom(prev => ({ ...prev, [key]: val })),
      onToggle: () => setSfMomEnabled(p => !p),
    },
    ...(sfAgent ? [{
      id: 'agent',
      title: sfAgent.title || 'Agent Screen',
      dims: sfAgent.dims || [],
      values: sfAgent.values || {},
      enabled: Boolean(sfAgent.enabled),
      onChange: (key, val) => setSfAgent(prev => ({ ...prev, values: { ...(prev?.values || {}), [key]: val } })),
      onToggle: () => setSfAgent(prev => ({ ...prev, enabled: !prev?.enabled })),
    }] : []),
  ].filter((controller) => activeSnowflakeIds.includes(controller.id));

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
        className="inline-flex items-center gap-1 font-semibold text-[var(--eq-accent)] hover:text-[var(--eq-accent-strong)] hover:underline"
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
      return <span className={`text-[10px] font-mono ${r.vol_ratio >= 1.5 ? 'text-yellow-400' : 'text-[var(--eq-text3)]'}`}>{r.vol_ratio}x</span>;
    }
    if (col.pct) return <PctCell value={r[colKey]} />;
    if (col.fmt) {
      const val = r[colKey];
      return <span className="text-[var(--eq-text2)]">{col.fmt(val)}</span>;
    }
    return <span className="text-[var(--eq-text3)]">{r[colKey] ?? '—'}</span>;
  };

  return (
    <div className="space-y-3">
      {visibleAgentIntent?.chips?.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--eq-accent-soft)] px-3 py-2 text-xs text-[var(--eq-accent)] ring-1 ring-[var(--eq-accent-ring)]">
          <span className="font-semibold">Assistant screen</span>
          <span className="text-[var(--eq-accent)]">·</span>
          <span>{visibleAgentIntent.listLabel || 'Market list'}</span>
          {visibleAgentIntent.chips.slice(0, 6).map((chip) => (
            <span key={chip} className="rounded-full bg-[var(--eq-card)]/75 px-2 py-0.5 text-[11px] font-semibold text-[var(--eq-accent)] ring-1 ring-[var(--eq-accent-ring)]">
              {chip}
            </span>
          ))}
        </div>
      )}
      {assistantSymbols.length > 0 && (
        <div className="flex items-center gap-1 rounded-xl bg-[var(--eq-card)] px-2 py-1.5 ring-1 ring-[var(--eq-border)]">
          {assistantSymbols.length > 1 && (
            <button type="button" onClick={() => openAssistantSymbolOffset(-1)} className="shrink-0 p-1 text-[var(--eq-text3)] hover:text-[var(--eq-text)]" aria-label="Previous assistant ticker">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto no-scrollbar">
            {assistantSymbols.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleStockClick(s)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-all ${
                  selectedStock === s ? 'bg-[var(--eq-accent-soft)] text-[var(--eq-accent-strong)] ring-1 ring-[var(--eq-accent-ring)]' : 'bg-[var(--eq-card2)] text-[var(--eq-text2)] hover:text-[var(--eq-text)]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {assistantSymbols.length > 1 && (
            <button type="button" onClick={() => openAssistantSymbolOffset(1)} className="shrink-0 p-1 text-[var(--eq-text3)] hover:text-[var(--eq-text)]" aria-label="Next assistant ticker">
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      {appliedFilterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-[var(--eq-card)] px-3 py-2 text-[10px] ring-1 ring-[var(--eq-border)]">
          <span className="mr-1 font-semibold uppercase tracking-wider text-[var(--eq-text3)]">Applied</span>
          {appliedFilterChips.slice(0, 18).map((chip) => (
            <span key={chip} className="rounded-full bg-[var(--eq-card2)] px-2 py-1 font-medium text-[var(--eq-text2)] ring-1 ring-[var(--eq-border)]">
              {chip}
            </span>
          ))}
          {appliedFilterChips.length > 18 && (
            <span className="rounded-full bg-[var(--eq-card2)] px-2 py-1 font-medium text-[var(--eq-text3)]">
              +{appliedFilterChips.length - 18}
            </span>
          )}
          <button type="button" onClick={resetFilters} className="ml-auto text-[10px] font-semibold text-[var(--eq-text3)] hover:text-[var(--eq-text)]">
            Clear numeric
          </button>
        </div>
      )}
      {/* ─── Top bar ─── */}
      <div className="flex flex-wrap items-center gap-2">
        {marketLists.map(l => (
          <button key={l.id} onClick={() => handleScan(l.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeList === l.id && results ? 'bg-[var(--eq-accent-soft)] text-[var(--eq-accent)] border ring-[var(--eq-accent-ring)]'
                : 'bg-[var(--eq-card)] text-[var(--eq-text3)] ring-1 ring-[var(--eq-border)] hover:text-[var(--eq-text)] hover:ring-[var(--eq-border2)]'
            }`}>
            {l.name} <span className="ml-1 text-[var(--eq-text2)]">{l.count}</span>
          </button>
        ))}
        <div className="w-px h-6 bg-[var(--eq-border)]" />
        <div className="relative group">
          <button className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            activeList.startsWith('sector_') && results ? 'bg-[var(--eq-accent-soft)] text-[var(--eq-accent)] ring-[var(--eq-accent-ring)]'
              : 'bg-[var(--eq-card)] text-[var(--eq-text3)] ring-1 ring-[var(--eq-border)] hover:text-[var(--eq-text)] hover:ring-[var(--eq-border2)]'
          }`}>
            Sectors <ChevronDown className="w-3 h-3" />
          </button>
          <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block bg-[var(--eq-card)] ring-1 ring-[var(--eq-border)] rounded-xl shadow-2xl py-1 min-w-[180px]">
            {sectorLists.map(l => (
              <button key={l.id} onClick={() => handleScan(l.id)}
                className="w-full text-left px-3 py-2 text-xs text-[var(--eq-text3)] hover:text-[var(--eq-text)] hover:bg-[var(--eq-card2)] flex justify-between">
                <span>{l.name}</span><span className="text-[var(--eq-text2)]">{l.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        {/* Columns toggle */}
        <button onClick={() => { setColumnsOpen(!columnsOpen); setFiltersOpen(false); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            columnsOpen ? 'bg-[var(--eq-accent-soft)] text-[var(--eq-accent)] border ring-[var(--eq-accent-ring)]'
              : 'bg-[var(--eq-card)] text-[var(--eq-text3)] ring-1 ring-[var(--eq-border)] hover:text-[var(--eq-text)] hover:ring-[var(--eq-border2)]'
          }`}>
          <Columns3 className="w-3 h-3" /> Columns
        </button>

        {/* Filters are always visible below — this badge just reports state */}
        {activeFilterCount > 0 && (
          <span className="flex items-center gap-1.5 rounded-lg bg-[var(--eq-accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--eq-accent)]">
            <SlidersHorizontal className="h-3 w-3" /> {activeFilterCount} active
          </span>
        )}

        {results && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--eq-text3)]" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search ticker or name..."
              className="bg-[var(--eq-card2)] ring-1 ring-[var(--eq-border)] rounded-lg pl-8 pr-3 py-1.5 text-[var(--eq-text)] text-xs w-36 focus:outline-none focus:border-[var(--eq-accent-ring)] focus:w-52 transition-all" />
          </div>
        )}
      </div>

      {/* ─── Columns Panel ─── */}
      {columnsOpen && (
        <div className="bg-[var(--eq-card2)] shadow-sm ring-1 ring-[var(--eq-border)] rounded-xl p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Object.entries(COL_GROUPS).map(([groupKey, groupLabel]) => (
              <div key={groupKey}>
                <div className="text-[9px] text-[var(--eq-text3)] uppercase tracking-widest mb-2 font-semibold">{groupLabel}</div>
                <div className="space-y-1">
                  {Object.entries(COLUMNS).filter(([, v]) => v.group === groupKey).map(([colKey, col]) => (
                    <label key={colKey} className={`flex items-center gap-1.5 cursor-pointer ${col.alwaysOn ? 'opacity-50' : ''}`}>
                      <input type="checkbox" checked={visibleCols[colKey]} onChange={() => toggleCol(colKey)}
                        disabled={col.alwaysOn} className="accent-[var(--eq-accent)] w-3 h-3" />
                      <span className={`text-[10px] ${visibleCols[colKey] ? 'text-[var(--eq-text2)]' : 'text-[var(--eq-text2)]'}`}>{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--eq-border)]">
            <button onClick={() => {
              const all = {};
              Object.keys(COLUMNS).forEach(k => { all[k] = true; });
              setVisibleCols(all);
            }} className="px-2 py-1 rounded text-[10px] bg-[var(--eq-card2)] text-[var(--eq-text3)] hover:text-[var(--eq-text)]">Show All</button>
            <button onClick={() => {
              const def = {};
              Object.entries(COLUMNS).forEach(([k, v]) => { def[k] = v.default; });
              setVisibleCols(def);
            }} className="px-2 py-1 rounded text-[10px] bg-[var(--eq-card2)] text-[var(--eq-text3)] hover:text-[var(--eq-text)]">Reset Default</button>
          </div>
        </div>
      )}

      {/* ─── Filters Panel ─── */}
      {/* ─── Filters — one dense row, collapsible, results stay above the fold ─── */}
      {results && (
        <div className="eq-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-2">
            <button type="button" onClick={() => setFiltersOpen(!filtersOpen)}
              className="flex items-center gap-1.5 text-left">
              <span className="eq-label">Filters</span>
              <ChevronDown className={`h-3.5 w-3.5 text-[var(--eq-text3)] transition-transform ${filtersOpen ? '' : '-rotate-90'}`} />
            </button>
            <span className="mx-1 h-4 w-px bg-[var(--eq-border)]" />
            <button onClick={() => setFilters({ ...DEFAULT_FILTERS, rsi_max: 30 })} className="eq-chip eq-chip-gain !cursor-pointer">Oversold</button>
            <button onClick={() => setFilters({ ...DEFAULT_FILTERS, above_sma20: 'yes', above_sma50: 'yes', above_sma200: 'yes', min_buy_signals: 3 })} className="eq-chip eq-chip-accent !cursor-pointer">Bullish</button>
            <button onClick={() => setFilters({ ...DEFAULT_FILTERS, above_sma200: 'no', pct_from_52w_high_min: -50, pct_from_52w_high_max: -20 })} className="eq-chip !cursor-pointer" style={{ color: 'var(--eq-warn)' }}>Deep value</button>
            <button onClick={() => setFilters({ ...DEFAULT_FILTERS, dividend_yield_min: 3 })} className="eq-chip !cursor-pointer">High div</button>
            <button onClick={() => setFilters({ ...DEFAULT_FILTERS, market_cap_min: 0, market_cap_max: 2 })} className="eq-chip !cursor-pointer">Small cap</button>
            <button onClick={() => setFilters({ ...DEFAULT_FILTERS, short_pct_min: 15 })} className="eq-chip eq-chip-loss !cursor-pointer">High short</button>
            <div className="ml-auto flex items-center gap-2">
              {activeFilterCount > 0 && (
                <button onClick={resetFilters} className="eq-btn eq-btn-ghost !px-2 !py-0.5 !text-[10.5px] !text-[var(--eq-accent)]">
                  {activeFilterCount} active · reset
                </button>
              )}
            </div>
          </div>

          {filtersOpen && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--eq-grid)] px-4 pb-3 pt-2.5 md:grid-cols-3 xl:grid-cols-5">
              <div className="space-y-1">
                <div className="eq-label !text-[9px]">Performance</div>
                <DualRange label="1D change" unit="%" min={-15} max={15} defMin={-100} defMax={100} valueMin={filters.change_1d_min} valueMax={filters.change_1d_max} onChange={(sd, v) => updateFilter(sd === 'min' ? 'change_1d_min' : 'change_1d_max', v)} />
                <DualRange label="5D change" unit="%" min={-30} max={30} defMin={-100} defMax={100} valueMin={filters.change_5d_min} valueMax={filters.change_5d_max} onChange={(sd, v) => updateFilter(sd === 'min' ? 'change_5d_min' : 'change_5d_max', v)} />
                <DualRange label="1M change" unit="%" min={-50} max={50} defMin={-100} defMax={100} valueMin={filters.change_20d_min} valueMax={filters.change_20d_max} onChange={(sd, v) => updateFilter(sd === 'min' ? 'change_20d_min' : 'change_20d_max', v)} />
                <DualRange label="3M change" unit="%" min={-75} max={75} defMin={-100} defMax={100} valueMin={filters.change_60d_min} valueMax={filters.change_60d_max} onChange={(sd, v) => updateFilter(sd === 'min' ? 'change_60d_min' : 'change_60d_max', v)} />
                <DualRange label="From 52W high" unit="%" min={-80} max={0} defMin={-100} defMax={0} valueMin={filters.pct_from_52w_high_min} valueMax={filters.pct_from_52w_high_max} onChange={(sd, v) => updateFilter(sd === 'min' ? 'pct_from_52w_high_min' : 'pct_from_52w_high_max', v)} />
              </div>

              <div className="space-y-1">
                <div className="eq-label !text-[9px]">Technical</div>
                <DualRange label="RSI (14)" min={0} max={100} defMin={0} defMax={100} valueMin={filters.rsi_min} valueMax={filters.rsi_max} onChange={(sd, v) => updateFilter(sd === 'min' ? 'rsi_min' : 'rsi_max', v)} />
                <DualRange label="Bollinger pos" min={0} max={1} step={0.05} defMin={0} defMax={1} valueMin={filters.bb_pos_min} valueMax={filters.bb_pos_max} onChange={(sd, v) => updateFilter(sd === 'min' ? 'bb_pos_min' : 'bb_pos_max', v)} />
                <DualRange label="Volatility" unit="%" min={0} max={150} defMin={0} defMax={200} valueMin={filters.volatility_min} valueMax={filters.volatility_max} onChange={(sd, v) => updateFilter(sd === 'min' ? 'volatility_min' : 'volatility_max', v)} />
                <DualRange label="Volume ratio" unit="×" min={0} max={10} step={0.1} defMin={0} defMax={50} valueMin={filters.vol_ratio_min} valueMax={filters.vol_ratio_max} onChange={(sd, v) => updateFilter(sd === 'min' ? 'vol_ratio_min' : 'vol_ratio_max', v)} />
                <ToggleRow label="MACD" value={filters.macd_trend} onChange={v => updateFilter('macd_trend', v)} options={trendOpts} />
              </div>

              <div className="space-y-1">
                <div className="eq-label !text-[9px]">Fundamentals</div>
                <DualRange label="Market cap" unit="B" min={0} max={500} step={1} defMin={0} defMax={999999} fmt={(v) => `$${v}`} valueMin={filters.market_cap_min} valueMax={filters.market_cap_max} onChange={(sd, v) => updateFilter(sd === 'min' ? 'market_cap_min' : 'market_cap_max', v)} />
                <DualRange label="P/E ratio" min={0} max={100} defMin={0} defMax={999} valueMin={filters.pe_min} valueMax={filters.pe_max} onChange={(sd, v) => updateFilter(sd === 'min' ? 'pe_min' : 'pe_max', v)} />
                <DualRange label="Div yield" unit="%" min={0} max={10} step={0.1} defMin={0} defMax={100} valueMin={filters.dividend_yield_min} valueMax={filters.dividend_yield_max} onChange={(sd, v) => updateFilter(sd === 'min' ? 'dividend_yield_min' : 'dividend_yield_max', v)} />
                <DualRange label="Beta" min={0} max={4} step={0.1} defMin={0} defMax={10} valueMin={filters.beta_min} valueMax={filters.beta_max} onChange={(sd, v) => updateFilter(sd === 'min' ? 'beta_min' : 'beta_max', v)} />
                <DualRange label="Profit margin" unit="%" min={-50} max={60} defMin={-100} defMax={100} valueMin={filters.profit_margin_min} valueMax={filters.profit_margin_max} onChange={(sd, v) => updateFilter(sd === 'min' ? 'profit_margin_min' : 'profit_margin_max', v)} />
              </div>

              <div className="space-y-1">
                <div className="eq-label !text-[9px]">Trend & ownership</div>
                <DualRange label="Short % float" unit="%" min={0} max={50} step={0.5} defMin={0} defMax={100} valueMin={filters.short_pct_min} valueMax={filters.short_pct_max} onChange={(sd, v) => updateFilter(sd === 'min' ? 'short_pct_min' : 'short_pct_max', v)} />
                <DualRange label="Insider own" unit="%" min={0} max={100} step={1} defMin={0} defMax={100} valueMin={filters.insider_pct_min} valueMax={filters.insider_pct_max} onChange={(sd, v) => updateFilter(sd === 'min' ? 'insider_pct_min' : 'insider_pct_max', v)} />
                <ToggleRow label="SMA 20" value={filters.above_sma20} onChange={v => updateFilter('above_sma20', v)} options={yesNoAny} />
                <ToggleRow label="SMA 50" value={filters.above_sma50} onChange={v => updateFilter('above_sma50', v)} options={yesNoAny} />
                <ToggleRow label="SMA 200" value={filters.above_sma200} onChange={v => updateFilter('above_sma200', v)} options={yesNoAny} />
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--eq-text3)]">Min signals</span>
                  <div className="flex shrink-0 gap-0.5">
                    {[0,2,4,6].map(n => (
                      <button key={n} onClick={() => updateFilter('min_buy_signals', n)}
                        className={`eq-num h-5 w-5 rounded text-[9.5px] font-semibold transition-colors ${filters.min_buy_signals === n ? 'bg-[var(--eq-accent)] text-[var(--eq-bg)]' : 'bg-[var(--eq-card2)] text-[var(--eq-text3)] hover:text-[var(--eq-text)]'}`}>{n}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="hidden xl:block">
                <div className="eq-label mb-1 !text-[9px]">Quality <span className="normal-case tracking-normal">min 0–6</span></div>
                <div className="flex justify-center">
                  <InteractiveSnowflake
                    title="Quality"
                    size={138}
                    dims={SF_QUALITY_DIMS}
                    values={sfQuality}
                    onChange={(key, val) => setSfQuality(prev => ({ ...prev, [key]: val }))}
                    enabled={sfQualityEnabled}
                    onToggle={() => setSfQualityEnabled(p => !p)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Status bar ─── */}
      {results && (
        <div className="flex items-center gap-2 text-[10px] text-[var(--eq-text2)]">
          <span className="text-[var(--eq-text3)] font-medium">{listName}</span>
          <span>·</span><span>{filteredResults.length} of {results.length} stocks</span>
          {activeFilterCount > 0 && <>
            <span>·</span><span className="text-[var(--eq-accent)]">{activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}</span>
            <button onClick={resetFilters} className="text-[var(--eq-text3)] hover:text-[var(--eq-text)] underline">clear</button>
          </>}
        </div>
      )}

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-[var(--eq-loss)] text-sm">{error}</div>}
      {loading && <div className="flex items-center justify-center h-48 text-[var(--eq-text3)]"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Scanning stocks...</div>}
      {!loading && !results && <div className="flex items-center justify-center h-48 text-[var(--eq-text2)] text-sm">Select a market or sector above to scan</div>}

      {/* ─── Table + Detail ─── */}
      {!loading && results && (
        <div className={`grid gap-4 ${selectedStock ? 'grid-cols-1 xl:grid-cols-[1fr_420px]' : 'grid-cols-1'}`}>
          <div className="bg-[var(--eq-card)] shadow-sm ring-1 ring-[var(--eq-border)] rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-[var(--eq-card2)] z-10">
                  <tr className="text-[var(--eq-text3)] border-b border-[var(--eq-border)]">
                    {visCols.map(colKey => {
                      const col = COLUMNS[colKey];
                      if (colKey === 'signals') {
                        return <th key={colKey} className="py-2.5 px-1 font-medium text-center" colSpan={1}>
                          <span className="text-[9px]">{ALL_STRATEGIES.map(s => STRATEGY_LABELS[s]).join(' ')}</span>
                        </th>;
                      }
                      return (
                        <th key={colKey}
                          className={`py-2.5 px-2 font-medium whitespace-nowrap ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${col.sortable ? 'cursor-pointer hover:text-[var(--eq-text2)]' : ''}`}
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
                      className={`border-b border-[var(--eq-grid)] cursor-pointer transition-colors ${selectedStock === r.symbol ? 'bg-[var(--eq-accent-soft)]' : 'hover:bg-[var(--eq-card2)]'}`}>
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
              {filteredResults.length === 0 && <div className="text-center py-8 text-[var(--eq-text2)] text-xs">No stocks match your filters</div>}
            </div>
          </div>

          {selectedStock && (
            <div className="bg-[var(--eq-card)] shadow-sm ring-1 ring-[var(--eq-border)] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--eq-border)]">
                <span className="text-sm font-semibold text-[var(--eq-text)]">{selectedStock}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openResearch(selectedStock)}
                    className="inline-flex items-center gap-1 rounded-md bg-[var(--eq-accent-soft)] px-2 py-1 text-[10px] font-medium text-[var(--eq-accent)] hover:bg-[var(--eq-accent-soft)]"
                  >
                    <ExternalLink className="h-3 w-3" /> Full Research
                  </button>
                  <button onClick={() => { setSelectedStock(null); setStockDetail(null); }} className="text-[var(--eq-text3)] hover:text-[var(--eq-text)]"><X className="w-4 h-4" /></button>
                </div>
              </div>
              {detailLoading ? <div className="flex items-center justify-center h-48 text-[var(--eq-text3)]"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...</div>
                : stockDetail ? <StockDetail data={stockDetail} />
                : <div className="p-4 text-[var(--eq-text3)] text-sm">Failed to load</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

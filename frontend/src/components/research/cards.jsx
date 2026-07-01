import { useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts';
import { FileText, ExternalLink } from 'lucide-react';
import { chartTheme, tooltipStyle } from '../../uiTheme';

// ─── formatting ───
export const money = (v) => {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v), a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
};
export const compact = (v) => {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v), a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
};
export const num = (v, d = 2) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(d));
export const pct = (v, d = 2) => (v == null || Number.isNaN(Number(v)) ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(d)}%`);
const toneCls = (v) => (v > 0 ? 'eq-gain' : v < 0 ? 'eq-loss' : 'text-[var(--eq-text2)]');

// ─── shells ───
export function Panel({ title, sub, actions, children, className = '' }) {
  return (
    <div className={`eq-card eq-fade-up p-4 ${className}`}>
      {(title || actions) && (
        <div className="mb-3.5 flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            {title && <h3 className="eq-label">{title}</h3>}
            {sub && <p className="text-[10.5px] text-[var(--eq-text3)]">{sub}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({ label, value, tone, sub }) {
  return (
    <div className="min-w-0">
      <div className="eq-label !text-[9.5px]">{label}</div>
      <div className={`eq-num mt-1 truncate text-[13.5px] font-semibold ${tone || 'text-[var(--eq-text)]'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-[var(--eq-text3)]">{sub}</div>}
    </div>
  );
}

function Grid({ tiles, cols = 4 }) {
  const colCls = cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-3 lg:grid-cols-4';
  return (
    <div className={`grid grid-cols-2 gap-x-4 gap-y-3.5 ${colCls}`}>
      {tiles.map(([l, v, t]) => <Stat key={l} label={l} value={v} tone={t} />)}
    </div>
  );
}

/** Horizontal metric bar: label · track w/ fill · value. `max` scales fill. */
function MetricBar({ label, value, display, max = 100, tone = 'accent', labelW = 'w-20' }) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const w = Math.max(2, Math.min(100, (Math.abs(Number(value)) / max) * 100));
  const fill = tone === 'gain' ? 'var(--eq-gain)' : tone === 'loss' ? 'var(--eq-loss)' : tone === 'warn' ? 'var(--eq-warn)' : 'var(--eq-accent)';
  return (
    <div className="flex items-center gap-2.5">
      <span className={`${labelW} shrink-0 text-[11px] text-[var(--eq-text2)]`}>{label}</span>
      <div className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-[var(--eq-grid)]">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${w}%`, background: fill, opacity: 0.85 }} />
      </div>
      <span className="eq-num w-14 shrink-0 text-right text-[11px] font-semibold text-[var(--eq-text)]">{display ?? `${num(value, 1)}%`}</span>
    </div>
  );
}

// ─── cards ───
export function KeyStatsCard({ s, ac }) {
  let tiles = [];
  const px = (v) => (v != null ? `$${num(v)}` : '—');
  if (ac === 'stock') {
    tiles = [
      ['Market Cap', s.market_cap_fmt || money(s.market_cap)],
      ['P/E (TTM)', num(s.pe_trailing, 1)], ['Fwd P/E', num(s.pe_forward, 1)],
      ['EPS', s.eps_trailing != null ? `$${num(s.eps_trailing)}` : '—'],
      ['Div Yield', s.dividend_yield_pct != null ? `${s.dividend_yield_pct}%` : '—'],
      ['Beta', num(s.beta)], ['52W High', px(s.high_52w)], ['52W Low', px(s.low_52w)],
    ];
  } else if (ac === 'crypto') {
    tiles = [
      ['Market Cap', s.market_cap_fmt || money(s.market_cap)],
      ['24h Volume', compact(s.volume_24h)], ['Circ. Supply', compact(s.circulating_supply)],
      ['Max Supply', s.max_supply ? compact(s.max_supply) : '∞'],
      ['52W High', px(s.high_52w)], ['52W Low', px(s.low_52w)],
    ];
  } else if (ac === 'etf') {
    tiles = [
      ['AUM', s.total_assets_fmt || money(s.total_assets)], ['Yield', s.yield_pct != null ? `${s.yield_pct}%` : '—'],
      ['Category', s.category || '—'], ['Fund Family', s.fund_family || '—'],
      ['YTD', s.ytd_return != null ? pct(s.ytd_return * 100) : '—'], ['Volume', compact(s.volume)],
    ];
  } else if (ac === 'commodity') {
    tiles = [
      ['Contract', s.contract || '—'], ['Exchange', s.exchange || '—'],
      ['Day High', px(s.day_high)], ['Day Low', px(s.day_low)],
      ['52W High', px(s.high_52w)], ['52W Low', px(s.low_52w)],
      ['Open Interest', s.open_interest != null ? compact(s.open_interest) : '—'], ['Volume', compact(s.volume)],
    ];
  } else {
    tiles = [
      ['Open', num(s.open)], ['Day High', num(s.day_high)], ['Day Low', num(s.day_low)],
      ['52W High', num(s.high_52w)], ['52W Low', num(s.low_52w)], ['Volume', compact(s.volume)],
    ];
  }
  return <Panel title="Key stats"><Grid tiles={tiles} /></Panel>;
}

export function PerformanceCard({ perf }) {
  const entries = Object.entries(perf || {});
  if (!entries.length) return null;
  const maxAbs = Math.max(...entries.map(([, v]) => Math.abs(Number(v) || 0)), 1);
  return (
    <Panel title="Performance" sub="total return">
      <div className="space-y-2">
        {entries.map(([k, v]) => {
          const w = Math.min(48, (Math.abs(v) / maxAbs) * 48);
          return (
            <div key={k} className="flex items-center gap-2.5">
              <span className="eq-num w-9 shrink-0 text-[10.5px] text-[var(--eq-text3)]">{k}</span>
              <div className="relative h-[14px] flex-1 overflow-hidden rounded bg-transparent">
                <div className="absolute left-1/2 top-0 h-full w-px bg-[var(--eq-border2)]" />
                <div
                  className="absolute top-1/2 h-[6px] -translate-y-1/2 rounded-full"
                  style={{
                    background: v >= 0 ? 'var(--eq-gain)' : 'var(--eq-loss)',
                    opacity: 0.85,
                    ...(v >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }),
                  }}
                />
              </div>
              <span className={`eq-num w-16 shrink-0 text-right text-[11px] font-semibold ${toneCls(v)}`}>{pct(v)}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function RiskCard({ rm }) {
  if (!rm || !Object.keys(rm).length) return null;
  return (
    <Panel title="Risk & volatility" sub="1y daily">
      <div className="mb-3.5 grid grid-cols-3 gap-x-4">
        <Stat label="Sharpe" value={num(rm.sharpe_ratio)} />
        <Stat label="Sortino" value={num(rm.sortino_ratio)} />
        <Stat label="Beta" value={num(rm.beta)} />
      </div>
      <div className="space-y-2">
        <MetricBar label="Volatility" value={rm.volatility_annual} max={80} tone="warn" display={rm.volatility_annual != null ? `${rm.volatility_annual}%` : '—'} />
        <MetricBar label="Max drawdown" value={rm.max_drawdown} max={80} tone="loss" display={rm.max_drawdown != null ? `${rm.max_drawdown}%` : '—'} />
        <MetricBar label="VaR 95%" value={rm.var_95} max={10} tone="loss" display={rm.var_95 != null ? `${rm.var_95}%` : '—'} />
      </div>
    </Panel>
  );
}

export function RangeCard({ s }) {
  const lo = s.low_52w, hi = s.high_52w, px = s.price;
  if (lo == null || hi == null || px == null || hi <= lo) return null;
  const posPct = Math.max(0, Math.min(100, ((px - lo) / (hi - lo)) * 100));
  const dlo = s.day_low, dhi = s.day_high;
  const dayPos = dlo != null && dhi != null && dhi > dlo
    ? Math.max(0, Math.min(100, ((px - dlo) / (dhi - dlo)) * 100)) : null;
  const track = (lo_, hi_, pos, label) => (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="eq-label !text-[9.5px]">{label}</span>
        <span className="eq-num text-[10px] text-[var(--eq-text3)]">{Math.round(pos)}%</span>
      </div>
      <div className="relative h-[5px] rounded-full bg-[var(--eq-grid)]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[var(--eq-loss)] via-[var(--eq-warn)] to-[var(--eq-gain)] opacity-30" style={{ width: '100%' }} />
        <div className="absolute top-1/2 h-[13px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--eq-text)] shadow-sm" style={{ left: `${pos}%` }} />
      </div>
      <div className="eq-num mt-1.5 flex justify-between text-[10.5px]">
        <span className="eq-loss">${num(lo_)}</span>
        <span className="font-semibold text-[var(--eq-text)]">${num(px)}</span>
        <span className="eq-gain">${num(hi_)}</span>
      </div>
    </div>
  );
  return (
    <Panel title="Price range">
      <div className="space-y-4">
        {track(lo, hi, posPct, '52-week')}
        {dayPos != null && track(dlo, dhi, dayPos, 'Today')}
      </div>
    </Panel>
  );
}

export function ValuationCard({ s }) {
  return (
    <Panel title="Valuation">
      <Grid tiles={[
        ['P/E (TTM)', num(s.pe_trailing, 1)], ['Forward P/E', num(s.pe_forward, 1)],
        ['PEG', num(s.peg_ratio)], ['Price/Sales', num(s.price_to_sales)],
        ['Price/Book', num(s.price_to_book)], ['EV/EBITDA', num(s.ev_to_ebitda)],
        ['EV/Rev', num(s.ev_to_revenue)], ['Enterprise Val', s.enterprise_value_fmt || money(s.enterprise_value)],
      ]} />
    </Panel>
  );
}

export function TargetsCard({ s }) {
  if (s.target_mean == null && !s.recommendation) return null;
  const up = s.price && s.target_mean ? ((s.target_mean / s.price - 1) * 100) : null;
  const lo = s.target_low, hi = s.target_high;
  const span = lo != null && hi != null && hi > lo ? hi - lo : null;
  const posOf = (v) => Math.max(0, Math.min(100, ((v - lo) / span) * 100));
  return (
    <Panel title="Analyst consensus" sub={s.analyst_count ? `${s.analyst_count} analysts` : undefined}>
      <div className="flex items-end justify-between">
        <div>
          <div className="eq-label !text-[9.5px]">Mean target</div>
          <div className="eq-num mt-0.5 text-[22px] font-bold text-[var(--eq-text)]">{s.target_mean != null ? `$${num(s.target_mean)}` : '—'}</div>
          {up != null && <div className={`eq-num text-[11.5px] font-semibold ${toneCls(up)}`}>{pct(up)} vs price</div>}
        </div>
        <span className={`eq-chip ${up == null ? '' : up >= 0 ? 'eq-chip-gain' : 'eq-chip-loss'}`}>{s.recommendation || '—'}</span>
      </div>
      {span != null && (
        <div className="mt-4">
          <div className="relative h-[5px] rounded-full bg-[var(--eq-grid)]">
            {/* low→high band */}
            <div className="absolute inset-y-0 rounded-full bg-[var(--eq-accent)] opacity-25" style={{ left: 0, width: '100%' }} />
            {/* mean marker */}
            {s.target_mean != null && (
              <div className="absolute top-1/2 h-[13px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--eq-accent)]" style={{ left: `${posOf(s.target_mean)}%` }} />
            )}
            {/* current price marker */}
            {s.price != null && (
              <div className="absolute top-1/2 h-[13px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--eq-text)]" style={{ left: `${posOf(s.price)}%` }} />
            )}
          </div>
          <div className="eq-num mt-1.5 flex justify-between text-[10.5px] text-[var(--eq-text3)]">
            <span>Low ${num(lo)}</span>
            <span className="text-[var(--eq-text)]">● price · <span className="text-[var(--eq-accent)]">● mean</span></span>
            <span>High ${num(hi)}</span>
          </div>
        </div>
      )}
    </Panel>
  );
}

// NEW — stock: margins + returns as bars
export function ProfitabilityCard({ p }) {
  if (!p) return null;
  const rows = [
    ['Gross margin', p.gross_margin_pct, 'accent'],
    ['Oper. margin', p.operating_margin_pct, 'accent'],
    ['Net margin', p.profit_margin_pct, p.profit_margin_pct >= 0 ? 'gain' : 'loss'],
    ['ROE', p.return_on_equity_pct, p.return_on_equity_pct >= 0 ? 'gain' : 'loss'],
    ['ROA', p.return_on_assets_pct, p.return_on_assets_pct >= 0 ? 'gain' : 'loss'],
  ].filter(([, v]) => v != null);
  if (!rows.length) return null;
  return (
    <Panel title="Profitability" sub="TTM">
      <div className="space-y-2">
        {rows.map(([l, v, t]) => <MetricBar key={l} label={l} value={v} max={100} tone={t} display={`${num(v, 1)}%`} />)}
      </div>
    </Panel>
  );
}

// NEW — stock: growth & cash generation
export function GrowthCard({ g }) {
  if (!g) return null;
  const hasAny = g.revenue_growth_pct != null || g.free_cash_flow != null || g.ebitda != null;
  if (!hasAny) return null;
  return (
    <Panel title="Growth & cash flow" sub="TTM">
      <div className="mb-3.5 space-y-2">
        {g.revenue_growth_pct != null && (
          <MetricBar label="Revenue growth" value={g.revenue_growth_pct} max={60} tone={g.revenue_growth_pct >= 0 ? 'gain' : 'loss'} display={pct(g.revenue_growth_pct, 1)} labelW="w-24" />
        )}
        {g.earnings_growth_pct != null && (
          <MetricBar label="Earnings growth" value={g.earnings_growth_pct} max={60} tone={g.earnings_growth_pct >= 0 ? 'gain' : 'loss'} display={pct(g.earnings_growth_pct, 1)} labelW="w-24" />
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 sm:grid-cols-4">
        <Stat label="Revenue" value={g.revenue_fmt || money(g.revenue)} />
        <Stat label="EBITDA" value={g.ebitda_fmt || money(g.ebitda)} />
        <Stat label="Free cash flow" value={g.free_cash_flow_fmt || money(g.free_cash_flow)} tone={g.free_cash_flow != null ? toneCls(g.free_cash_flow) : undefined} />
        <Stat label="Oper. cash flow" value={g.operating_cash_flow_fmt || money(g.operating_cash_flow)} />
      </div>
    </Panel>
  );
}

// NEW — stock: balance sheet health
export function BalanceCard({ b }) {
  if (!b) return null;
  const hasAny = b.total_cash != null || b.total_debt != null || b.debt_to_equity != null;
  if (!hasAny) return null;
  const cash = Number(b.total_cash) || 0, debt = Number(b.total_debt) || 0;
  const total = cash + debt;
  return (
    <Panel title="Balance sheet">
      {total > 0 && (
        <div className="mb-3.5">
          <div className="flex h-[6px] overflow-hidden rounded-full">
            <div style={{ width: `${(cash / total) * 100}%`, background: 'var(--eq-gain)', opacity: .85 }} />
            <div style={{ width: `${(debt / total) * 100}%`, background: 'var(--eq-loss)', opacity: .85 }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[10.5px]">
            <span className="eq-gain eq-num">Cash {b.total_cash_fmt || money(cash)}</span>
            <span className="eq-loss eq-num">Debt {b.total_debt_fmt || money(debt)}</span>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 sm:grid-cols-4">
        <Stat label="Debt/Equity" value={num(b.debt_to_equity, 1)} />
        <Stat label="Current ratio" value={num(b.current_ratio)} />
        <Stat label="Quick ratio" value={num(b.quick_ratio)} />
        <Stat label="Book value/sh" value={b.book_value != null ? `$${num(b.book_value)}` : '—'} />
      </div>
    </Panel>
  );
}

// NEW — stock: ownership & short interest
export function OwnershipCard({ o }) {
  if (!o) return null;
  const rows = [
    ['Insiders', o.insider_pct, 'accent'],
    ['Institutions', o.institution_pct, 'accent'],
    ['Short % float', o.short_pct_float, 'loss'],
  ].filter(([, v]) => v != null);
  if (!rows.length) return null;
  return (
    <Panel title="Ownership" sub="of float / shares">
      <div className="space-y-2">
        {rows.map(([l, v, t]) => <MetricBar key={l} label={l} value={v} max={100} tone={t} display={`${num(v, 1)}%`} labelW="w-24" />)}
      </div>
      <div className="mt-3.5 grid grid-cols-3 gap-x-4">
        <Stat label="Shares out" value={compact(o.shares_outstanding)} />
        <Stat label="Float" value={compact(o.shares_float)} />
        <Stat label="Short ratio" value={num(o.short_ratio, 1)} />
      </div>
    </Panel>
  );
}

// NEW — stock: dividend profile
export function DividendCard({ s }) {
  if (s.dividend_yield_pct == null && s.dividend_rate == null) return null;
  const payout = s.payout_ratio != null ? s.payout_ratio * 100 : null;
  const exDate = s.ex_dividend_date ? new Date(Number(s.ex_dividend_date) * 1000) : null;
  return (
    <Panel title="Dividend">
      <div className="grid grid-cols-3 gap-x-4">
        <Stat label="Yield" value={s.dividend_yield_pct != null ? `${s.dividend_yield_pct}%` : '—'} tone="eq-gain" />
        <Stat label="Rate / yr" value={s.dividend_rate != null ? `$${num(s.dividend_rate)}` : '—'} />
        <Stat label="Ex-div date" value={exDate && !Number.isNaN(exDate.getTime()) ? exDate.toISOString().slice(0, 10) : '—'} />
      </div>
      {payout != null && (
        <div className="mt-3.5">
          <MetricBar label="Payout ratio" value={payout} max={100} tone={payout > 80 ? 'loss' : payout > 60 ? 'warn' : 'gain'} display={`${num(payout, 1)}%`} labelW="w-24" />
        </div>
      )}
    </Panel>
  );
}

// NEW — quality scores (snowflake payload) as horizontal score bars
export function ScoresCard({ sf }) {
  if (!sf) return null;
  const rows = [
    ['Value', sf.value], ['Future', sf.future], ['Past', sf.past],
    ['Health', sf.health], ['Dividend', sf.dividend],
  ].filter(([, v]) => v != null);
  if (!rows.length) return null;
  return (
    <Panel title="Quality scores" sub="0–6 scale">
      <div className="space-y-2.5">
        {rows.map(([l, v]) => (
          <div key={l} className="flex items-center gap-2.5">
            <span className="w-16 shrink-0 text-[11px] text-[var(--eq-text2)]">{l}</span>
            <div className="flex flex-1 gap-1">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-[6px] flex-1 rounded-full" style={{
                  background: i <= v ? (v >= 4 ? 'var(--eq-gain)' : v >= 2 ? 'var(--eq-warn)' : 'var(--eq-loss)') : 'var(--eq-grid)',
                  opacity: i <= v ? 0.9 : 1,
                }} />
              ))}
            </div>
            <span className="eq-num w-7 shrink-0 text-right text-[11px] font-semibold text-[var(--eq-text)]">{v}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// NEW — crypto: supply & 24h activity
export function SupplyCard({ s }) {
  if (s.circulating_supply == null) return null;
  const circ = Number(s.circulating_supply), max = Number(s.max_supply) || null;
  const p = max ? Math.min(100, (circ / max) * 100) : null;
  return (
    <Panel title="Supply" sub={max ? 'capped' : 'uncapped'}>
      {p != null ? (
        <>
          <div className="relative h-[6px] rounded-full bg-[var(--eq-grid)]">
            <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--eq-accent)]" style={{ width: `${p}%`, opacity: .85 }} />
          </div>
          <div className="eq-num mt-1.5 flex justify-between text-[10.5px] text-[var(--eq-text3)]">
            <span>{compact(circ)} circulating</span>
            <span className="font-semibold text-[var(--eq-text)]">{num(p, 1)}% of {compact(max)}</span>
          </div>
        </>
      ) : (
        <div className="eq-num text-sm font-semibold text-[var(--eq-text)]">{compact(circ)} <span className="text-[11px] font-normal text-[var(--eq-text3)]">circulating · no max supply</span></div>
      )}
      <div className="mt-3.5 grid grid-cols-2 gap-x-4">
        <Stat label="24h volume" value={compact(s.volume_24h || s.volume)} />
        <Stat label="Mkt cap / vol" value={s.market_cap && (s.volume_24h || s.volume) ? num(s.market_cap / (s.volume_24h || s.volume), 1) : '—'} />
      </div>
    </Panel>
  );
}

// NEW — etf: fund returns profile
export function FundReturnsCard({ s }) {
  const rows = [
    ['YTD', s.ytd_return != null ? s.ytd_return * 100 : null],
    ['3Y avg', s.three_year_return != null ? s.three_year_return * 100 : null],
    ['5Y avg', s.five_year_return != null ? s.five_year_return * 100 : null],
  ].filter(([, v]) => v != null);
  if (!rows.length && s.nav_price == null) return null;
  const maxAbs = Math.max(...rows.map(([, v]) => Math.abs(v)), 1);
  return (
    <Panel title="Fund returns" sub="annualized">
      <div className="space-y-2">
        {rows.map(([l, v]) => (
          <MetricBar key={l} label={l} value={v} max={maxAbs * 1.2} tone={v >= 0 ? 'gain' : 'loss'} display={pct(v, 1)} labelW="w-12" />
        ))}
      </div>
      <div className="mt-3.5 grid grid-cols-3 gap-x-4">
        <Stat label="NAV" value={s.nav_price != null ? `$${num(s.nav_price)}` : '—'} />
        <Stat label="Yield" value={s.yield_pct != null ? `${s.yield_pct}%` : '—'} tone="eq-gain" />
        <Stat label="AUM" value={s.total_assets_fmt || money(s.total_assets)} />
      </div>
    </Panel>
  );
}

// NEW — any class: volume vs average
export function VolumeCard({ s }) {
  const v = Number(s.volume) || null, avg = Number(s.avg_volume) || null;
  if (!v || !avg) return null;
  const ratio = v / avg;
  const rows = [
    ['Today', v, 'accent'],
    ['3-mo avg', avg, 'accent'],
    ...(s.avg_volume_10d ? [['10-day avg', Number(s.avg_volume_10d), 'accent']] : []),
  ];
  const mx = Math.max(...rows.map(([, x]) => x));
  return (
    <Panel title="Volume" sub={`${num(ratio, 2)}× average`}>
      <div className="space-y-2">
        {rows.map(([l, x]) => (
          <MetricBar key={l} label={l} value={x} max={mx} tone={l === 'Today' ? (ratio >= 1 ? 'gain' : 'warn') : 'accent'} display={compact(x)} labelW="w-16" />
        ))}
      </div>
    </Panel>
  );
}

export function FinancialsCard({ financials, dark }) {
  const annual = financials?.annual || [];
  const quarterly = financials?.quarterly || [];
  const [mode, setMode] = useState(annual.length ? 'annual' : 'quarterly');
  const src = (mode === 'annual' ? annual : quarterly);
  if (!annual.length && !quarterly.length) return null;
  const rows = src.length ? src : (annual.length ? annual : quarterly);
  const t = chartTheme(dark);

  const data = rows.map((r) => ({
    period: mode === 'annual' ? String(r.period_end).slice(0, 4) : `${String(r.fy).slice(2)}${r.fp || ''}`,
    revenue: r.revenue, net_income: r.net_income,
    margin: r.revenue ? Math.round((r.net_income / r.revenue) * 1000) / 10 : null,
  }));
  const latest = rows[rows.length - 1] || {};
  const toggle = (m, label) => (
    <button key={m} onClick={() => setMode(m)} disabled={(m === 'annual' ? annual : quarterly).length === 0}
      className="eq-seg-item" data-on={mode === m}>{label}</button>
  );

  return (
    <Panel title="Financials" sub="SEC EDGAR · XBRL"
      actions={<div className="eq-seg">{toggle('annual', 'Annual')}{toggle('quarterly', 'Quarterly')}</div>}>
      <div className="mb-3.5 grid grid-cols-3 gap-x-4">
        <Stat label="Revenue" value={money(latest.revenue)} />
        <Stat label="Net income" value={money(latest.net_income)} tone={toneCls(latest.net_income)} />
        <Stat label="Net margin" value={latest.revenue ? `${((latest.net_income / latest.revenue) * 100).toFixed(1)}%` : '—'} />
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
            <XAxis dataKey="period" tick={{ fontSize: 10, fill: t.text }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis yAxisId="l" tickFormatter={(v) => compact(v)} tick={{ fontSize: 9, fill: t.text }} width={42} tickLine={false} axisLine={false} />
            <YAxis yAxisId="r" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 9, fill: t.series[2] }} width={34} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v, n) => n === 'margin' ? [`${v}%`, 'Net margin'] : [money(v), n === 'revenue' ? 'Revenue' : 'Net income']}
              contentStyle={tooltipStyle(dark)} cursor={{ fill: t.accentSoft }} />
            <Bar yAxisId="l" dataKey="revenue" radius={[3, 3, 0, 0]} fill={t.accent} fillOpacity={0.75} name="revenue" />
            <Bar yAxisId="l" dataKey="net_income" radius={[3, 3, 0, 0]} name="net_income">
              {data.map((d, i) => <Cell key={i} fill={d.net_income >= 0 ? t.gain : t.loss} fillOpacity={0.85} />)}
            </Bar>
            <Line yAxisId="r" type="monotone" dataKey="margin" stroke={t.series[2]} strokeWidth={1.8} dot={false} name="margin" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

export function FilingsCard({ filings }) {
  const rows = (filings || []).slice(0, 8);
  if (!rows.length) return null;
  return (
    <Panel title="SEC filings" sub="EDGAR">
      <ul className="-mx-2 space-y-0.5">
        {rows.map((f, i) => (
          <li key={i}>
            <a href={f.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-[var(--eq-card2)]">
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--eq-text3)]" strokeWidth={1.8} />
                <span className="eq-num shrink-0 font-semibold text-[var(--eq-text)]">{f.form}</span>
                <span className="truncate text-[var(--eq-text3)]">{f.title || ''}</span>
              </span>
              <span className="eq-num flex shrink-0 items-center gap-1.5 text-[10.5px] text-[var(--eq-text3)]">{f.filed}<ExternalLink className="h-3 w-3" /></span>
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function AboutCard({ s }) {
  if (!s.description) return null;
  return (
    <Panel title={`About ${s.name || s.symbol}`}>
      <p className="text-xs leading-relaxed text-[var(--eq-text2)]">{String(s.description).slice(0, 700)}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {s.sector && <span className="eq-chip">{s.sector}</span>}
        {s.industry && <span className="eq-chip">{s.industry}</span>}
        {s.country && <span className="eq-chip">{s.country}</span>}
        {s.employees && <span className="eq-chip">{compact(s.employees)} employees</span>}
        {s.website && <a href={s.website} target="_blank" rel="noopener noreferrer" className="eq-chip eq-chip-accent">Website ↗</a>}
      </div>
    </Panel>
  );
}

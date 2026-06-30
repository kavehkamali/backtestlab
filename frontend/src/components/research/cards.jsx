import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts';
import { FileText, ExternalLink } from 'lucide-react';

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
const toneCls = (v) => (v > 0 ? 'text-emerald-600 dark:text-emerald-400' : v < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-600 dark:text-zinc-300');

// ─── shells ───
export function Panel({ title, sub, actions, children, className = '' }) {
  return (
    <div className={`rounded-2xl bg-white p-4 ring-1 ring-zinc-200/70 shadow-sm dark:bg-zinc-900/70 dark:ring-zinc-800 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            {title && <h3 className="text-[13px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{title}</h3>}
            {sub && <p className="text-[11px] text-zinc-400">{sub}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({ label, value, tone }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100 dark:bg-zinc-950/40 dark:ring-zinc-800">
      <div className="text-[10px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className={`mt-0.5 truncate font-mono text-sm font-semibold ${tone || 'text-zinc-900 dark:text-zinc-100'}`}>{value}</div>
    </div>
  );
}

function Grid({ tiles }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {tiles.map(([l, v, t]) => <Stat key={l} label={l} value={v} tone={t} />)}
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
      ['Max Supply', s.max_supply ? compact(s.max_supply) : '—'],
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
  return <Panel title="Key Stats"><Grid tiles={tiles} /></Panel>;
}

export function PerformanceCard({ perf }) {
  const entries = Object.entries(perf || {});
  if (!entries.length) return null;
  return (
    <Panel title="Performance">
      <div className="flex flex-wrap gap-2">
        {entries.map(([k, v]) => (
          <div key={k} className={`min-w-[64px] rounded-xl px-3 py-2 text-center ${v >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
            <div className="text-[10px] text-zinc-400">{k}</div>
            <div className={`font-mono text-sm font-bold ${toneCls(v)}`}>{pct(v)}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function RiskCard({ rm }) {
  if (!rm || !Object.keys(rm).length) return null;
  return (
    <Panel title="Risk & Volatility">
      <Grid tiles={[
        ['Sharpe', num(rm.sharpe_ratio)], ['Sortino', num(rm.sortino_ratio)],
        ['Volatility', rm.volatility_annual != null ? `${rm.volatility_annual}%` : '—'],
        ['Max Drawdown', rm.max_drawdown != null ? `${rm.max_drawdown}%` : '—', toneCls(rm.max_drawdown)],
        ['VaR 95%', rm.var_95 != null ? `${rm.var_95}%` : '—'], ['Beta', num(rm.beta)],
      ]} />
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
  return (
    <Panel title="Analyst Consensus">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-400">Mean target</div>
          <div className="font-mono text-2xl font-bold text-zinc-900 dark:text-zinc-100">{s.target_mean != null ? `$${num(s.target_mean)}` : '—'}</div>
          {up != null && <div className={`text-xs font-semibold ${toneCls(up)}`}>{pct(up)} vs price</div>}
        </div>
        <div className="text-right">
          <div className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-900">{s.recommendation || '—'}</div>
          <div className="mt-1 text-[10px] text-zinc-400">{s.analyst_count ? `${s.analyst_count} analysts` : ''}</div>
        </div>
      </div>
      {(s.target_low != null && s.target_high != null) && (
        <div className="mt-3">
          <div className="flex justify-between font-mono text-[10px] text-zinc-400"><span>${num(s.target_low)}</span><span>${num(s.target_high)}</span></div>
          <div className="relative mt-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
            {s.price != null && s.target_high > s.target_low && (
              <div className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-zinc-900 dark:bg-zinc-100"
                style={{ left: `${Math.max(0, Math.min(100, ((s.price - s.target_low) / (s.target_high - s.target_low)) * 100))}%` }} />
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

export function FinancialsCard({ financials, dark }) {
  const ann = financials?.annual || [];
  if (!ann.length) return null;
  const data = ann.map((r) => ({
    period: String(r.period_end).slice(0, 4),
    revenue: r.revenue, net_income: r.net_income, margin: r.revenue ? (r.net_income / r.revenue) * 100 : null,
  }));
  const latest = ann[ann.length - 1];
  return (
    <Panel title="Financials" sub="Annual · SEC EDGAR (XBRL)">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Revenue" value={money(latest.revenue)} />
        <Stat label="Net Income" value={money(latest.net_income)} tone={toneCls(latest.net_income)} />
        <Stat label="Diluted EPS" value={latest.eps_diluted != null ? `$${num(latest.eps_diluted)}` : '—'} />
      </div>
      <div className="mt-3 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#1f2937' : '#eef0f3'} />
            <XAxis dataKey="period" tick={{ fontSize: 10, fill: dark ? '#9ca3af' : '#6b7280' }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={(v) => compact(v)} tick={{ fontSize: 9, fill: dark ? '#9ca3af' : '#6b7280' }} width={42} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v, n) => [money(v), n === 'revenue' ? 'Revenue' : 'Net income']} contentStyle={{ fontSize: 11, borderRadius: 8, background: dark ? '#18181b' : '#fff', border: `1px solid ${dark ? '#374151' : '#e5e7eb'}` }} />
            <Bar dataKey="revenue" radius={[3, 3, 0, 0]} fill="#6366f1" />
            <Bar dataKey="net_income" radius={[3, 3, 0, 0]}>
              {data.map((d, i) => <Cell key={i} fill={d.net_income >= 0 ? '#10b981' : '#f43f5e'} />)}
            </Bar>
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
    <Panel title="SEC Filings" sub="EDGAR">
      <ul className="space-y-1.5">
        {rows.map((f, i) => (
          <li key={i}>
            <a href={f.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
              <span className="flex items-center gap-2 truncate">
                <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-200">{f.form}</span>
                <span className="truncate text-zinc-400">{f.title || ''}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-zinc-400">{f.filed}<ExternalLink className="h-3 w-3" /></span>
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
      <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{String(s.description).slice(0, 700)}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-400">
        {s.sector && <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">{s.sector}</span>}
        {s.industry && <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">{s.industry}</span>}
        {s.country && <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">{s.country}</span>}
        {s.employees && <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">{compact(s.employees)} employees</span>}
        {s.website && <a href={s.website} target="_blank" rel="noopener noreferrer" className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">Website</a>}
      </div>
    </Panel>
  );
}

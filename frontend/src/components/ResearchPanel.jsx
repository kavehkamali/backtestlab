import { useState, useEffect, useCallback } from 'react';
import { Loader2, Search, ExternalLink, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell, ComposedChart, Line, PieChart, Pie } from 'recharts';
import { fetchResearch } from '../api';
import SnowflakeChart from './SnowflakeChart';

// ─── Helpers ───
function fmtNum(v, dec = 2) { return v != null ? Number(v).toFixed(dec) : '—'; }
function fmtPct(v) { return v != null ? `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%` : '—'; }
function fmtLarge(v) {
  if (!v) return '—';
  v = Number(v);
  if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}
function PctSpan({ value }) {
  if (value == null) return <span className="text-zinc-600">—</span>;
  const c = value > 0 ? 'text-emerald-600' : value < 0 ? 'text-red-600' : 'text-zinc-500';
  return <span className={c}>{value > 0 ? '+' : ''}{Number(value).toFixed(2)}%</span>;
}
function Stat({ label, value, sub, color }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-zinc-100">
      <span className="text-zinc-500 text-xs">{label}</span>
      <div className="text-right">
        <span className={`text-xs font-medium ${color || 'text-zinc-700'}`}>{value ?? '—'}</span>
        {sub && <div className="text-[9px] text-zinc-600">{sub}</div>}
      </div>
    </div>
  );
}
function GradeBadge({ grade, label, score }) {
  const colors = {
    'A': 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
    'B': 'bg-green-500/15 text-green-400 border-green-500/30',
    'C': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    'D': 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    'F': 'bg-red-500/15 text-red-600 border-red-500/30',
  };
  const cls = colors[grade] || 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200/80';
  return (
    <div className="text-center">
      <div className={`w-10 h-10 rounded-lg border flex items-center justify-center text-lg font-bold ${cls}`}>{grade || '—'}</div>
      <div className="text-[9px] text-zinc-500 mt-1">{label}</div>
    </div>
  );
}
function Card({ title, children }) {
  return (
    <div className="bg-zinc-50/90 shadow-sm ring-1 ring-zinc-200/70 rounded-xl p-4">
      {title && <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2 font-semibold">{title}</div>}
      {children}
    </div>
  );
}
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-[10px]">
      <p className="text-zinc-500 mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' ? fmtLarge(p.value) : p.value}</p>)}
    </div>
  );
}

// SnowflakeChart imported from ./SnowflakeChart.jsx

// ─── DCF Fair Value Bar ───
function FairValueBar({ dcf }) {
  if (!dcf?.fair_value) return null;
  const { fair_value, current_price, discount_pct, undervalued } = dcf;
  const max = Math.max(fair_value, current_price) * 1.2;
  return (
    <div>
      <div className="flex items-end gap-4 h-24 mb-2">
        <div className="flex-1 text-center">
          <div className={`rounded-t-lg ${undervalued ? 'bg-emerald-500/30' : 'bg-red-500/30'}`}
            style={{ height: `${(current_price / max) * 100}%`, minHeight: 20 }}>
            <div className="text-[10px] text-zinc-900 font-bold pt-1">${current_price}</div>
          </div>
          <div className="text-[9px] text-zinc-500 mt-1">Current</div>
        </div>
        <div className="flex-1 text-center">
          <div className="bg-indigo-500/30 rounded-t-lg"
            style={{ height: `${(fair_value / max) * 100}%`, minHeight: 20 }}>
            <div className="text-[10px] text-zinc-900 font-bold pt-1">${fair_value}</div>
          </div>
          <div className="text-[9px] text-zinc-500 mt-1">Fair Value</div>
        </div>
      </div>
      <div className={`text-center text-sm font-bold ${undervalued ? 'text-emerald-600' : 'text-red-600'}`}>
        {undervalued ? `${Math.abs(discount_pct)}% undervalued` : `${discount_pct}% overvalued`}
      </div>
    </div>
  );
}

// ─── Ownership Pie ───
function OwnershipPie({ data }) {
  if (!data?.length) return null;
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={120} height={120}>
        <PieChart>
          <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={50} paddingAngle={2}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
            <span className="text-xs text-zinc-500">{d.name}</span>
            <span className="text-xs text-zinc-900 font-medium">{d.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Risk Checklist ───
function RiskChecklist({ checks }) {
  if (!checks?.length) return null;
  const passed = checks.filter(c => c.pass).length;
  return (
    <div>
      <div className="text-xs text-zinc-500 mb-2">
        <span className="text-emerald-600 font-bold">{passed}</span>/{checks.length} checks passed
      </div>
      <div className="space-y-1.5">
        {checks.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${c.pass ? 'bg-emerald-500/20 text-emerald-600' : 'bg-red-500/20 text-red-600'}`}>
              {c.pass ? '✓' : '✗'}
            </div>
            <span className="text-xs text-zinc-600 flex-1">{c.label}</span>
            <span className={`text-[10px] font-mono ${c.pass ? 'text-emerald-600' : 'text-red-600'}`}>{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TABS ───
const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'ratings', label: 'Ratings' },
  { id: 'financials', label: 'Financials' },
  { id: 'earnings', label: 'Earnings' },
  { id: 'dividends', label: 'Dividends' },
  { id: 'risk', label: 'Risk' },
  { id: 'ownership', label: 'Ownership' },
  { id: 'peers', label: 'Peers' },
  { id: 'news', label: 'News' },
];

// ═══════════════════════════════════════════
// SUMMARY TAB
// ═══════════════════════════════════════════
function SummaryTab({ data }) {
  const s = data.summary;
  const g = data.grades || {};
  const p = data.profitability || {};
  const gr = data.growth || {};
  const b = data.balance || {};
  const rc = data.revenue_chart || [];
  const rm = data.risk_metrics || {};
  const chart = data.chart || [];
  const step = Math.max(1, Math.floor(chart.length / 300));
  const chartData = chart.filter((_, i) => i % step === 0 || i === chart.length - 1);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">{s.name}</h2>
          <div className="text-xs text-zinc-500 mt-0.5">{s.exchange} · {s.sector} · {s.industry}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-zinc-900">${s.price}</div>
          <div className={`text-sm font-semibold ${s.change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {s.change >= 0 ? '+' : ''}{s.change} ({fmtPct(s.change_pct)})
          </div>
        </div>
      </div>

      {/* Performance badges */}
      {rm.performance && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(rm.performance).map(([k, v]) => (
            <div key={k} className={`px-3 py-1.5 rounded-lg text-center ${v >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              <div className="text-[9px] text-zinc-500">{k}</div>
              <div className={`text-xs font-bold ${v >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{v > 0 ? '+' : ''}{v}%</div>
            </div>
          ))}
        </div>
      )}

      {/* Snowflake + DCF + Ownership + Risk — SWS-style row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title="Snowflake Analysis">
          <SnowflakeChart data={data.snowflake} />
        </Card>
        <Card title="Fair Value (DCF)">
          <FairValueBar dcf={data.dcf} />
        </Card>
        <Card title="Ownership Breakdown">
          <OwnershipPie data={data.ownership_pie} />
        </Card>
        <Card title="Health Check">
          <RiskChecklist checks={data.risk_checks} />
        </Card>
      </div>

      {/* Quant Grades */}
      <Card title="Quant Rating">
        <div className="flex justify-around">
          <GradeBadge grade={g.valuation?.grade} label="Valuation" />
          <GradeBadge grade={g.growth?.grade} label="Growth" />
          <GradeBadge grade={g.profitability?.grade} label="Profitability" />
          <GradeBadge grade={g.momentum?.grade} label="Momentum" />
        </div>
      </Card>

      {/* Price Chart */}
      {chartData.length > 0 && (
        <Card title="Price History (2Y)">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#444' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: '#444' }} domain={['auto', 'auto']} tickFormatter={v => `$${v}`} width={50} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="close" stroke="#6366f1" fill="url(#rg)" strokeWidth={1.5} name="Close" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Revenue / Earnings Chart */}
      {rc.length > 0 && (
        <Card title="Revenue & Earnings (Annual)">
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={rc}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" />
              <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#444' }} />
              <YAxis tick={{ fontSize: 9, fill: '#444' }} tickFormatter={v => fmtLarge(v)} width={60} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="revenue" fill="#6366f140" name="Revenue" radius={[3, 3, 0, 0]} />
              <Bar dataKey="gross_profit" fill="#22c55e30" name="Gross Profit" radius={[3, 3, 0, 0]} />
              <Line type="monotone" dataKey="net_income" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} name="Net Income" />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Valuation">
          <Stat label="Market Cap" value={s.market_cap_fmt} />
          <Stat label="Enterprise Value" value={s.enterprise_value_fmt} />
          <Stat label="P/E (TTM)" value={fmtNum(s.pe_trailing, 1)} />
          <Stat label="Forward P/E" value={fmtNum(s.pe_forward, 1)} />
          <Stat label="PEG Ratio" value={fmtNum(s.peg_ratio)} />
          <Stat label="Price/Sales" value={fmtNum(s.price_to_sales)} />
          <Stat label="Price/Book" value={fmtNum(s.price_to_book)} />
          <Stat label="EV/Revenue" value={fmtNum(s.ev_to_revenue)} />
          <Stat label="EV/EBITDA" value={fmtNum(s.ev_to_ebitda)} />
        </Card>
        <Card title="Profitability">
          <Stat label="Gross Margin" value={fmtPct(p.gross_margin_pct)} color={p.gross_margin_pct > 0 ? 'text-emerald-600' : 'text-red-600'} />
          <Stat label="Operating Margin" value={fmtPct(p.operating_margin_pct)} color={p.operating_margin_pct > 0 ? 'text-emerald-600' : 'text-red-600'} />
          <Stat label="Profit Margin" value={fmtPct(p.profit_margin_pct)} color={p.profit_margin_pct > 0 ? 'text-emerald-600' : 'text-red-600'} />
          <Stat label="ROE" value={fmtPct(p.return_on_equity_pct)} />
          <Stat label="ROA" value={fmtPct(p.return_on_assets_pct)} />
        </Card>
        <Card title="Growth & Cash Flow">
          <Stat label="Revenue" value={gr.revenue_fmt} />
          <Stat label="Revenue Growth" value={fmtPct(gr.revenue_growth_pct)} color={gr.revenue_growth_pct > 0 ? 'text-emerald-600' : 'text-red-600'} />
          <Stat label="Earnings Growth" value={fmtPct(gr.earnings_growth_pct)} color={gr.earnings_growth_pct > 0 ? 'text-emerald-600' : 'text-red-600'} />
          <Stat label="EBITDA" value={gr.ebitda_fmt} />
          <Stat label="Free Cash Flow" value={gr.free_cash_flow_fmt} />
          <Stat label="Operating Cash Flow" value={gr.operating_cash_flow_fmt} />
          <Stat label="EPS (TTM)" value={s.eps_trailing != null ? `$${fmtNum(s.eps_trailing)}` : '—'} />
          <Stat label="EPS (Forward)" value={s.eps_forward != null ? `$${fmtNum(s.eps_forward)}` : '—'} />
        </Card>
        <Card title="Balance Sheet">
          <Stat label="Total Cash" value={b.total_cash_fmt} />
          <Stat label="Cash/Share" value={b.total_cash_per_share != null ? `$${fmtNum(b.total_cash_per_share)}` : '—'} />
          <Stat label="Total Debt" value={b.total_debt_fmt} />
          <Stat label="Debt/Equity" value={fmtNum(b.debt_to_equity, 1)} />
          <Stat label="Current Ratio" value={fmtNum(b.current_ratio)} />
          <Stat label="Quick Ratio" value={fmtNum(b.quick_ratio)} />
          <Stat label="Book Value" value={b.book_value != null ? `$${fmtNum(b.book_value)}` : '—'} />
        </Card>
      </div>

      {/* Analyst Target */}
      {s.target_mean && s.high_52w && s.low_52w && (
        <Card title="Analyst Price Target">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="relative h-2 bg-zinc-100 rounded-full">
                <div className="absolute h-full bg-indigo-500/30 rounded-full" style={{
                  left: `${Math.max(0, (s.target_low - s.low_52w) / (s.high_52w - s.low_52w) * 100)}%`,
                  right: `${Math.max(0, 100 - (s.target_high - s.low_52w) / (s.high_52w - s.low_52w) * 100)}%`,
                }} />
                <div className="absolute w-2 h-2 bg-white rounded-full -top-0" style={{
                  left: `${Math.min(100, Math.max(0, (s.price - s.low_52w) / (s.high_52w - s.low_52w) * 100))}%`,
                }} />
              </div>
              <div className="flex justify-between mt-1 text-[9px] text-zinc-600">
                <span>${s.target_low}</span>
                <span className="text-indigo-600 font-semibold">${s.target_mean} avg</span>
                <span>${s.target_high}</span>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-sm font-bold ${s.target_mean > s.price ? 'text-emerald-600' : 'text-red-600'}`}>
                {((s.target_mean / s.price - 1) * 100).toFixed(1)}% upside
              </div>
              <div className="text-[9px] text-zinc-600">{s.analyst_count} analysts · {s.recommendation}</div>
            </div>
          </div>
        </Card>
      )}

      {/* About */}
      {s.description && (
        <Card title={`About ${s.name}`}>
          <p className="text-xs text-zinc-500 leading-relaxed line-clamp-6">{s.description}</p>
          <div className="flex gap-4 mt-3 text-[10px] text-zinc-500">
            {s.employees && <span>Employees: {s.employees.toLocaleString()}</span>}
            {s.country && <span>{s.country}</span>}
            {s.website && <a href={s.website} target="_blank" className="text-indigo-600 hover:underline flex items-center gap-0.5">{s.website.replace('https://', '')} <ExternalLink className="w-2.5 h-2.5" /></a>}
          </div>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// RATINGS TAB
// ═══════════════════════════════════════════
function RatingsTab({ data }) {
  const s = data.summary;
  const rs = data.ratings_summary || {};
  const recs = data.recommendations || [];

  // Build ratings bar from current month
  const currentRating = rs["0m"] || rs["0M"] || Object.values(rs)[0] || {};
  const total = (currentRating.strong_buy || 0) + (currentRating.buy || 0) + (currentRating.hold || 0) + (currentRating.sell || 0) + (currentRating.strong_sell || 0);

  return (
    <div className="space-y-5">
      {/* Wall Street Consensus */}
      <Card title="Wall Street Consensus">
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-zinc-900 capitalize">{s.recommendation || '—'}</div>
            <div className="text-xs text-zinc-500 mt-1">Mean: {s.recommendation_mean || '—'}</div>
          </div>
          {total > 0 && (
            <div className="flex-1">
              <div className="flex h-6 rounded-lg overflow-hidden">
                {[
                  { key: 'strong_buy', color: '#22c55e', label: 'Strong Buy' },
                  { key: 'buy', color: '#4ade80', label: 'Buy' },
                  { key: 'hold', color: '#f59e0b', label: 'Hold' },
                  { key: 'sell', color: '#f87171', label: 'Sell' },
                  { key: 'strong_sell', color: '#ef4444', label: 'Strong Sell' },
                ].map(({ key, color }) => {
                  const val = currentRating[key] || 0;
                  if (val === 0) return null;
                  return <div key={key} style={{ width: `${(val / total) * 100}%`, background: color }} className="flex items-center justify-center text-[9px] font-bold text-black">{val}</div>;
                })}
              </div>
              <div className="flex justify-between mt-1 text-[8px] text-zinc-500">
                <span>Strong Buy</span><span>Buy</span><span>Hold</span><span>Sell</span><span>Strong Sell</span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Price Target */}
      {s.target_mean && (
        <Card title="Price Target">
          <div className="grid grid-cols-4 gap-3 text-center">
            <div><div className="text-[9px] text-zinc-500">Low</div><div className="text-sm font-bold text-red-600">${s.target_low}</div></div>
            <div><div className="text-[9px] text-zinc-500">Average</div><div className="text-sm font-bold text-indigo-600">${s.target_mean}</div></div>
            <div><div className="text-[9px] text-zinc-500">High</div><div className="text-sm font-bold text-emerald-600">${s.target_high}</div></div>
            <div><div className="text-[9px] text-zinc-500">Current</div><div className="text-sm font-bold text-zinc-900">${s.price}</div></div>
          </div>
        </Card>
      )}

      {/* Recent Analyst Actions */}
      {recs.length > 0 && (
        <Card title="Recent Analyst Ratings">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-zinc-200/80 text-zinc-500">
                <th className="text-left py-2 px-2 font-medium">Date</th>
                <th className="text-left py-2 px-2 font-medium">Firm</th>
                <th className="text-left py-2 px-2 font-medium">Action</th>
                <th className="text-left py-2 px-2 font-medium">From</th>
                <th className="text-left py-2 px-2 font-medium">To</th>
              </tr></thead>
              <tbody>
                {recs.map((r, i) => (
                  <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="py-1.5 px-2 text-zinc-500">{r.date}</td>
                    <td className="py-1.5 px-2 text-zinc-600">{r.firm}</td>
                    <td className="py-1.5 px-2 text-zinc-500">{r.action}</td>
                    <td className="py-1.5 px-2 text-zinc-500">{r.from_grade || '—'}</td>
                    <td className="py-1.5 px-2 text-zinc-900 font-medium">{r.to_grade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// FINANCIALS TAB
// ═══════════════════════════════════════════
function FinancialsTab({ data }) {
  const [stmt, setStmt] = useState('income');
  const [period, setPeriod] = useState('annual');

  const stmtMap = {
    income: { annual: data.financials_annual, quarterly: data.financials_quarterly },
    balance: { annual: data.balance_sheet_annual, quarterly: data.balance_sheet_quarterly },
    cashflow: { annual: data.cashflow_annual, quarterly: data.cashflow_quarterly },
  };
  const items = stmtMap[stmt]?.[period] || [];

  const fieldMap = {
    income: ['Total Revenue', 'Cost Of Revenue', 'Gross Profit', 'Operating Income', 'Net Income', 'EBITDA', 'Operating Expense', 'Research And Development', 'Interest Expense', 'Tax Provision', 'Diluted EPS', 'Basic EPS'],
    balance: ['Total Assets', 'Total Liabilities Net Minority Interest', 'Total Equity Gross Minority Interest', 'Cash And Cash Equivalents', 'Current Assets', 'Current Liabilities', 'Total Debt', 'Net Debt', 'Stockholders Equity', 'Working Capital', 'Invested Capital'],
    cashflow: ['Operating Cash Flow', 'Capital Expenditure', 'Free Cash Flow', 'Investing Cash Flow', 'Financing Cash Flow', 'Repurchase Of Capital Stock', 'Issuance Of Debt', 'Repayment Of Debt', 'Cash Dividends Paid'],
  };

  const fields = fieldMap[stmt] || [];
  const available = fields.filter(f => items.some(row => row[f] != null));

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-center">
        <div className="flex gap-1">
          {[{ id: 'income', label: 'Income' }, { id: 'balance', label: 'Balance Sheet' }, { id: 'cashflow', label: 'Cash Flow' }].map(s => (
            <button key={s.id} onClick={() => setStmt(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${stmt === s.id ? 'bg-indigo-500/20 text-indigo-700' : 'text-zinc-500 hover:text-zinc-600'}`}>{s.label}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {['annual', 'quarterly'].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${period === p ? 'bg-indigo-100 text-indigo-900' : 'text-zinc-500 hover:text-zinc-600'}`}>{p === 'annual' ? 'Annual' : 'Quarterly'}</button>
          ))}
        </div>
      </div>
      {items.length === 0 ? <div className="text-zinc-600 text-sm py-8 text-center">No data available</div> : (
        <div className="bg-zinc-50/90 shadow-sm ring-1 ring-zinc-200/70 rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-200/80">
              <th className="text-left py-2.5 px-3 text-zinc-500 font-medium sticky left-0 bg-zinc-100 z-10">Metric</th>
              {items.map((r, i) => <th key={i} className="text-right py-2.5 px-3 text-zinc-500 font-medium whitespace-nowrap">{r.period?.slice(0, 7)}</th>)}
            </tr></thead>
            <tbody>
              {available.map(f => (
                <tr key={f} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="py-2 px-3 text-zinc-500 sticky left-0 bg-white z-10 font-medium whitespace-nowrap">{f}</td>
                  {items.map((r, i) => <td key={i} className="py-2 px-3 text-right text-zinc-600 font-mono whitespace-nowrap">{r[f] != null ? fmtLarge(r[f]) : '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// EARNINGS TAB
// ═══════════════════════════════════════════
function EarningsTab({ data }) {
  const items = data.earnings_history || [];
  const rc = data.revenue_chart || [];
  return (
    <div className="space-y-5">
      {rc.length > 0 && (
        <Card title="Revenue & Net Income Trend">
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={rc}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" />
              <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#444' }} />
              <YAxis tick={{ fontSize: 9, fill: '#444' }} tickFormatter={v => fmtLarge(v)} width={60} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="revenue" fill="#6366f140" name="Revenue" radius={[3, 3, 0, 0]} />
              <Line type="monotone" dataKey="net_income" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} name="Net Income" />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      )}
      {items.length === 0 ? <div className="text-zinc-600 text-sm py-8 text-center">No earnings data</div> : (
        <Card title="Earnings History">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-200/80 text-zinc-500">
              <th className="text-left py-2 px-2 font-medium">Date</th>
              <th className="text-right py-2 px-2 font-medium">EPS Est</th>
              <th className="text-right py-2 px-2 font-medium">EPS Actual</th>
              <th className="text-right py-2 px-2 font-medium">Surprise</th>
            </tr></thead>
            <tbody>
              {items.map((e, i) => {
                const est = e['EPS Estimate'], actual = e['Reported EPS'], surp = e['Surprise(%)'];
                return (
                  <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="py-2 px-2 text-zinc-600">{e.date}</td>
                    <td className="py-2 px-2 text-right text-zinc-500">{est != null ? `$${fmtNum(est)}` : '—'}</td>
                    <td className="py-2 px-2 text-right text-zinc-700 font-medium">{actual != null ? `$${fmtNum(actual)}` : '—'}</td>
                    <td className="py-2 px-2 text-right">{surp != null ? <span className={surp >= 0 ? 'text-emerald-600' : 'text-red-600'}>{surp > 0 ? '+' : ''}{fmtNum(surp, 1)}%</span> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// DIVIDENDS TAB
// ═══════════════════════════════════════════
function DividendsTab({ data }) {
  const s = data.summary;
  const dg = data.dividend_growth || {};
  const divs = data.dividends || [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Annual Dividend', value: s.dividend_rate ? `$${fmtNum(s.dividend_rate)}` : '—' },
          { label: 'Yield', value: s.dividend_yield_pct ? `${s.dividend_yield_pct}%` : '—' },
          { label: 'Payout Ratio', value: s.payout_ratio ? `${(s.payout_ratio * 100).toFixed(1)}%` : '—' },
          { label: 'YoY Growth', value: dg.yoy != null ? `${dg.yoy > 0 ? '+' : ''}${dg.yoy.toFixed(1)}%` : '—' },
          { label: 'Consec. Years', value: dg.consecutive_years ?? '—' },
        ].map((item, i) => (
          <div key={i} className="bg-zinc-50/90 shadow-sm ring-1 ring-zinc-200/70 rounded-xl p-3 text-center">
            <div className="text-[9px] text-zinc-500 uppercase tracking-wider">{item.label}</div>
            <div className="text-sm font-bold text-zinc-900 mt-1">{item.value}</div>
          </div>
        ))}
      </div>
      {(dg.cagr_3y != null || dg.cagr_5y != null) && (
        <Card title="Dividend Growth Rates">
          <Stat label="3-Year CAGR" value={dg.cagr_3y != null ? `${dg.cagr_3y.toFixed(1)}%` : '—'} />
          <Stat label="5-Year CAGR" value={dg.cagr_5y != null ? `${dg.cagr_5y.toFixed(1)}%` : '—'} />
        </Card>
      )}
      {divs.length > 0 && (
        <Card title="Dividend History">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={divs}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" />
              <XAxis dataKey="date" tick={{ fontSize: 8, fill: '#444' }} interval={Math.max(0, Math.floor(divs.length / 8))} />
              <YAxis tick={{ fontSize: 9, fill: '#444' }} tickFormatter={v => `$${v}`} width={40} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="amount" fill="#6366f1" radius={[3, 3, 0, 0]} name="Dividend" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// RISK TAB
// ═══════════════════════════════════════════
function RiskTab({ data }) {
  const rm = data.risk_metrics || {};
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Sharpe Ratio', value: rm.sharpe_ratio, good: rm.sharpe_ratio >= 1 },
          { label: 'Sortino Ratio', value: rm.sortino_ratio, good: rm.sortino_ratio >= 1 },
          { label: 'Max Drawdown', value: rm.max_drawdown != null ? `${rm.max_drawdown.toFixed(1)}%` : '—', good: false },
          { label: 'Volatility (Ann)', value: rm.volatility_annual != null ? `${rm.volatility_annual}%` : '—' },
          { label: 'VaR (95%)', value: rm.var_95 != null ? `${rm.var_95.toFixed(2)}%` : '—' },
        ].map((item, i) => (
          <div key={i} className="bg-zinc-50/90 shadow-sm ring-1 ring-zinc-200/70 rounded-xl p-3 text-center">
            <div className="text-[9px] text-zinc-500 uppercase tracking-wider">{item.label}</div>
            <div className={`text-sm font-bold mt-1 ${item.good === true ? 'text-emerald-600' : item.good === false ? 'text-red-600' : 'text-zinc-900'}`}>
              {typeof item.value === 'number' ? fmtNum(item.value, 3) : item.value}
            </div>
          </div>
        ))}
      </div>
      <Card title="Performance">
        {rm.performance && Object.entries(rm.performance).map(([k, v]) => (
          <Stat key={k} label={k} value={fmtPct(v)} color={v >= 0 ? 'text-emerald-600' : 'text-red-600'} />
        ))}
        <Stat label="Beta" value={fmtNum(rm.beta)} />
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════
// OWNERSHIP TAB
// ═══════════════════════════════════════════
function OwnershipTab({ data }) {
  const o = data.ownership || {};
  const ins = data.insider_transactions || [];
  const inst = data.institutional_holders || [];
  const funds = data.fund_holders || [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Insider Ownership', value: o.insider_pct != null ? `${o.insider_pct}%` : '—' },
          { label: 'Institutional', value: o.institution_pct != null ? `${o.institution_pct}%` : '—' },
          { label: 'Short % Float', value: o.short_pct_float != null ? `${o.short_pct_float}%` : '—' },
          { label: 'Short Ratio', value: o.short_ratio ? fmtNum(o.short_ratio, 1) : '—' },
        ].map((item, i) => (
          <div key={i} className="bg-zinc-50/90 shadow-sm ring-1 ring-zinc-200/70 rounded-xl p-3 text-center">
            <div className="text-[9px] text-zinc-500 uppercase tracking-wider">{item.label}</div>
            <div className="text-sm font-bold text-zinc-900 mt-1">{item.value}</div>
          </div>
        ))}
      </div>

      {inst.length > 0 && (
        <Card title="Top Institutional Holders">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-200/80 text-zinc-500">
              <th className="text-left py-2 px-2 font-medium">Holder</th>
              <th className="text-right py-2 px-2 font-medium">Shares</th>
              <th className="text-right py-2 px-2 font-medium">% Out</th>
              <th className="text-right py-2 px-2 font-medium">Value</th>
            </tr></thead>
            <tbody>
              {inst.map((h, i) => (
                <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="py-1.5 px-2 text-zinc-600 max-w-[200px] truncate">{h.holder}</td>
                  <td className="py-1.5 px-2 text-right text-zinc-500">{h.shares ? Number(h.shares).toLocaleString() : '—'}</td>
                  <td className="py-1.5 px-2 text-right text-zinc-500">{h.pct_out != null ? `${(h.pct_out * 100).toFixed(2)}%` : '—'}</td>
                  <td className="py-1.5 px-2 text-right text-zinc-600">{h.value ? fmtLarge(h.value) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {funds.length > 0 && (
        <Card title="Top Mutual Fund Holders">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-200/80 text-zinc-500">
              <th className="text-left py-2 px-2 font-medium">Fund</th>
              <th className="text-right py-2 px-2 font-medium">Shares</th>
              <th className="text-right py-2 px-2 font-medium">% Out</th>
            </tr></thead>
            <tbody>
              {funds.map((h, i) => (
                <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="py-1.5 px-2 text-zinc-600 max-w-[200px] truncate">{h.holder}</td>
                  <td className="py-1.5 px-2 text-right text-zinc-500">{h.shares ? Number(h.shares).toLocaleString() : '—'}</td>
                  <td className="py-1.5 px-2 text-right text-zinc-500">{h.pct_out != null ? `${(h.pct_out * 100).toFixed(2)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {ins.length > 0 && (
        <Card title="Insider Transactions">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-200/80 text-zinc-500">
              <th className="text-left py-2 px-2 font-medium">Date</th>
              <th className="text-left py-2 px-2 font-medium">Insider</th>
              <th className="text-left py-2 px-2 font-medium">Transaction</th>
              <th className="text-right py-2 px-2 font-medium">Shares</th>
              <th className="text-right py-2 px-2 font-medium">Value</th>
            </tr></thead>
            <tbody>
              {ins.map((t, i) => (
                <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="py-1.5 px-2 text-zinc-500">{t.date?.slice(0, 10)}</td>
                  <td className="py-1.5 px-2 text-zinc-600 max-w-[140px] truncate">{t.insider}</td>
                  <td className="py-1.5 px-2">
                    <span className={`text-[10px] font-medium ${t.transaction?.toLowerCase().includes('sale') ? 'text-red-600' : 'text-emerald-600'}`}>{t.transaction}</span>
                  </td>
                  <td className="py-1.5 px-2 text-right text-zinc-500">{t.shares ? Number(t.shares).toLocaleString() : '—'}</td>
                  <td className="py-1.5 px-2 text-right text-zinc-600">{t.value ? fmtLarge(t.value) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// PEERS TAB
// ═══════════════════════════════════════════
function PeersTab({ data }) {
  const peers = data.peers || [];
  if (peers.length === 0) return <div className="text-zinc-600 text-sm py-8 text-center">No peer data</div>;
  return (
    <Card title="Peer Comparison">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-zinc-200/80 text-zinc-500">
            <th className="text-left py-2 px-3 font-medium">Company</th>
            <th className="text-right py-2 px-3 font-medium">Market Cap</th>
            <th className="text-right py-2 px-3 font-medium">P/E</th>
            <th className="text-right py-2 px-3 font-medium">Div %</th>
            <th className="text-right py-2 px-3 font-medium">Margin</th>
            <th className="text-right py-2 px-3 font-medium">Rev Growth</th>
            <th className="text-right py-2 px-3 font-medium">Beta</th>
          </tr></thead>
          <tbody>
            {peers.map((p, i) => (
              <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                <td className="py-2 px-3"><span className="font-semibold text-zinc-900">{p.symbol}</span> <span className="text-[9px] text-zinc-600 truncate">{p.name}</span></td>
                <td className="py-2 px-3 text-right text-zinc-600">{p.market_cap_fmt || '—'}</td>
                <td className="py-2 px-3 text-right text-zinc-600">{p.pe_ratio ? fmtNum(p.pe_ratio, 1) : '—'}</td>
                <td className="py-2 px-3 text-right text-zinc-600">{p.dividend_yield != null ? `${p.dividend_yield}%` : '—'}</td>
                <td className="py-2 px-3 text-right text-zinc-600">{p.profit_margin != null ? `${p.profit_margin}%` : '—'}</td>
                <td className="py-2 px-3 text-right"><PctSpan value={p.revenue_growth} /></td>
                <td className="py-2 px-3 text-right text-zinc-600">{p.beta ? fmtNum(p.beta) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════
// NEWS TAB
// ═══════════════════════════════════════════
function NewsTab({ data }) {
  const news = data.news || [];
  if (news.length === 0) return <div className="text-zinc-600 text-sm py-8 text-center">No news</div>;
  return (
    <div className="space-y-2">
      {news.map((a, i) => (
        <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
          className="flex gap-3 bg-zinc-50/90 shadow-sm ring-1 ring-zinc-200/70 rounded-xl p-3 hover:bg-zinc-100 hover:ring-zinc-300/80 transition-all group">
          {a.thumbnail && <div className="w-20 h-14 rounded-lg overflow-hidden shrink-0 bg-zinc-100"><img src={a.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" /></div>}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-zinc-700 group-hover:text-zinc-900 line-clamp-2">{a.title}</div>
            <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
              {a.source && <span>{a.source}</span>}
              {a.date && <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{new Date(a.date).toLocaleDateString()}</span>}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════
export default function ResearchPanel() {
  const [symbol, setSymbol] = useState('AAPL');
  const [symbolInput, setSymbolInput] = useState('AAPL');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('summary');

  const loadSymbol = useCallback((sym) => {
    const s = String(sym).trim().toUpperCase();
    setSymbol(s);
    setSymbolInput(s);
    setLoading(true);
    setError(null);
    setData(null);
    setTab('summary');
    fetchResearch(s)
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadSymbol('AAPL'); }, [loadSymbol]);

  useEffect(() => {
    const onAgentTicker = (e) => {
      const { tab, ticker } = e.detail || {};
      if (tab !== 'research' || !ticker) return;
      loadSymbol(ticker);
    };
    window.addEventListener('eq-agent-open-ticker', onAgentTicker);
    return () => window.removeEventListener('eq-agent-open-ticker', onAgentTicker);
  }, [loadSymbol]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const s = symbolInput.trim().toUpperCase();
    if (s) loadSymbol(s);
  };

  const popular = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'JPM', 'V', 'WMT', 'UNH', 'XOM'];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <form onSubmit={handleSubmit} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input type="text" value={symbolInput} onChange={e => setSymbolInput(e.target.value.toUpperCase())}
            placeholder="Search ticker..." className="w-full bg-white rounded-xl pl-10 pr-4 py-2.5 text-zinc-900 text-sm shadow-sm ring-1 ring-zinc-200/70 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </form>
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {popular.map(s => (
            <button key={s} onClick={() => { setSymbolInput(s); loadSymbol(s); }}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium whitespace-nowrap transition-all ${
                symbol === s ? 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200' : 'bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200/60 hover:text-zinc-900'
              }`}>{s}</button>
          ))}
        </div>
      </div>

      {data && (
        <div className="flex gap-0.5 border-b border-zinc-200/80 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-xs font-medium whitespace-nowrap transition-all border-b-2 ${
                tab === t.id ? 'text-indigo-700 border-indigo-500' : 'text-zinc-500 border-transparent hover:text-zinc-800'
              }`}>{t.label}</button>
          ))}
        </div>
      )}

      {loading && <div className="flex items-center justify-center h-48 text-zinc-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...</div>}
      {error && <div className="p-4 rounded-xl bg-red-50 text-red-800 text-sm ring-1 ring-red-200/80">{error}</div>}

      {data && !loading && (
        <>
          {tab === 'summary' && <SummaryTab data={data} />}
          {tab === 'ratings' && <RatingsTab data={data} />}
          {tab === 'financials' && <FinancialsTab data={data} />}
          {tab === 'earnings' && <EarningsTab data={data} />}
          {tab === 'dividends' && <DividendsTab data={data} />}
          {tab === 'risk' && <RiskTab data={data} />}
          {tab === 'ownership' && <OwnershipTab data={data} />}
          {tab === 'peers' && <PeersTab data={data} />}
          {tab === 'news' && <NewsTab data={data} />}
        </>
      )}
    </div>
  );
}

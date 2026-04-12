import { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar,
} from 'recharts';

function StatRow({ label, value, color }) {
  return (
    <div className="flex justify-between py-1 border-b border-zinc-100">
      <span className="text-zinc-500">{label}</span>
      <span className={color || 'text-zinc-700'}>{value ?? '—'}</span>
    </div>
  );
}

function PerfBadge({ label, value }) {
  if (value === undefined) return null;
  const color = value > 0 ? 'text-emerald-600 bg-emerald-500/10' : value < 0 ? 'text-red-600 bg-red-500/10' : 'text-zinc-500 bg-white/5';
  return (
    <div className={`px-2 py-1 rounded-md text-center ${color}`}>
      <div className="text-[9px] text-zinc-500 mb-0.5">{label}</div>
      <div className="text-[11px] font-bold">{value > 0 ? '+' : ''}{value}%</div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-white ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-[10px] shadow-xl">
      <p className="text-zinc-500 mb-1">{label}</p>
      {d?.open !== undefined && (
        <>
          <p className="text-zinc-600">O: ${d.open} &nbsp; H: ${d.high}</p>
          <p className="text-zinc-600">L: ${d.low} &nbsp; C: ${d.close}</p>
        </>
      )}
      {d?.volume !== undefined && (
        <p className="text-zinc-500">Vol: {(d.volume / 1e6).toFixed(1)}M</p>
      )}
    </div>
  );
}

export default function StockDetail({ data }) {
  const [chartRange, setChartRange] = useState('6M');

  const ranges = { '1M': 21, '3M': 63, '6M': 126, '1Y': 252, '2Y': 504 };

  const chartData = useMemo(() => {
    const days = ranges[chartRange] || 126;
    return data.chart.slice(-days);
  }, [data.chart, chartRange]);

  const minPrice = Math.min(...chartData.map(d => d.low));
  const maxPrice = Math.max(...chartData.map(d => d.high));

  const formatMcap = (v) => {
    if (!v) return '—';
    if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    return `$${v}`;
  };

  return (
    <div className="text-[11px] overflow-y-auto max-h-[calc(100vh-320px)]">
      {/* Header */}
      <div className="px-4 pt-3 pb-2">
        <div className="text-lg font-bold text-zinc-900">${data.price}</div>
        <div className="text-zinc-500">{data.name}</div>
        <div className="text-[10px] text-zinc-600">{data.sector} · {data.industry}</div>
      </div>

      {/* Performance badges */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-6 gap-1">
          {Object.entries(data.performance || {}).map(([label, val]) => (
            <PerfBadge key={label} label={label} value={val} />
          ))}
        </div>
      </div>

      {/* Chart range selector */}
      <div className="px-4 flex gap-1 mb-1">
        {Object.keys(ranges).map(r => (
          <button
            key={r}
            onClick={() => setChartRange(r)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
              chartRange === r
                ? 'bg-indigo-500/20 text-indigo-700'
                : 'text-zinc-600 hover:text-zinc-500'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Price chart */}
      <div className="px-2">
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="detailGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" />
            <XAxis dataKey="date" tick={{ fontSize: 8, fill: '#444' }} interval="preserveStartEnd" tickCount={4} />
            <YAxis domain={[minPrice * 0.98, maxPrice * 1.02]} tick={{ fontSize: 8, fill: '#444' }} tickFormatter={v => `$${v.toFixed(0)}`} width={40} />
            <Tooltip content={<CustomTooltip />} />
            {/* SMA overlays */}
            {chartData[0]?.sma_20 !== null && (
              <Area type="monotone" dataKey="sma_20" stroke="#6366f180" strokeWidth={0.5} fill="none" dot={false} />
            )}
            {chartData[0]?.sma_50 !== null && (
              <Area type="monotone" dataKey="sma_50" stroke="#f59e0b60" strokeWidth={0.5} fill="none" dot={false} />
            )}
            <Area type="monotone" dataKey="close" stroke="#6366f1" strokeWidth={1.5} fill="url(#detailGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Volume chart */}
      <div className="px-2">
        <ResponsiveContainer width="100%" height={40}>
          <BarChart data={chartData}>
            <Bar dataKey="volume" fill="#ffffff08" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Valuation */}
      <div className="px-4 py-3 space-y-0.5">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Valuation</div>
        <StatRow label="Market Cap" value={formatMcap(data.market_cap)} />
        <StatRow label="P/E (TTM)" value={data.pe_ratio?.toFixed(1)} />
        <StatRow label="Forward P/E" value={data.forward_pe?.toFixed(1)} />
        <StatRow label="EPS" value={data.eps != null ? `$${data.eps.toFixed(2)}` : '—'} />
        <StatRow label="P/B" value={data.price_to_book?.toFixed(2)} />
        <StatRow label="Div Yield" value={data.dividend_yield ? `${data.dividend_yield}%` : '—'} />
      </div>

      {/* Financials */}
      <div className="px-4 pb-3 space-y-0.5">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Financials</div>
        <StatRow label="Profit Margin" value={data.profit_margin != null ? `${data.profit_margin}%` : '—'} color={data.profit_margin > 0 ? 'text-emerald-600' : 'text-red-600'} />
        <StatRow label="Revenue Growth" value={data.revenue_growth != null ? `${data.revenue_growth}%` : '—'} color={data.revenue_growth > 0 ? 'text-emerald-600' : 'text-red-600'} />
        <StatRow label="Earnings Growth" value={data.earnings_growth != null ? `${data.earnings_growth}%` : '—'} color={data.earnings_growth > 0 ? 'text-emerald-600' : 'text-red-600'} />
        <StatRow label="ROE" value={data.return_on_equity != null ? `${data.return_on_equity}%` : '—'} />
        <StatRow label="D/E Ratio" value={data.debt_to_equity?.toFixed(1)} />
        <StatRow label="Current Ratio" value={data.current_ratio?.toFixed(2)} />
      </div>

      {/* Ownership */}
      <div className="px-4 pb-3 space-y-0.5">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Ownership</div>
        <StatRow label="Insider Own" value={data.insider_pct != null ? `${data.insider_pct}%` : '—'} />
        <StatRow label="Institutional" value={data.institution_pct != null ? `${data.institution_pct}%` : '—'} />
        <StatRow label="Short % Float" value={data.short_pct_float != null ? `${data.short_pct_float}%` : '—'} color={data.short_pct_float > 10 ? 'text-yellow-400' : undefined} />
        <StatRow label="Short Ratio" value={data.short_ratio?.toFixed(1)} />
      </div>

      {/* Price & Technical */}
      <div className="px-4 pb-3 space-y-0.5">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Price & Technical</div>
        <StatRow label="52W High" value={data.high_52w ? `$${data.high_52w}` : '—'} />
        <StatRow label="52W Low" value={data.low_52w ? `$${data.low_52w}` : '—'} />
        <StatRow label="Beta" value={data.beta?.toFixed(2)} />
        <StatRow label="Avg Volume" value={data.avg_volume ? `${(data.avg_volume / 1e6).toFixed(1)}M` : '—'} />
        <StatRow label="Volatility (20D)" value={data.volatility ? `${data.volatility}%` : '—'} />
        <StatRow label="RSI (14)" value={data.rsi} color={data.rsi >= 70 ? 'text-red-600' : data.rsi <= 30 ? 'text-emerald-600' : undefined} />
        <StatRow label="MACD" value={data.macd} color={data.macd_hist > 0 ? 'text-emerald-600' : 'text-red-600'} />
        <StatRow label="MACD Histogram" value={data.macd_hist} color={data.macd_hist > 0 ? 'text-emerald-600' : 'text-red-600'} />
      </div>
    </div>
  );
}

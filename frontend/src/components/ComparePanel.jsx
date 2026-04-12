import { useState } from 'react';
import { Play, Loader2, Plus, X } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-lg px-3 py-2 text-xs shadow-md ring-1 ring-zinc-200/80">
      <p className="text-zinc-500 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: ${p.value?.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

const inputClass = 'w-full bg-zinc-50 rounded-lg px-3 py-2 text-zinc-900 text-sm ring-1 ring-zinc-200/80 focus:outline-none focus:ring-2 focus:ring-indigo-200';
const cardClass = 'bg-white rounded-xl p-4 shadow-sm ring-1 ring-zinc-200/70';

export default function ComparePanel({ strategies, onCompare, results, loading }) {
  const [symbol, setSymbol] = useState('AAPL');
  const [selected, setSelected] = useState(['sma_crossover', 'buy_and_hold']);
  const [period, setPeriod] = useState('max');
  const [capital, setCapital] = useState(100000);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const toggleStrategy = (id) => {
    if (selected.includes(id)) {
      setSelected(selected.filter(s => s !== id));
    } else {
      setSelected([...selected, id]);
    }
  };

  const handleRun = () => {
    onCompare({
      symbol: symbol.toUpperCase(),
      strategies: selected,
      period,
      initial_capital: capital,
      start_date: startDate || null,
      end_date: endDate || null,
    });
  };

  const mergedEquity = [];
  if (results?.length) {
    const maxLen = Math.max(...results.map(r => r.equity_curve.length));
    const step = Math.max(1, Math.floor(maxLen / 500));
    for (let i = 0; i < maxLen; i += step) {
      const point = {};
      results.forEach(r => {
        if (i < r.equity_curve.length) {
          point.date = r.equity_curve[i].date;
          point[r.strategy] = r.equity_curve[i].equity;
        }
      });
      mergedEquity.push(point);
    }
    const lastPoint = {};
    results.forEach(r => {
      const last = r.equity_curve[r.equity_curve.length - 1];
      lastPoint.date = last.date;
      lastPoint[r.strategy] = last.equity;
    });
    if (mergedEquity[mergedEquity.length - 1]?.date !== lastPoint.date) {
      mergedEquity.push(lastPoint);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6">
        <div className="space-y-4">
          <div className={cardClass}>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-2">Symbol</label>
            <input type="text" value={symbol} onChange={e => setSymbol(e.target.value)} className={inputClass} />
          </div>

          <div className={cardClass}>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-2">Data History</label>
            <div className="flex gap-1.5">
              {[
                { value: '1y', label: '1Y' },
                { value: '2y', label: '2Y' },
                { value: '5y', label: '5Y' },
                { value: '10y', label: '10Y' },
                { value: 'max', label: 'MAX' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPeriod(opt.value)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    period === opt.value
                      ? 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200'
                      : 'bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200/60 hover:text-zinc-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className={cardClass}>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-2">Date Range</label>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" placeholder="YYYY-MM-DD" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputClass} />
              <input type="text" placeholder="YYYY-MM-DD" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className={cardClass}>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-2">Initial Capital ($)</label>
            <input type="text" inputMode="decimal" value={capital} onChange={e => setCapital(Number(e.target.value))} className={inputClass} />
          </div>

          <div className={cardClass}>
            <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-3">Strategies to Compare</label>
            <div className="space-y-2">
              {strategies.map(s => (
                <label key={s.id} className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggleStrategy(s.id)} className="accent-indigo-600" />
                  <span className={`text-sm ${selected.includes(s.id) ? 'text-zinc-900' : 'text-zinc-500'} group-hover:text-zinc-800 transition-colors`}>
                    {s.name}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={handleRun}
            disabled={loading || selected.length < 2}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors shadow-sm"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Comparing...</>
            ) : (
              <><Play className="w-4 h-4" /> Compare ({selected.length} strategies)</>
            )}
          </button>
        </div>

        <div className="space-y-4">
          {loading && (
            <div className="flex items-center justify-center h-64 text-zinc-500">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Running comparisons...
            </div>
          )}

          {!loading && !results && (
            <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
              Select strategies and run comparison
            </div>
          )}

          {results && (
            <>
              <div className={cardClass}>
                <h3 className="text-sm font-medium text-zinc-600 mb-4">Equity Curves Comparison</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={mergedEquity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: '#71717a' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: 12, color: '#3f3f46' }}
                      formatter={(value) => {
                        const s = strategies.find(s => s.id === value);
                        return s?.name || value;
                      }}
                    />
                    {results.map((r, i) => (
                      <Line
                        key={r.strategy}
                        type="monotone"
                        dataKey={r.strategy}
                        stroke={COLORS[i % COLORS.length]}
                        strokeWidth={1.5}
                        dot={false}
                        name={r.strategy}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className={`${cardClass} overflow-x-auto`}>
                <h3 className="text-sm font-medium text-zinc-600 mb-4">Performance Comparison</h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-200">
                      <th className="text-left py-2 px-3">Strategy</th>
                      <th className="text-right py-2 px-3">Total %</th>
                      <th className="text-right py-2 px-3">Annual %</th>
                      <th className="text-right py-2 px-3">Sharpe</th>
                      <th className="text-right py-2 px-3">Max DD</th>
                      <th className="text-right py-2 px-3">Win Rate</th>
                      <th className="text-right py-2 px-3">Trades</th>
                      <th className="text-right py-2 px-3">Profit Factor</th>
                      <th className="text-right py-2 px-3">Sortino</th>
                      <th className="text-right py-2 px-3">Calmar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => {
                      const name = strategies.find(s => s.id === r.strategy)?.name || r.strategy;
                      return (
                        <tr key={r.strategy} className="border-b border-zinc-100 hover:bg-zinc-50">
                          <td className="py-2 px-3 font-medium" style={{ color: COLORS[i % COLORS.length] }}>
                            {name}
                          </td>
                          <td className={`py-2 px-3 text-right ${r.total_return_pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {r.total_return_pct}%
                          </td>
                          <td className={`py-2 px-3 text-right ${r.annual_return_pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {r.annual_return_pct}%
                          </td>
                          <td className={`py-2 px-3 text-right ${r.sharpe_ratio >= 1 ? 'text-emerald-600' : 'text-zinc-500'}`}>
                            {r.sharpe_ratio}
                          </td>
                          <td className="py-2 px-3 text-right text-red-600">{r.max_drawdown_pct}%</td>
                          <td className="py-2 px-3 text-right text-zinc-700">{r.win_rate}%</td>
                          <td className="py-2 px-3 text-right text-zinc-500">{r.num_trades}</td>
                          <td className={`py-2 px-3 text-right ${r.profit_factor >= 1.5 ? 'text-emerald-600' : 'text-zinc-500'}`}>
                            {r.profit_factor}
                          </td>
                          <td className="py-2 px-3 text-right text-zinc-500">{r.sortino_ratio}</td>
                          <td className="py-2 px-3 text-right text-zinc-500">{r.calmar_ratio}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

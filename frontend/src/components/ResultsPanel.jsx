import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell,
} from 'recharts';
import { TrendingUp, TrendingDown, Activity, Target, Loader2 } from 'lucide-react';

function MetricCard({ label, value, suffix = '', icon: Icon, positive }) {
  const color = positive === undefined ? 'text-indigo-600'
    : positive ? 'text-emerald-600' : 'text-red-600';
  return (
    <div className="bg-white shadow-sm ring-1 ring-zinc-200/70 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
        {Icon && <Icon className={`w-4 h-4 ${color}`} />}
      </div>
      <div className={`text-xl font-semibold ${color}`}>
        {value}{suffix}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-xs">
      <p className="text-zinc-500 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
}

export default function ResultsPanel({ result, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-zinc-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Running backtest...
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center justify-center h-96 text-zinc-600 text-sm">
        Configure a strategy and run a backtest to see results
      </div>
    );
  }

  const { equity_curve, trades, monthly_returns } = result;

  // Downsample equity curve for performance
  const step = Math.max(1, Math.floor(equity_curve.length / 500));
  const sampledEquity = equity_curve.filter((_, i) => i % step === 0 || i === equity_curve.length - 1);

  return (
    <div className="space-y-4">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard
          label="Total Return"
          value={result.total_return_pct}
          suffix="%"
          icon={result.total_return_pct >= 0 ? TrendingUp : TrendingDown}
          positive={result.total_return_pct >= 0}
        />
        <MetricCard
          label="Annual Return"
          value={result.annual_return_pct}
          suffix="%"
          positive={result.annual_return_pct >= 0}
        />
        <MetricCard
          label="Sharpe Ratio"
          value={result.sharpe_ratio}
          icon={Activity}
          positive={result.sharpe_ratio >= 1}
        />
        <MetricCard
          label="Max Drawdown"
          value={result.max_drawdown_pct}
          suffix="%"
          positive={false}
        />
        <MetricCard
          label="Win Rate"
          value={result.win_rate}
          suffix="%"
          icon={Target}
          positive={result.win_rate >= 50}
        />
        <MetricCard
          label="Trades"
          value={result.num_trades}
        />
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Profit Factor" value={result.profit_factor} positive={result.profit_factor >= 1.5} />
        <MetricCard label="Calmar Ratio" value={result.calmar_ratio} positive={result.calmar_ratio >= 1} />
        <MetricCard label="Sortino Ratio" value={result.sortino_ratio} positive={result.sortino_ratio >= 1} />
        <MetricCard label="Avg Trade" value={result.avg_trade_return_pct} suffix="%" positive={result.avg_trade_return_pct > 0} />
      </div>

      {/* Equity Curve */}
      <div className="bg-white shadow-sm ring-1 ring-zinc-200/70 rounded-xl p-4">
        <h3 className="text-sm font-medium text-zinc-500 mb-4">Equity Curve</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={sampledEquity}>
            <defs>
              <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#666' }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: '#666' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="equity" stroke="#6366f1" fill="url(#eqGrad)" strokeWidth={1.5} name="Equity" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Drawdown Chart */}
      <div className="bg-white shadow-sm ring-1 ring-zinc-200/70 rounded-xl p-4">
        <h3 className="text-sm font-medium text-zinc-500 mb-4">Drawdown</h3>
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={sampledEquity}>
            <defs>
              <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#666' }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: '#666' }} tickFormatter={v => `${v}%`} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="drawdown" stroke="#ef4444" fill="url(#ddGrad)" strokeWidth={1} name="Drawdown %" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly Returns Heatmap */}
      {monthly_returns.length > 0 && (
        <div className="bg-white shadow-sm ring-1 ring-zinc-200/70 rounded-xl p-4">
          <h3 className="text-sm font-medium text-zinc-500 mb-4">Monthly Returns</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthly_returns}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#666' }} interval={Math.max(0, Math.floor(monthly_returns.length / 12))} />
              <YAxis tick={{ fontSize: 10, fill: '#666' }} tickFormatter={v => `${v}%`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="return_pct" name="Return %">
                {monthly_returns.map((entry, i) => (
                  <Cell key={i} fill={entry.return_pct >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent Trades */}
      {trades.length > 0 && (
        <div className="bg-white shadow-sm ring-1 ring-zinc-200/70 rounded-xl p-4">
          <h3 className="text-sm font-medium text-zinc-500 mb-4">
            Trades ({trades.length} total)
          </h3>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-200/80">
                  <th className="text-left py-2 px-2">Date</th>
                  <th className="text-left py-2 px-2">Type</th>
                  <th className="text-right py-2 px-2">Price</th>
                  <th className="text-right py-2 px-2">Shares</th>
                  <th className="text-right py-2 px-2">P&L</th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(-50).map((t, i) => (
                  <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="py-1.5 px-2 text-zinc-500">{t.date}</td>
                    <td className={`py-1.5 px-2 font-medium ${t.type === 'buy' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {t.type.toUpperCase()}
                    </td>
                    <td className="py-1.5 px-2 text-right text-zinc-600">${t.price}</td>
                    <td className="py-1.5 px-2 text-right text-zinc-500">{t.shares}</td>
                    <td className={`py-1.5 px-2 text-right font-medium ${t.pnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {t.pnl !== 0 ? `$${t.pnl.toLocaleString()}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Play, Loader2, Plus, X } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--eq-card)] rounded-lg px-3 py-2 text-xs shadow-md ring-1 ring-[var(--eq-border)]">
      <p className="text-[var(--eq-text3)] mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: ${p.value?.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

const inputClass = 'w-full bg-[var(--eq-card2)] rounded-lg px-3 py-2 text-[var(--eq-text)] text-sm ring-1 ring-[var(--eq-border)] focus:outline-none focus:ring-2 focus:ring-[var(--eq-accent-ring)]';
const cardClass = 'bg-[var(--eq-card)] rounded-xl p-4 shadow-sm ring-1 ring-[var(--eq-border)]';
const BACKTEST_SYMBOL_HINTS = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'TSLA', 'META', 'JPM', 'V', 'WMT', 'UNH', 'XOM',
  'AMD', 'NFLX', 'CRM', 'ADBE', 'ORCL', 'QCOM', 'INTC', 'MU', 'PLTR', 'SHOP', 'COIN', 'SOFI',
  'SPY', 'QQQ', 'IWM', 'DIA', 'TLT', 'GLD', 'SLV', 'USO', 'RY.TO', 'TD.TO', 'SHOP.TO',
]);
const BACKTEST_COMMAND_WORDS = new Set(['BACKTEST', 'COMPARE', 'RUN', 'TEST', 'SIMULATE', 'RSI', 'SMA', 'EMA', 'MACD']);

function parseBacktestCommand(message, strategies) {
  const text = String(message || '');
  const lower = text.toLowerCase();
  const upper = text.toUpperCase();
  const onSymbol = (upper.match(/\b(?:ON|FOR|WITH)\s+([A-Z][A-Z0-9.-]{0,9}(?:\.TO)?)\b/) || [])[1];
  const tickerMatches = upper.match(/\b[A-Z][A-Z0-9.-]{0,9}(?:\.TO)?\b/g) || [];
  const symbol = (onSymbol && !BACKTEST_COMMAND_WORDS.has(onSymbol) ? onSymbol : null)
    || tickerMatches.find((token) => BACKTEST_SYMBOL_HINTS.has(token))
    || null;
  const ids = new Set(['buy_and_hold']);
  const addIf = (needle, id) => {
    if (lower.includes(needle)) ids.add(id);
  };
  addIf('sma', 'sma_crossover');
  addIf('moving average', 'sma_crossover');
  addIf('ema', 'ema_crossover');
  addIf('rsi', 'rsi');
  addIf('macd', 'macd');
  addIf('bollinger', 'bollinger_bands');
  addIf('mean reversion', 'mean_reversion');
  addIf('momentum', 'momentum');

  const available = new Set((strategies || []).map((s) => s.id));
  const selected = [...ids].filter((id) => id === 'buy_and_hold' || available.has(id));
  if (selected.length < 2) selected.push(available.has('sma_crossover') ? 'sma_crossover' : (strategies?.[0]?.id || 'sma_crossover'));

  let period = null;
  if (/\b1\s*y(?:ear)?\b/.test(lower)) period = '1y';
  else if (/\b2\s*y(?:ear)?s?\b/.test(lower)) period = '2y';
  else if (/\b5\s*y(?:ear)?s?\b/.test(lower)) period = '5y';
  else if (/\b10\s*y(?:ear)?s?\b/.test(lower)) period = '10y';
  else if (/\bmax\b|all history|full history/.test(lower)) period = 'max';

  const capitalMatch = lower.match(/\$?\s*([0-9][0-9,]{3,})(?:\s*(?:usd|dollars?))?/);
  const capital = capitalMatch ? Number(capitalMatch[1].replace(/,/g, '')) : null;
  const shouldRun = /\b(backtest|compare|run|test strategy|simulate)\b/.test(lower);

  return {
    symbol,
    selected: [...new Set(selected)].slice(0, 5),
    period,
    capital,
    shouldRun,
  };
}

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

  const runCompare = useCallback((override = {}) => {
    const nextSymbol = String(override.symbol || symbol).toUpperCase();
    const nextSelected = override.selected || selected;
    const nextPeriod = override.period || period;
    const nextCapital = override.capital || capital;
    onCompare({
      symbol: nextSymbol,
      strategies: nextSelected,
      period: nextPeriod,
      initial_capital: nextCapital,
      start_date: startDate || null,
      end_date: endDate || null,
    });
  }, [capital, endDate, onCompare, period, selected, startDate, symbol]);

  const handleRun = () => runCompare();

  useEffect(() => {
    const onAssistantQuery = (e) => {
      const parsed = parseBacktestCommand(e.detail?.message, strategies);
      const nextSymbol = parsed.symbol || symbol;
      const nextSelected = parsed.selected?.length ? parsed.selected : selected;
      const nextPeriod = parsed.period || period;
      const nextCapital = parsed.capital || capital;

      if (parsed.symbol) setSymbol(parsed.symbol);
      if (parsed.selected?.length) setSelected(parsed.selected);
      if (parsed.period) setPeriod(parsed.period);
      if (parsed.capital) setCapital(parsed.capital);

      if (parsed.shouldRun && nextSelected.length >= 2) {
        runCompare({
          symbol: nextSymbol,
          selected: nextSelected,
          period: nextPeriod,
          capital: nextCapital,
        });
      }
    };
    window.addEventListener('eq-backtest-assistant-query', onAssistantQuery);
    return () => window.removeEventListener('eq-backtest-assistant-query', onAssistantQuery);
  }, [capital, period, runCompare, selected, strategies, symbol]);

  const mergedEquity = [];
  // Guard: only use rows that actually carry an equity_curve (a partial/error
  // result row otherwise throws and white-screens the page).
  const validResults = (results || []).filter(r => Array.isArray(r?.equity_curve) && r.equity_curve.length);
  if (validResults.length) {
    const maxLen = Math.max(...validResults.map(r => r.equity_curve.length));
    const step = Math.max(1, Math.floor(maxLen / 500));
    for (let i = 0; i < maxLen; i += step) {
      const point = {};
      validResults.forEach(r => {
        if (i < r.equity_curve.length) {
          point.date = r.equity_curve[i].date;
          point[r.strategy] = r.equity_curve[i].equity;
        }
      });
      mergedEquity.push(point);
    }
    const lastPoint = {};
    validResults.forEach(r => {
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
            <label className="block text-xs text-[var(--eq-text3)] uppercase tracking-wider mb-2">Symbol</label>
            <input type="text" value={symbol} onChange={e => setSymbol(e.target.value)} className={inputClass} />
          </div>

          <div className={cardClass}>
            <label className="block text-xs text-[var(--eq-text3)] uppercase tracking-wider mb-2">Data History</label>
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
                      ? 'bg-[var(--eq-accent-soft)] text-[var(--eq-accent-strong)] ring-1 ring-[var(--eq-accent-ring)]'
                      : 'bg-[var(--eq-card2)] text-[var(--eq-text2)] ring-1 ring-[var(--eq-border)] hover:text-[var(--eq-text)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className={cardClass}>
            <label className="block text-xs text-[var(--eq-text3)] uppercase tracking-wider mb-2">Date Range</label>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" placeholder="YYYY-MM-DD" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputClass} />
              <input type="text" placeholder="YYYY-MM-DD" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className={cardClass}>
            <label className="block text-xs text-[var(--eq-text3)] uppercase tracking-wider mb-2">Initial Capital ($)</label>
            <input type="text" inputMode="decimal" value={capital} onChange={e => setCapital(Number(e.target.value))} className={inputClass} />
          </div>

          <div className={cardClass}>
            <label className="block text-xs text-[var(--eq-text3)] uppercase tracking-wider mb-3">Strategies to Compare</label>
            <div className="space-y-2">
              {strategies.map(s => (
                <label key={s.id} className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggleStrategy(s.id)} className="accent-[var(--eq-accent)]" />
                  <span className={`text-sm ${selected.includes(s.id) ? 'text-[var(--eq-text)]' : 'text-[var(--eq-text3)]'} group-hover:text-[var(--eq-text)] transition-colors`}>
                    {s.name}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={handleRun}
            disabled={loading || selected.length < 2}
            className="w-full flex items-center justify-center gap-2 bg-[var(--eq-accent)] hover:opacity-85 disabled:opacity-50 text-[var(--eq-bg)] font-medium py-3 rounded-xl transition-colors shadow-sm"
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
            <div className="flex items-center justify-center h-64 text-[var(--eq-text3)]">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Running comparisons...
            </div>
          )}

          {!loading && !results && (
            <div className="flex items-center justify-center h-64 text-[var(--eq-text3)] text-sm">
              Select strategies and run comparison
            </div>
          )}

          {results && (
            <>
              <div className={cardClass}>
                <h3 className="text-sm font-medium text-[var(--eq-text2)] mb-4">Equity Curves Comparison</h3>
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
                <h3 className="text-sm font-medium text-[var(--eq-text2)] mb-4">Performance Comparison</h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[var(--eq-text3)] border-b border-[var(--eq-border)]">
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
                        <tr key={r.strategy} className="border-b border-[var(--eq-grid)] hover:bg-[var(--eq-card2)]">
                          <td className="py-2 px-3 font-medium" style={{ color: COLORS[i % COLORS.length] }}>
                            {name}
                          </td>
                          <td className={`py-2 px-3 text-right ${r.total_return_pct >= 0 ? 'text-[var(--eq-gain)]' : 'text-[var(--eq-loss)]'}`}>
                            {r.total_return_pct}%
                          </td>
                          <td className={`py-2 px-3 text-right ${r.annual_return_pct >= 0 ? 'text-[var(--eq-gain)]' : 'text-[var(--eq-loss)]'}`}>
                            {r.annual_return_pct}%
                          </td>
                          <td className={`py-2 px-3 text-right ${r.sharpe_ratio >= 1 ? 'text-[var(--eq-gain)]' : 'text-[var(--eq-text3)]'}`}>
                            {r.sharpe_ratio}
                          </td>
                          <td className="py-2 px-3 text-right text-[var(--eq-loss)]">{r.max_drawdown_pct}%</td>
                          <td className="py-2 px-3 text-right text-[var(--eq-text2)]">{r.win_rate}%</td>
                          <td className="py-2 px-3 text-right text-[var(--eq-text3)]">{r.num_trades}</td>
                          <td className={`py-2 px-3 text-right ${r.profit_factor >= 1.5 ? 'text-[var(--eq-gain)]' : 'text-[var(--eq-text3)]'}`}>
                            {r.profit_factor}
                          </td>
                          <td className="py-2 px-3 text-right text-[var(--eq-text3)]">{r.sortino_ratio}</td>
                          <td className="py-2 px-3 text-right text-[var(--eq-text3)]">{r.calmar_ratio}</td>
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

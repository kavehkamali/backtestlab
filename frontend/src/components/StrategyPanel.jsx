import { useState } from 'react';
import { Play, Loader2 } from 'lucide-react';

const inputClass = 'w-full bg-zinc-50 rounded-lg px-3 py-2 text-zinc-900 text-sm ring-1 ring-zinc-200/80 focus:outline-none focus:ring-2 focus:ring-indigo-200';
const cardClass = 'bg-white rounded-xl p-4 shadow-sm ring-1 ring-zinc-200/70';

export default function StrategyPanel({ strategies, onRun, loading }) {
  const [symbol, setSymbol] = useState('AAPL');
  const [strategy, setStrategy] = useState('sma_crossover');
  const [period, setPeriod] = useState('max');
  const [capital, setCapital] = useState(100000);
  const [commission, setCommission] = useState(0.1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [params, setParams] = useState({});

  const selected = strategies.find(s => s.id === strategy);

  const handleStrategyChange = (id) => {
    setStrategy(id);
    const strat = strategies.find(s => s.id === id);
    const defaults = {};
    (strat?.params || []).forEach(p => { defaults[p.name] = p.default; });
    setParams(defaults);
  };

  const handleRun = () => {
    onRun({
      symbol: symbol.toUpperCase(),
      strategy,
      period,
      initial_capital: capital,
      commission_pct: commission / 100,
      start_date: startDate || null,
      end_date: endDate || null,
      params,
    });
  };

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-2">
          Symbol
        </label>
        <input
          type="text"
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
          className={inputClass}
          placeholder="AAPL, MSFT, TSLA..."
        />
      </div>

      <div className={cardClass}>
        <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-2">
          Data History
        </label>
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
        <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-2">
          Strategy
        </label>
        <select
          value={strategy}
          onChange={e => handleStrategyChange(e.target.value)}
          className={`${inputClass} appearance-none`}
        >
          {strategies.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {selected && (
          <p className="mt-2 text-xs text-zinc-500">{selected.description}</p>
        )}
      </div>

      {selected?.params?.length > 0 && (
        <div className={`${cardClass} space-y-3`}>
          <label className="block text-xs text-zinc-500 uppercase tracking-wider">
            Parameters
          </label>
          {selected.params.map(p => (
            <div key={p.name}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-600">{p.name.replace(/_/g, ' ')}</span>
                <span className="text-indigo-600">{params[p.name] ?? p.default}</span>
              </div>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.type === 'float' ? 0.1 : 1}
                value={params[p.name] ?? p.default}
                onChange={e => setParams({
                  ...params,
                  [p.name]: p.type === 'float' ? parseFloat(e.target.value) : parseInt(e.target.value),
                })}
                className="w-full accent-indigo-600 h-1"
              />
            </div>
          ))}
        </div>
      )}

      <div className={cardClass}>
        <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-2">
          Date Range (optional)
        </label>
        <div className="grid grid-cols-2 gap-2">
          <input type="text" placeholder="YYYY-MM-DD" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputClass} />
          <input type="text" placeholder="YYYY-MM-DD" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className={`${cardClass} space-y-3`}>
        <div>
          <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1">
            Initial Capital ($)
          </label>
          <input type="text" inputMode="decimal" value={capital} onChange={e => setCapital(Number(e.target.value))} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1">
            Commission (%)
          </label>
          <input type="text" inputMode="decimal" step="0.01" value={commission} onChange={e => setCommission(Number(e.target.value))} className={inputClass} />
        </div>
      </div>

      <button
        onClick={handleRun}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors shadow-sm"
      >
        {loading ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Running...</>
        ) : (
          <><Play className="w-4 h-4" /> Run Backtest</>
        )}
      </button>
    </div>
  );
}

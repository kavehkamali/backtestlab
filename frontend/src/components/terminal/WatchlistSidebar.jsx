import { useState, useEffect } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import { fetchWatchlistPrices } from '../../api';
import { useTerminal } from './TerminalContext';

function MiniSpark({ data, width = 40, height = 16 }) {
  if (!data?.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`).join(' ');
  return (
    <svg width={width} height={height}>
      <polyline fill="none" stroke={data[data.length - 1] >= data[0] ? '#22c55e' : '#ef4444'} strokeWidth="1" points={pts} />
    </svg>
  );
}

export default function WatchlistSidebar() {
  const { state, dispatch } = useTerminal();
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [addInput, setAddInput] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (state.watchlist.length === 0) return;
    let cancelled = false;
    setLoading(true);
    fetchWatchlistPrices(state.watchlist)
      .then(d => {
        if (cancelled) return;
        const map = {};
        d.prices.forEach(p => { map[p.symbol] = p; });
        setPrices(map);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [state.watchlist.join(',')]);

  // Refresh every 30s
  useEffect(() => {
    const timer = setInterval(() => {
      if (state.watchlist.length === 0) return;
      fetchWatchlistPrices(state.watchlist)
        .then(d => {
          const map = {};
          d.prices.forEach(p => { map[p.symbol] = p; });
          setPrices(map);
        })
        .catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [state.watchlist.join(',')]);

  const handleAdd = (e) => {
    e.preventDefault();
    const sym = addInput.trim().toUpperCase();
    if (sym) {
      dispatch({ type: 'ADD_TO_WATCHLIST', symbol: sym });
      setAddInput('');
      setAdding(false);
    }
  };

  const handleClick = (symbol) => {
    dispatch({ type: 'SET_SYMBOL', pane: state.focusedPane, symbol });
  };

  const focusedSymbol = state.panes[state.focusedPane]?.symbol;

  return (
    <div className="flex flex-col h-full bg-zinc-50 border-r border-zinc-200/80">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200/80">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Watchlist</span>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-zinc-600" />}
      </div>

      <div className="flex-1 overflow-y-auto">
        {state.watchlist.map(sym => {
          const p = prices[sym];
          const active = sym === focusedSymbol;
          return (
            <div
              key={sym}
              onClick={() => handleClick(sym)}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors group ${
                active ? 'bg-indigo-500/10' : 'hover:bg-zinc-50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-zinc-900">{sym}</div>
                {p ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-zinc-500">${p.price}</span>
                    <span className={`text-[10px] font-mono ${p.change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {p.change > 0 ? '+' : ''}{p.change}%
                    </span>
                  </div>
                ) : (
                  <div className="text-[10px] text-zinc-600">Loading...</div>
                )}
              </div>
              {p?.sparkline && <MiniSpark data={p.sparkline} />}
              <button
                onClick={e => { e.stopPropagation(); dispatch({ type: 'REMOVE_FROM_WATCHLIST', symbol: sym }); }}
                className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-600 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add symbol */}
      <div className="border-t border-zinc-200/80 p-2">
        {adding ? (
          <form onSubmit={handleAdd} className="flex gap-1">
            <input type="text" value={addInput} onChange={e => setAddInput(e.target.value)}
              autoFocus placeholder="AAPL"
              className="flex-1 bg-white ring-1 ring-zinc-200/80 rounded px-2 py-1 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-indigo-300/80" />
            <button type="submit" className="px-2 py-1 bg-indigo-600 rounded text-xs text-white">Add</button>
          </form>
        ) : (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1 w-full px-2 py-1.5 rounded text-[10px] text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors">
            <Plus className="w-3 h-3" /> Add Symbol
          </button>
        )}
      </div>
    </div>
  );
}

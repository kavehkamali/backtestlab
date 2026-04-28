import { useEffect, useCallback } from 'react';
import { TerminalProvider, useTerminal } from './TerminalContext';
import CandlestickChart from './CandlestickChart';
import AiInsightPanel from './AiInsightPanel';
import WatchlistSidebar from './WatchlistSidebar';
import {
  LayoutGrid, Brain, List, Calculator, Minus,
  Square, Grid2x2, Grid3x3,
} from 'lucide-react';

// Intraday (15m) is used only for 1D; other ranges use daily/weekly bars for Yahoo limits and clarity.
const TIMEFRAMES = [
  { label: '1D', timeframe: '5d', interval: '15m' },
  { label: '1W', timeframe: '1mo', interval: '1d' },
  { label: '1M', timeframe: '1mo', interval: '1d' },
  { label: '3M', timeframe: '3mo', interval: '1d' },
  { label: '6M', timeframe: '6mo', interval: '1d' },
  { label: '1Y', timeframe: '1y', interval: '1d' },
  { label: '2Y', timeframe: '2y', interval: '1d' },
  { label: '5Y', timeframe: '5y', interval: '1wk' },
];

const INDICATORS = [
  { id: 'sma_20', label: 'SMA 20', group: 'overlay' },
  { id: 'sma_50', label: 'SMA 50', group: 'overlay' },
  { id: 'sma_200', label: 'SMA 200', group: 'overlay' },
  { id: 'ema_12', label: 'EMA 12', group: 'overlay' },
  { id: 'ema_26', label: 'EMA 26', group: 'overlay' },
  { id: 'bollinger', label: 'Bollinger', group: 'overlay' },
  { id: 'volume', label: 'Volume', group: 'overlay' },
];

const LAYOUTS = [
  { n: 1, icon: Square, label: '1 Chart' },
  { n: 2, icon: Minus, label: '2 Charts' },
  { n: 4, icon: Grid2x2, label: '4 Charts' },
  { n: 6, icon: Grid3x3, label: '6 Charts' },
];

function TerminalInner({ embedded = false, symbol }) {
  const { state, dispatch } = useTerminal();
  const focusedPane = state.panes[state.focusedPane] || state.panes[0];

  // Grid layout classes
  const gridStyle = {
    1: { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' },
    2: { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr' },
    4: { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' },
    6: { gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr 1fr' },
  }[state.layout] || { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' };

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'a' || e.key === 'A') {
      dispatch({ type: 'TOGGLE_AI_PANEL' });
    } else if (e.key === 'w' || e.key === 'W') {
      dispatch({ type: 'TOGGLE_WATCHLIST' });
    } else if (e.key >= '1' && e.key <= '4') {
      const layouts = [1, 2, 4, 6];
      const idx = parseInt(e.key) - 1;
      if (layouts[idx]) dispatch({ type: 'SET_LAYOUT', value: layouts[idx] });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      dispatch({ type: 'SET_FOCUSED_PANE', value: (state.focusedPane + 1) % state.layout });
    }
  }, [dispatch, state.focusedPane, state.layout]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const onAgentTicker = (e) => {
      const { tab, ticker } = e.detail || {};
      if (tab !== 'terminal' || !ticker) return;
      const sym = String(ticker).trim().toUpperCase();
      dispatch({ type: 'SET_SYMBOL', pane: state.focusedPane, symbol: sym });
    };
    window.addEventListener('eq-agent-open-ticker', onAgentTicker);
    return () => window.removeEventListener('eq-agent-open-ticker', onAgentTicker);
  }, [dispatch, state.focusedPane]);

  useEffect(() => {
    const sym = String(symbol || '').trim().toUpperCase();
    if (!sym) return;
    dispatch({ type: 'SET_SYMBOL', pane: state.focusedPane, symbol: sym });
  }, [dispatch, state.focusedPane, symbol]);

  const outerStyle = embedded
    ? { display: 'flex', flexDirection: 'column', minHeight: 520, height: 'calc(100vh - 14rem)', maxHeight: 920 }
    : { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)' };

  return (
    <div style={outerStyle}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-zinc-50 border-b border-zinc-200/80 shrink-0 overflow-x-auto no-scrollbar dark:bg-zinc-950 dark:border-zinc-800">
        {/* Timeframe buttons */}
        <div className="flex gap-0.5">
          {TIMEFRAMES.map(tf => {
            const active = focusedPane.timeframe === tf.timeframe && focusedPane.interval === tf.interval;
            return (
              <button key={tf.label} onClick={() => dispatch({
                type: 'SET_TIMEFRAME', pane: state.focusedPane,
                timeframe: tf.timeframe, interval: tf.interval,
              })}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                  active ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}>
                {tf.label}
              </button>
            );
          })}
        </div>

        <div className="w-px h-5 bg-zinc-200/60 dark:bg-zinc-700" />

        {/* Indicator toggles */}
        <div className="flex gap-0.5">
          {INDICATORS.map(ind => {
            const active = state.activeIndicators.includes(ind.id);
            return (
              <button key={ind.id} onClick={() => dispatch({ type: 'TOGGLE_INDICATOR', indicator: ind.id })}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                  active ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-600 hover:text-zinc-500 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}>
                {ind.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* Layout buttons */}
        <div className="flex gap-0.5">
          {LAYOUTS.map(l => (
            <button key={l.n} onClick={() => dispatch({ type: 'SET_LAYOUT', value: l.n })} title={l.label}
              className={`p-1.5 rounded transition-all ${
                state.layout === l.n ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-600 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}>
              <l.icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-zinc-200/60 dark:bg-zinc-700" />

        {/* Panel toggles */}
        <button onClick={() => dispatch({ type: 'TOGGLE_WATCHLIST' })} title="Watchlist (W)"
          className={`p-1.5 rounded transition-all ${state.showWatchlist ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-600 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-200'}`}>
          <List className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => dispatch({ type: 'TOGGLE_AI_PANEL' })} title="AI Insight (A)"
          className={`p-1.5 rounded transition-all ${state.showAiPanel ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-600 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-200'}`}>
          <Brain className="w-3.5 h-3.5" />
        </button>

        {/* Shortcut hint */}
        <span className="text-[9px] text-zinc-700 ml-1 dark:text-zinc-400">Keys: 1-4 layout · W watch · A ai · Tab focus</span>
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Watchlist — hidden on mobile */}
        {state.showWatchlist && (
          <div className="hidden sm:block" style={{ width: 176, flexShrink: 0, height: '100%' }}>
            <WatchlistSidebar />
          </div>
        )}

        {/* Chart grid */}
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'grid', gap: 4, padding: 4, ...gridStyle }}>
          {state.panes.slice(0, state.layout).map((pane, i) => (
            <div key={i} style={{ overflow: 'hidden', minHeight: 0, minWidth: 0, position: 'relative' }} onClick={() => dispatch({ type: 'SET_FOCUSED_PANE', value: i })}>
              <CandlestickChart
                symbol={pane.symbol}
                timeframe={pane.timeframe}
                interval={pane.interval}
                indicators={state.activeIndicators}
                focused={state.focusedPane === i}
                onSymbolChange={(sym) => dispatch({ type: 'SET_SYMBOL', pane: i, symbol: sym })}
              />
            </div>
          ))}
        </div>

        {/* AI Panel — hidden on mobile */}
        {state.showAiPanel && (
          <div className="hidden md:block border-l border-zinc-200/80 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950" style={{ width: 288, flexShrink: 0, height: '100%', overflow: 'auto' }}>
            <AiInsightPanel
              symbol={focusedPane.symbol}
              timeframe={focusedPane.timeframe}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function TerminalPanel({ embedded = false, symbol }) {
  return (
    <TerminalProvider>
      <TerminalInner embedded={embedded} symbol={symbol} />
    </TerminalProvider>
  );
}

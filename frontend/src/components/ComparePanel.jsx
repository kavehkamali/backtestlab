import { useCallback, useEffect, useMemo, useState } from 'react';
import { Play, Loader2, FlaskConical, CheckCircle2, AlertTriangle, XCircle, Info, Radar } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, AreaChart, Area, ReferenceLine,
} from 'recharts';
import { chartTheme, tooltipStyle, isDarkMode, onThemeChange } from '../uiTheme';
import { scanStrategyFit, fetchScreenerLists } from '../api';

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
  const addIf = (needle, id) => { if (lower.includes(needle)) ids.add(id); };
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

  return { symbol, selected: [...new Set(selected)].slice(0, 5), period, capital, shouldRun };
}

const fmt$ = (v) => (v == null ? '—' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
const fmtPct = (v, sign = true) => (v == null ? '—' : `${sign && v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`);
const tone = (v) => (v > 0 ? 'eq-gain' : v < 0 ? 'eq-loss' : 'text-[var(--eq-text2)]');

function StatTile({ label, value, sub, cls }) {
  return (
    <div className="min-w-0">
      <div className="eq-label !text-[9.5px]">{label}</div>
      <div className={`eq-num mt-1 truncate text-[15px] font-bold ${cls || 'text-[var(--eq-text)]'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-[var(--eq-text3)]">{sub}</div>}
    </div>
  );
}

/** Verdict banner — honest scientific assessment of the winner. */
function Verdict({ result }) {
  if (!result?.verdict) return null;
  const good = result.significant && (result.out_of_sample?.sharpe_ratio ?? 0) > 0;
  const bad = /curve-fit|no statistically|too few/i.test(result.verdict);
  const Icon = good ? CheckCircle2 : bad ? XCircle : AlertTriangle;
  const colors = good
    ? 'border-[var(--eq-gain)]/25 bg-[var(--eq-gain-soft)] text-[var(--eq-gain)]'
    : bad
      ? 'border-[var(--eq-loss)]/25 bg-[var(--eq-loss-soft)] text-[var(--eq-loss)]'
      : 'border-[var(--eq-warn)]/25 bg-[var(--eq-warn)]/10 text-[var(--eq-warn)]';
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border p-3.5 ${colors}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold">Statistical verdict — {result.strategyName}</div>
        <div className="mt-0.5 text-[11.5px] opacity-90">{result.verdict}</div>
      </div>
    </div>
  );
}

/** Monthly returns heatmap: years × months grid. */
function MonthlyHeatmap({ monthly }) {
  const grid = useMemo(() => {
    const byYear = {};
    for (const m of monthly || []) {
      const [y, mo] = String(m.month).split('-');
      (byYear[y] = byYear[y] || {})[Number(mo)] = m.return_pct;
    }
    return Object.entries(byYear).sort((a, b) => b[0] - a[0]).slice(0, 10);
  }, [monthly]);
  if (!grid.length) return null;
  const cell = (v) => {
    if (v == null) return { background: 'transparent' };
    const a = Math.min(1, Math.abs(v) / 12);
    return {
      background: v >= 0 ? `color-mix(in srgb, var(--eq-gain) ${Math.round(a * 55)}%, transparent)` : `color-mix(in srgb, var(--eq-loss) ${Math.round(a * 55)}%, transparent)`,
    };
  };
  const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  return (
    <div className="overflow-x-auto">
      <table className="eq-num w-full text-[10px]" style={{ borderCollapse: 'separate', borderSpacing: 2 }}>
        <thead>
          <tr>
            <th className="pr-1 text-left font-medium text-[var(--eq-text3)]" />
            {MONTHS.map((m, i) => <th key={i} className="w-[7.5%] text-center font-medium text-[var(--eq-text3)]">{m}</th>)}
          </tr>
        </thead>
        <tbody>
          {grid.map(([year, months]) => (
            <tr key={year}>
              <td className="pr-1 text-[var(--eq-text3)]">{year}</td>
              {MONTHS.map((_, i) => {
                const v = months[i + 1];
                return (
                  <td key={i} className="rounded text-center" style={cell(v)} title={v != null ? `${year}-${String(i + 1).padStart(2, '0')}: ${v}%` : ''}>
                    <span className={`${v == null ? 'text-transparent' : Math.abs(v) > 8 ? 'font-semibold text-[var(--eq-text)]' : 'text-[var(--eq-text2)]'}`}>
                      {v != null ? Math.round(v) : '·'}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Where does this strategy work? Sweep a universe, rank by edge over B&H. */
function FitScanner({ strategies, onPick }) {
  const SCANNABLE = ['composite', 'regime_trend', 'sma_crossover', 'ema_crossover', 'rsi', 'macd', 'bollinger_bands', 'mean_reversion', 'momentum'];
  const [strategy, setStrategy] = useState('composite');
  const [listId, setListId] = useState('sp500');
  const [period, setPeriod] = useState('2y');
  const [lists, setLists] = useState([]);
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { fetchScreenerLists().then((d) => setLists(d.lists || [])).catch(() => {}); }, []);

  const run = async () => {
    setBusy(true); setErr('');
    try {
      const d = await scanStrategyFit({ strategy, list_id: listId, period, top: 30 });
      setRows(d.rows || []);
    } catch (e) { setErr(e.message); setRows(null); }
    finally { setBusy(false); }
  };

  const opts = strategies.filter((s) => SCANNABLE.includes(s.id));
  const selCls = 'eq-input !w-auto !py-1.5 !text-[11.5px]';

  return (
    <div className="eq-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="eq-label flex items-center gap-1.5"><Radar className="h-3.5 w-3.5" /> Fit scanner</h3>
        <span className="text-[10.5px] text-[var(--eq-text3)]">sweep a universe to find the assets this strategy actually works on — then run the full test on the winners</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={strategy} onChange={(e) => setStrategy(e.target.value)} className={selCls}>
          {opts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={listId} onChange={(e) => setListId(e.target.value)} className={selCls}>
          {(lists.length ? lists : [{ id: 'sp500', name: 'S&P 500' }]).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <div className="eq-seg">
          {['1y', '2y', '5y'].map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className="eq-seg-item" data-on={period === p}>{p.toUpperCase()}</button>
          ))}
        </div>
        <button onClick={run} disabled={busy} className="eq-btn eq-btn-primary !py-1.5 disabled:opacity-40">
          {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning…</> : 'Scan universe'}
        </button>
        {err && <span className="text-[11px] text-[var(--eq-loss)]">{err}</span>}
      </div>
      {rows && (
        <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-[var(--eq-border)]">
          <table className="eq-table eq-num !text-[11px]">
            <thead className="sticky top-0">
              <tr>
                <th>Symbol</th><th className="!text-right">Strategy</th><th className="!text-right">Buy&Hold</th>
                <th className="!text-right">Edge</th><th className="!text-right">Sharpe Δ</th>
                <th className="!text-right">DD (strat/bh)</th><th className="!text-right">Vol</th><th className="!text-right">Trades</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol} className="cursor-pointer" onClick={() => onPick?.(r.symbol, strategy)} title="Run the full backtest on this symbol">
                  <td className="font-semibold text-[var(--eq-accent)]">{r.symbol}</td>
                  <td className={`!text-right ${tone(r.strategy_return_pct)}`}>{fmtPct(r.strategy_return_pct)}</td>
                  <td className={`!text-right ${tone(r.bh_return_pct)}`}>{fmtPct(r.bh_return_pct)}</td>
                  <td className={`!text-right font-semibold ${tone(r.edge_pct)}`}>{fmtPct(r.edge_pct)}</td>
                  <td className={`!text-right ${tone(r.sharpe_edge)}`}>{r.sharpe_edge > 0 ? '+' : ''}{r.sharpe_edge}</td>
                  <td className="!text-right">{r.strategy_maxdd_pct}% / {r.bh_maxdd_pct}%</td>
                  <td className="!text-right">{r.volatility_pct}%</td>
                  <td className="!text-right">{r.trades}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="!text-center text-[var(--eq-text3)]">No rows — try a wider universe or period</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="mt-2 text-[10px] leading-relaxed text-[var(--eq-text3)]">
          Ranked by risk-adjusted edge (Sharpe Δ) over buy & hold. High-volatility, cyclical names reward trend/ensemble methods; smooth one-way trends favor holding. Click a row to run the full scientific backtest.
        </div>
      )}
    </div>
  );
}


export default function ComparePanel({ strategies, onCompare, results, loading, benchmark: benchmarkProp }) {
  const [symbol, setSymbol] = useState('AAPL');
  const [selected, setSelected] = useState(['sma_crossover', 'buy_and_hold']);
  const [period, setPeriod] = useState('max');
  const [capital, setCapital] = useState(100000);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [focusIdx, setFocusIdx] = useState(0);
  const [dark, setDark] = useState(isDarkMode());
  useEffect(() => onThemeChange(setDark), []);
  const t = chartTheme(dark);

  const toggleStrategy = (id) => {
    setSelected(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
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
        runCompare({ symbol: nextSymbol, selected: nextSelected, period: nextPeriod, capital: nextCapital });
      }
    };
    window.addEventListener('eq-backtest-assistant-query', onAssistantQuery);
    return () => window.removeEventListener('eq-backtest-assistant-query', onAssistantQuery);
  }, [capital, period, runCompare, selected, strategies, symbol]);

  // ── derived results ──
  const valid = useMemo(() => (results || []).filter((r) => Array.isArray(r?.equity_curve) && r.equity_curve.length)
    .map((r) => ({ ...r, strategyName: (strategies.find((s) => s.id === r.strategy)?.name) || r.strategy })), [results, strategies]);
  const benchRaw = benchmarkProp || results?.benchmark || null;
  const benchmark = benchRaw && Array.isArray(benchRaw.equity_curve) && benchRaw.equity_curve.length ? benchRaw : null;
  // winner = best sharpe among non-buy-hold, fallback best total return
  const ranked = useMemo(() => [...valid].sort((a, b) => (b.sharpe_ratio || 0) - (a.sharpe_ratio || 0)), [valid]);
  const focus = valid[Math.min(focusIdx, valid.length - 1)] || null;
  useEffect(() => {
    if (!valid.length) return;
    const best = valid.findIndex((r) => r.strategy === ranked.find((x) => x.strategy !== 'buy_and_hold')?.strategy);
    setFocusIdx(best >= 0 ? best : 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  const mergedEquity = useMemo(() => {
    if (!valid.length) return [];
    const src = benchmark ? [...valid, { strategy: '__bench', equity_curve: benchmark.equity_curve }] : valid;
    const maxLen = Math.max(...src.map((r) => r.equity_curve.length));
    const step = Math.max(1, Math.floor(maxLen / 500));
    const rows = [];
    for (let i = 0; i < maxLen; i += step) {
      const point = {};
      src.forEach((r) => {
        if (i < r.equity_curve.length) {
          point.date = r.equity_curve[i].date;
          point[r.strategy] = r.equity_curve[i].equity;
        }
      });
      rows.push(point);
    }
    return rows;
  }, [valid, benchmark]);

  const drawdownData = useMemo(() => {
    if (!focus) return [];
    const step = Math.max(1, Math.floor(focus.equity_curve.length / 500));
    return focus.equity_curve.filter((_, i) => i % step === 0).map((e) => ({ date: e.date, dd: e.drawdown }));
  }, [focus]);

  const strategyMeta = (id) => strategies.find((s) => s.id === id);

  return (
    <div className="space-y-4">
      {/* ── header ── */}
      <div className="eq-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--eq-accent-soft)]">
            <FlaskConical className="h-4 w-4 text-[var(--eq-accent)]" strokeWidth={1.8} />
          </span>
          <div>
            <div className="text-[14px] font-semibold tracking-tight text-[var(--eq-text)]">Strategy Lab</div>
            <div className="text-[10.5px] text-[var(--eq-text3)]">Next-bar execution · commissions & slippage included · 70/30 in/out-of-sample split · t-test on trade PnL</div>
          </div>
        </div>
        <button
          onClick={() => runCompare()}
          disabled={loading || selected.length < 2}
          className="flex h-9 items-center gap-2 rounded-lg bg-[var(--eq-text)] px-4 text-[12.5px] font-semibold text-[var(--eq-bg)] transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Running…</> : <><Play className="h-3.5 w-3.5" /> Run backtest</>}
        </button>
      </div>

      <FitScanner strategies={strategies} onPick={(sym, strat) => {
        setSymbol(sym);
        const nextSel = [...new Set([strat, 'buy_and_hold'])];
        setSelected(nextSel);
        runCompare({ symbol: sym, selected: nextSel });
      }} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_1fr]">
        {/* ── config rail ── */}
        <div className="space-y-3">
          <div className="eq-card space-y-4 p-4">
            <div>
              <label className="eq-label mb-1.5 block">Symbol</label>
              <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="eq-input eq-num" />
            </div>
            <div>
              <label className="eq-label mb-1.5 block">History</label>
              <div className="eq-seg w-full">
                {['1y', '2y', '5y', '10y', 'max'].map((p) => (
                  <button key={p} onClick={() => setPeriod(p)} className="eq-seg-item flex-1" data-on={period === p}>{p.toUpperCase()}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="eq-label mb-1.5 block">Date range <span className="normal-case tracking-normal">(optional)</span></label>
              <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="YYYY-MM-DD" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="eq-input eq-num !px-2 !text-[11px]" />
                <input type="text" placeholder="YYYY-MM-DD" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="eq-input eq-num !px-2 !text-[11px]" />
              </div>
            </div>
            <div>
              <label className="eq-label mb-1.5 block">Initial capital</label>
              <input type="text" inputMode="decimal" value={capital} onChange={(e) => setCapital(Number(e.target.value) || 0)} className="eq-input eq-num" />
            </div>
          </div>

          <div className="eq-card p-4">
            <label className="eq-label mb-2.5 block">Strategies</label>
            <div className="space-y-1.5">
              {strategies.map((s) => {
                const on = selected.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStrategy(s.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      on ? 'border-[var(--eq-accent-ring)] bg-[var(--eq-accent-soft)]' : 'border-[var(--eq-border)] hover:border-[var(--eq-border2)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[12px] font-medium ${on ? 'text-[var(--eq-text)]' : 'text-[var(--eq-text2)]'}`}>{s.name}</span>
                      <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${on ? 'border-[var(--eq-accent)] bg-[var(--eq-accent)]' : 'border-[var(--eq-border2)]'}`} />
                    </div>
                    {s.description && <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-[var(--eq-text3)]">{s.description}</div>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="eq-card p-4 text-[10.5px] leading-relaxed text-[var(--eq-text3)]">
            <div className="eq-label mb-1.5">Methodology</div>
            Signals use only data available at each bar; orders fill at the <b className="text-[var(--eq-text2)]">next bar's open</b> with 0.1% commission + 0.05% slippage per side.
            Metrics are split <b className="text-[var(--eq-text2)]">70% in-sample / 30% out-of-sample</b> — an edge that vanishes out-of-sample is curve-fit.
            The t-statistic tests whether mean trade PnL differs from zero; |t| &gt; 2 with ≥ 20 trades ≈ 95% confidence.
          </div>
        </div>

        {/* ── results ── */}
        <div className="min-w-0 space-y-4">
          {loading && (
            <div className="eq-card flex h-64 items-center justify-center text-[var(--eq-text3)]">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Running {selected.length} strategies on {symbol}…
            </div>
          )}

          {!loading && !valid.length && (
            <div className="eq-card flex h-64 flex-col items-center justify-center gap-2 text-[var(--eq-text3)]">
              <FlaskConical className="h-7 w-7 opacity-40" strokeWidth={1.5} />
              <span className="text-sm">Pick at least two strategies and run the experiment</span>
            </div>
          )}

          {!loading && valid.length > 0 && (
            <>
              {focus && <Verdict result={focus} />}

              {/* headline stats: focused strategy vs benchmark */}
              {focus && (
                <div className="eq-card p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="eq-label">{focus.strategyName} — key results</h3>
                    {benchmark && (
                      <span className="eq-num text-[10.5px] text-[var(--eq-text3)]">
                        Buy & hold: <b className={tone(benchmark.total_return_pct)}>{fmtPct(benchmark.total_return_pct)}</b> · Sharpe {benchmark.sharpe_ratio}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-3.5 sm:grid-cols-4 lg:grid-cols-6">
                    <StatTile label="Total return" value={fmtPct(focus.total_return_pct)} cls={tone(focus.total_return_pct)}
                      sub={benchmark ? `${fmtPct(focus.total_return_pct - benchmark.total_return_pct)} vs B&H` : undefined} />
                    <StatTile label="CAGR" value={fmtPct(focus.annual_return_pct)} cls={tone(focus.annual_return_pct)} />
                    <StatTile label="Sharpe" value={focus.sharpe_ratio} cls={focus.sharpe_ratio >= 1 ? 'eq-gain' : undefined} sub={`Sortino ${focus.sortino_ratio}`} />
                    <StatTile label="Max drawdown" value={fmtPct(focus.max_drawdown_pct, false)} cls="eq-loss" sub={`${focus.longest_dd_days || 0}d longest spell`} />
                    <StatTile label="Win rate" value={`${focus.win_rate}%`} sub={`${focus.num_trades} trades`} />
                    <StatTile label="Exposure" value={`${focus.exposure_pct ?? '—'}%`} sub={`vol ${focus.volatility_annual_pct ?? '—'}%`} />
                  </div>
                </div>
              )}

              {/* equity curves + benchmark */}
              <div className="eq-card p-4">
                <h3 className="eq-label mb-3">Equity curves — {symbol} <span className="normal-case tracking-normal">· log scale</span></h3>
                <ResponsiveContainer width="100%" height={330}>
                  <LineChart data={mergedEquity}>
                    <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: t.text }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={60} />
                    <YAxis scale="log" domain={['auto', 'auto']} allowDataOverflow tick={{ fontSize: 10, fill: t.text }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${(v / 1000).toFixed(0)}k`} width={52} />
                    <Tooltip contentStyle={tooltipStyle(dark)} formatter={(v, n) => [fmt$(v), n === '__bench' ? 'Buy & hold' : (strategyMeta(n)?.name || n)]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === '__bench' ? 'Buy & hold (benchmark)' : (strategyMeta(v)?.name || v)} />
                    {benchmark && (
                      <Line type="monotone" dataKey="__bench" stroke={t.text} strokeDasharray="5 4" strokeWidth={1.3} dot={false} />
                    )}
                    {valid.map((r, i) => (
                      <Line key={r.strategy} type="monotone" dataKey={r.strategy} stroke={t.series[i % t.series.length]} strokeWidth={1.6} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* comparison table w/ significance */}
              <div className="eq-card overflow-x-auto p-4">
                <h3 className="eq-label mb-3">All strategies <span className="normal-case tracking-normal">· click a row to inspect</span></h3>
                <table className="eq-table eq-num">
                  <thead>
                    <tr>
                      <th>Strategy</th><th className="!text-right">Total</th><th className="!text-right">CAGR</th>
                      <th className="!text-right">Sharpe</th><th className="!text-right">Max DD</th>
                      <th className="!text-right">Win</th><th className="!text-right">Trades</th>
                      <th className="!text-right">PF</th><th className="!text-right">t-stat</th>
                      <th className="!text-right">OOS Sharpe</th><th className="!text-center">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {valid.map((r, i) => {
                      const oosSharpe = r.out_of_sample?.sharpe_ratio;
                      const focused = focus?.strategy === r.strategy;
                      return (
                        <tr key={r.strategy} onClick={() => setFocusIdx(i)} className={`cursor-pointer ${focused ? '!bg-[var(--eq-accent-soft)]' : ''}`}>
                          <td className="whitespace-nowrap font-medium" style={{ color: t.series[i % t.series.length] }}>{r.strategyName}</td>
                          <td className={`!text-right ${tone(r.total_return_pct)}`}>{fmtPct(r.total_return_pct)}</td>
                          <td className={`!text-right ${tone(r.annual_return_pct)}`}>{fmtPct(r.annual_return_pct)}</td>
                          <td className={`!text-right ${r.sharpe_ratio >= 1 ? 'eq-gain font-semibold' : ''}`}>{r.sharpe_ratio}</td>
                          <td className="!text-right eq-loss">{r.max_drawdown_pct}%</td>
                          <td className="!text-right">{r.win_rate}%</td>
                          <td className="!text-right">{r.num_trades}</td>
                          <td className={`!text-right ${r.profit_factor >= 1.5 ? 'eq-gain' : ''}`}>{r.profit_factor}</td>
                          <td className={`!text-right ${Math.abs(r.t_stat || 0) > 2 ? 'font-semibold text-[var(--eq-text)]' : ''}`}>{r.t_stat ?? '—'}</td>
                          <td className={`!text-right ${oosSharpe != null ? tone(oosSharpe) : ''}`}>{oosSharpe ?? '—'}</td>
                          <td className="!text-center">
                            {r.strategy === 'buy_and_hold' ? <span className="eq-chip">baseline</span>
                              : r.significant && (oosSharpe ?? 0) > 0 ? <span className="eq-chip eq-chip-gain">robust</span>
                              : r.significant ? <span className="eq-chip" style={{ color: 'var(--eq-warn)' }}>in-sample only</span>
                              : <span className="eq-chip eq-chip-loss">weak</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* drawdown + IS/OOS */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="eq-card p-4">
                  <h3 className="eq-label mb-3">Drawdown — {focus?.strategyName}</h3>
                  <ResponsiveContainer width="100%" height={190}>
                    <AreaChart data={drawdownData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 9.5, fill: t.text }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={60} />
                      <YAxis tick={{ fontSize: 9.5, fill: t.text }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={40} />
                      <Tooltip contentStyle={tooltipStyle(dark)} formatter={(v) => [`${v}%`, 'Drawdown']} />
                      <Area type="monotone" dataKey="dd" stroke={t.loss} fill={t.lossSoft} strokeWidth={1.4} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="eq-card p-4">
                  <h3 className="eq-label mb-3">In-sample vs out-of-sample — overfit check</h3>
                  {focus?.in_sample?.sharpe_ratio != null && focus?.out_of_sample?.sharpe_ratio != null ? (
                    <div className="space-y-4">
                      {[['Annual return', 'annual_return_pct', '%'], ['Sharpe ratio', 'sharpe_ratio', ''], ['Max drawdown', 'max_drawdown_pct', '%']].map(([label, key, unit]) => {
                        const a = focus.in_sample[key], b = focus.out_of_sample[key];
                        const mx = Math.max(Math.abs(a), Math.abs(b), 0.001);
                        const bar = (v, name) => (
                          <div className="flex items-center gap-2">
                            <span className="w-9 shrink-0 text-[9.5px] uppercase tracking-wide text-[var(--eq-text3)]">{name}</span>
                            <div className="relative h-[5px] flex-1 rounded-full bg-[var(--eq-grid)]">
                              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(Math.abs(v) / mx) * 100}%`, background: v >= 0 ? 'var(--eq-gain)' : 'var(--eq-loss)', opacity: .85 }} />
                            </div>
                            <span className={`eq-num w-14 shrink-0 text-right text-[11px] font-semibold ${tone(key === 'max_drawdown_pct' ? -1 : v)}`}>{v}{unit}</span>
                          </div>
                        );
                        return (
                          <div key={key}>
                            <div className="mb-1 text-[11px] text-[var(--eq-text2)]">{label}</div>
                            <div className="space-y-1">{bar(a, 'IS')}{bar(b, 'OOS')}</div>
                          </div>
                        );
                      })}
                      <div className="flex items-start gap-1.5 text-[10px] leading-relaxed text-[var(--eq-text3)]">
                        <Info className="mt-0.5 h-3 w-3 shrink-0" />
                        In-sample: {focus.in_sample.start} → {focus.in_sample.end}. Out-of-sample: {focus.out_of_sample.start} → {focus.out_of_sample.end}. A robust edge keeps a similar Sharpe in both windows.
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-xs text-[var(--eq-text3)]">Not enough history for a 70/30 split.</div>
                  )}
                </div>
              </div>

              {/* monthly heatmap + trade quality */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="eq-card p-4">
                  <h3 className="eq-label mb-3">Monthly returns — {focus?.strategyName} <span className="normal-case tracking-normal">(%)</span></h3>
                  <MonthlyHeatmap monthly={focus?.monthly_returns} />
                </div>
                <div className="eq-card p-4">
                  <h3 className="eq-label mb-3">Trade quality — {focus?.strategyName}</h3>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-3.5">
                    <StatTile label="Avg win" value={fmt$(focus?.avg_win)} cls="eq-gain" />
                    <StatTile label="Avg loss" value={fmt$(focus?.avg_loss)} cls="eq-loss" />
                    <StatTile label="Profit factor" value={focus?.profit_factor ?? '—'} />
                    <StatTile label="Best trade" value={fmt$(focus?.best_trade)} cls="eq-gain" />
                    <StatTile label="Worst trade" value={fmt$(focus?.worst_trade)} cls="eq-loss" />
                    <StatTile label="t-statistic" value={focus?.t_stat ?? '—'} cls={Math.abs(focus?.t_stat || 0) > 2 ? 'eq-gain' : undefined} sub="|t|>2 ≈ 95% conf." />
                  </div>
                  {focus?.trades?.length > 0 && (
                    <div className="mt-3 max-h-44 overflow-y-auto rounded-lg border border-[var(--eq-border)]">
                      <table className="eq-table eq-num !text-[11px]">
                        <thead className="sticky top-0"><tr><th>Date</th><th>Side</th><th className="!text-right">Price</th><th className="!text-right">Shares</th><th className="!text-right">PnL</th></tr></thead>
                        <tbody>
                          {[...focus.trades].reverse().slice(0, 40).map((tr, i) => (
                            <tr key={i}>
                              <td>{tr.date}</td>
                              <td><span className={`eq-chip ${tr.type === 'buy' ? 'eq-chip-gain' : ''}`}>{tr.type}</span></td>
                              <td className="!text-right">${tr.price}</td>
                              <td className="!text-right">{tr.shares}</td>
                              <td className={`!text-right ${tone(tr.pnl)}`}>{tr.type === 'buy' ? '—' : fmt$(tr.pnl)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

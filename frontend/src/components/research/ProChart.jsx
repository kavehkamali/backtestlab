import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createChart, CandlestickSeries, AreaSeries, HistogramSeries } from 'lightweight-charts';
import { Loader2, CandlestickChart as CandleIcon, AreaChart as AreaIcon } from 'lucide-react';
import { fetchWarehousePrices, fetchTerminalChart } from '../../api';

// Broker-style timeframe presets: each sets a bar interval + how far back.
// Intraday/weekly/monthly come live from the terminal endpoint; daily uses the
// warehouse (full history) and is aggregated client-side for W/M.
const TFS = [
  { k: '1D', interval: '5m', period: '1d', intraday: true },
  { k: '5D', interval: '15m', period: '5d', intraday: true },
  { k: '1M', interval: '1h', period: '1mo', intraday: true },
  { k: '6M', interval: '1d', days: 126 },
  { k: 'YTD', interval: '1d', ytd: true },
  { k: '1Y', interval: '1d', days: 252 },
  { k: '5Y', interval: '1wk', agg: 'W' },
  { k: 'MAX', interval: '1mo', agg: 'M' },
];

function isDarkTheme() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

function themeOpts(dark, intraday) {
  const grid = dark ? '#1f2937' : '#eef0f3';
  return {
    layout: {
      background: { color: 'transparent' },
      textColor: dark ? '#9ca3af' : '#6b7280',
      fontFamily: "'Geist', 'Inter', -apple-system, sans-serif",
      fontSize: 11, attributionLogo: false,
    },
    grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    crosshair: {
      mode: 1,
      vertLine: { color: dark ? '#4b5563' : '#9ca3af', width: 1, style: 3, labelBackgroundColor: dark ? '#374151' : '#e5e7eb' },
      horzLine: { color: dark ? '#4b5563' : '#9ca3af', width: 1, style: 3, labelBackgroundColor: dark ? '#374151' : '#e5e7eb' },
    },
    rightPriceScale: { borderColor: dark ? '#374151' : '#e5e7eb', scaleMargins: { top: 0.08, bottom: 0.28 } },
    timeScale: { borderColor: dark ? '#374151' : '#e5e7eb', rightOffset: 4, fixLeftEdge: true, timeVisible: !!intraday, secondsVisible: false },
  };
}

const fmtNum = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }));
const fmtVol = (v) => {
  if (v == null) return '—';
  const n = Number(v), a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
};

// Aggregate daily bars into weekly/monthly OHLCV.
function aggregate(daily, unit) {
  const buckets = new Map();
  for (const b of daily) {
    const d = new Date(b.time + 'T00:00:00Z');
    let key;
    if (unit === 'W') { const t = new Date(d); t.setUTCDate(d.getUTCDate() - d.getUTCDay()); key = t.toISOString().slice(0, 10); }
    else key = b.time.slice(0, 7) + '-01';
    const cur = buckets.get(key);
    if (!cur) buckets.set(key, { time: key, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0 });
    else { cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low); cur.close = b.close; cur.volume += b.volume || 0; }
  }
  return [...buckets.values()];
}

export default function ProChart({ symbol, height = 380, defaultType = 'area' }) {
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const mainRef = useRef(null);
  const volRef = useRef(null);
  const [allBars, setAllBars] = useState([]);      // warehouse daily
  const [intradayBars, setIntradayBars] = useState(null); // live, per current tf
  const [loading, setLoading] = useState(true);
  const [tf, setTf] = useState('6M');
  const [type, setType] = useState(defaultType);
  const [dark, setDark] = useState(isDarkTheme());
  const [legend, setLegend] = useState(null);

  const preset = useMemo(() => TFS.find((t) => t.k === tf) || TFS[3], [tf]);

  // Load full daily history once (warehouse first, live fallback).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      let bars = [];
      const wh = await fetchWarehousePrices(symbol);
      if (wh?.available && wh.bars?.length) {
        bars = wh.bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
      } else {
        const live = await fetchTerminalChart(symbol, '5y', '1d').catch(() => null);
        bars = (live?.data || []).map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
      }
      if (!cancelled) { setAllBars(bars.filter((b) => b.close != null)); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [symbol]);

  // Load intraday bars when an intraday timeframe is selected.
  useEffect(() => {
    setIntradayBars(null);
    if (!preset.intraday) return;
    let cancelled = false;
    setLoading(true);
    fetchTerminalChart(symbol, preset.period, preset.interval)
      .then((r) => { if (!cancelled) setIntradayBars((r?.data || []).filter((b) => b.close != null)); })
      .catch(() => { if (!cancelled) setIntradayBars([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, preset]);

  useEffect(() => {
    const onTheme = () => setDark(isDarkTheme());
    window.addEventListener('eq-theme-changed', onTheme);
    return () => window.removeEventListener('eq-theme-changed', onTheme);
  }, []);

  const bars = useMemo(() => {
    if (preset.intraday) {
      return (intradayBars || []).map((b) => ({
        time: typeof b.time === 'number' ? b.time : Math.floor(new Date(b.time).getTime() / 1000),
        open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
      }));
    }
    if (!allBars.length) return [];
    if (preset.agg) return aggregate(allBars, preset.agg);
    if (preset.ytd) {
      const y = new Date().getFullYear();
      const f = allBars.filter((b) => Number(String(b.time).slice(0, 4)) === y);
      return f.length ? f : allBars.slice(-126);
    }
    return preset.days ? allBars.slice(-preset.days) : allBars;
  }, [allBars, intradayBars, preset]);

  const up = bars.length > 1 && bars[bars.length - 1].close >= bars[0].close;
  const lineColor = up ? '#10b981' : '#f43f5e';

  const buildChart = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !bars.length) return;
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    const chart = createChart(el, { width: el.clientWidth, height, ...themeOpts(dark, preset.intraday) });
    chartRef.current = chart;

    if (type === 'candles') {
      const s = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981', downColor: '#f43f5e', borderUpColor: '#10b981',
        borderDownColor: '#f43f5e', wickUpColor: '#10b98199', wickDownColor: '#f43f5e99',
      });
      s.setData(bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
      mainRef.current = s;
    } else {
      const s = chart.addSeries(AreaSeries, {
        lineColor, topColor: up ? '#10b98140' : '#f43f5e40', bottomColor: up ? '#10b98100' : '#f43f5e00',
        lineWidth: 2, priceLineVisible: false,
      });
      s.setData(bars.map((b) => ({ time: b.time, value: b.close })));
      mainRef.current = s;
    }

    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(bars.map((b) => ({ time: b.time, value: b.volume || 0, color: dark ? '#374151' : '#e5e7eb' })));
    volRef.current = vol;
    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((p) => {
      if (!p?.time || !p.seriesData?.size) { setLegend(null); return; }
      const md = p.seriesData.get(mainRef.current);
      const vd = p.seriesData.get(volRef.current);
      setLegend({ close: md?.close ?? md?.value, open: md?.open, high: md?.high, low: md?.low, volume: vd?.value });
    });
  }, [bars, type, dark, height, lineColor, up, preset.intraday]);

  useEffect(() => { buildChart(); return () => { if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; } }; }, [buildChart]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { if (chartRef.current) chartRef.current.applyOptions({ width: el.clientWidth }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const last = bars[bars.length - 1], first = bars[0];
  const chg = last && first ? ((last.close / first.close - 1) * 100) : null;

  return (
    <div className="flex flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {legend ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
            {legend.open != null && <span>O <b className="text-zinc-700 dark:text-zinc-200">{fmtNum(legend.open)}</b></span>}
            {legend.high != null && <span>H <b className="text-zinc-700 dark:text-zinc-200">{fmtNum(legend.high)}</b></span>}
            {legend.low != null && <span>L <b className="text-zinc-700 dark:text-zinc-200">{fmtNum(legend.low)}</b></span>}
            <span>C <b className="text-zinc-700 dark:text-zinc-200">{fmtNum(legend.close)}</b></span>
            {legend.volume != null && <span>V <b className="text-zinc-700 dark:text-zinc-200">{fmtVol(legend.volume)}</b></span>}
          </div>
        ) : (
          <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
            {last ? <>Last <b className="text-zinc-800 dark:text-zinc-100">{fmtNum(last.close)}</b> · <span className={chg >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{chg >= 0 ? '+' : ''}{chg?.toFixed(2)}% {tf}</span></> : '—'}
          </div>
        )}
        <div className="flex items-center gap-1">
          <button onClick={() => setType(type === 'area' ? 'candles' : 'area')}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-zinc-500 ring-1 ring-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:text-zinc-100"
            title={type === 'area' ? 'Candlesticks' : 'Area'}>
            {type === 'area' ? <CandleIcon className="h-3.5 w-3.5" /> : <AreaIcon className="h-3.5 w-3.5" />}
          </button>
          <div className="flex flex-wrap rounded-md bg-zinc-100 p-0.5 dark:bg-zinc-800">
            {TFS.map((t) => (
              <button key={t.k} onClick={() => setTf(t.k)}
                className={`h-6 rounded px-1.5 text-[10px] font-semibold transition ${tf === t.k ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}>
                {t.k}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div ref={wrapRef} style={{ height }} className="relative w-full">
        {loading && <div className="absolute inset-0 flex items-center justify-center text-zinc-400"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {!loading && !bars.length && <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">No data for this timeframe</div>}
      </div>
    </div>
  );
}

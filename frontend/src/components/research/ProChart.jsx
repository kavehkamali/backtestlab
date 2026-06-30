import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createChart, CandlestickSeries, AreaSeries, HistogramSeries } from 'lightweight-charts';
import { Loader2, CandlestickChart as CandleIcon, AreaChart as AreaIcon } from 'lucide-react';
import { fetchWarehousePrices, fetchTerminalChart } from '../../api';

const RANGES = [
  { k: '1M', d: 21 }, { k: '3M', d: 63 }, { k: '6M', d: 126 },
  { k: 'YTD', ytd: true }, { k: '1Y', d: 252 }, { k: '5Y', d: 1260 }, { k: 'MAX', d: 0 },
];

function isDarkTheme() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

function themeOpts(dark) {
  const grid = dark ? '#1f2937' : '#eef0f3';
  return {
    layout: {
      background: { color: 'transparent' },
      textColor: dark ? '#9ca3af' : '#6b7280',
      fontFamily: "'Geist', 'Inter', -apple-system, sans-serif",
      fontSize: 11,
      attributionLogo: false,
    },
    grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    crosshair: {
      mode: 1,
      vertLine: { color: dark ? '#4b5563' : '#9ca3af', width: 1, style: 3, labelBackgroundColor: dark ? '#374151' : '#e5e7eb' },
      horzLine: { color: dark ? '#4b5563' : '#9ca3af', width: 1, style: 3, labelBackgroundColor: dark ? '#374151' : '#e5e7eb' },
    },
    rightPriceScale: { borderColor: dark ? '#374151' : '#e5e7eb', scaleMargins: { top: 0.08, bottom: 0.28 } },
    timeScale: { borderColor: dark ? '#374151' : '#e5e7eb', rightOffset: 4, fixLeftEdge: true },
    handleScale: { axisPressedMouseMove: { time: true, price: false } },
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

export default function ProChart({ symbol, height = 380, defaultType = 'area' }) {
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const mainRef = useRef(null);
  const volRef = useRef(null);
  const [allBars, setAllBars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('6M');
  const [type, setType] = useState(defaultType);
  const [dark, setDark] = useState(isDarkTheme());
  const [legend, setLegend] = useState(null);

  // Load full history (warehouse first, live fallback).
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
        const d = live?.data || [];
        bars = d.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
      }
      if (!cancelled) { setAllBars(bars.filter((b) => b.close != null)); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [symbol]);

  useEffect(() => {
    const onTheme = () => setDark(isDarkTheme());
    window.addEventListener('eq-theme-changed', onTheme);
    return () => window.removeEventListener('eq-theme-changed', onTheme);
  }, []);

  const bars = useMemo(() => {
    if (!allBars.length) return [];
    const r = RANGES.find((x) => x.k === range) || RANGES[2];
    if (r.ytd) {
      const y = new Date().getFullYear();
      const f = allBars.filter((b) => Number(String(b.time).slice(0, 4)) === y);
      return f.length ? f : allBars.slice(-126);
    }
    return r.d ? allBars.slice(-r.d) : allBars;
  }, [allBars, range]);

  const up = bars.length > 1 && bars[bars.length - 1].close >= bars[0].close;
  const lineColor = up ? '#10b981' : '#f43f5e';

  const buildChart = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !bars.length) return;
    // tear down previous
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    const chart = createChart(el, { width: el.clientWidth, height, ...themeOpts(dark) });
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

    // volume on its own bottom band
    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(bars.map((b) => ({ time: b.time, value: b.volume || 0, color: dark ? '#374151' : '#e5e7eb' })));
    volRef.current = vol;

    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((p) => {
      if (!p?.time || !p.seriesData?.size) { setLegend(null); return; }
      const md = p.seriesData.get(mainRef.current);
      const vd = p.seriesData.get(volRef.current);
      const close = md?.close ?? md?.value;
      setLegend({ time: p.time, close, open: md?.open, high: md?.high, low: md?.low, volume: vd?.value });
    });
  }, [bars, type, dark, height, lineColor, up]);

  useEffect(() => { buildChart(); return () => { if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; } }; }, [buildChart]);

  // resize
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { if (chartRef.current) chartRef.current.applyOptions({ width: el.clientWidth }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const last = bars[bars.length - 1];
  const first = bars[0];
  const chg = last && first ? ((last.close / first.close - 1) * 100) : null;

  return (
    <div className="flex flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          {legend ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="text-zinc-400">{legend.time}</span>
              {legend.open != null && <span>O <b className="text-zinc-700 dark:text-zinc-200">{fmtNum(legend.open)}</b></span>}
              {legend.high != null && <span>H <b className="text-zinc-700 dark:text-zinc-200">{fmtNum(legend.high)}</b></span>}
              {legend.low != null && <span>L <b className="text-zinc-700 dark:text-zinc-200">{fmtNum(legend.low)}</b></span>}
              <span>C <b className="text-zinc-700 dark:text-zinc-200">{fmtNum(legend.close)}</b></span>
              {legend.volume != null && <span>V <b className="text-zinc-700 dark:text-zinc-200">{fmtVol(legend.volume)}</b></span>}
            </div>
          ) : (
            <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {last ? <>Last <b className="text-zinc-800 dark:text-zinc-100">{fmtNum(last.close)}</b> · <span className={chg >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{chg >= 0 ? '+' : ''}{chg?.toFixed(2)}% {range}</span></> : '—'}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setType(type === 'area' ? 'candles' : 'area')}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-zinc-500 ring-1 ring-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:text-zinc-100"
            title={type === 'area' ? 'Candlesticks' : 'Area'}>
            {type === 'area' ? <CandleIcon className="h-3.5 w-3.5" /> : <AreaIcon className="h-3.5 w-3.5" />}
          </button>
          <div className="flex rounded-md bg-zinc-100 p-0.5 dark:bg-zinc-800">
            {RANGES.map((r) => (
              <button key={r.k} onClick={() => setRange(r.k)}
                className={`h-6 rounded px-1.5 text-[10px] font-semibold transition ${range === r.k ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}>
                {r.k}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div ref={wrapRef} style={{ height }} className="relative w-full">
        {loading && <div className="absolute inset-0 flex items-center justify-center text-zinc-400"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {!loading && !bars.length && <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">No price data</div>}
      </div>
    </div>
  );
}

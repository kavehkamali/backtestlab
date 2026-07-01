import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createChart, CandlestickSeries, AreaSeries, HistogramSeries } from 'lightweight-charts';
import { Loader2, CandlestickChart as CandleIcon, AreaChart as AreaIcon } from 'lucide-react';
import { fetchWarehousePrices, fetchWarehouseIntraday, fetchTerminalChart } from '../../api';

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
  const grid = dark ? 'rgba(250,250,250,0.05)' : 'rgba(9,9,11,0.05)';
  const border = dark ? 'rgba(250,250,250,0.10)' : 'rgba(9,9,11,0.10)';
  const cross = dark ? '#63636b' : '#9d9da6';
  const crossLabel = dark ? '#26262c' : '#e9e9ec';
  return {
    layout: {
      background: { color: 'transparent' },
      textColor: dark ? '#8f8f98' : '#71717a',
      fontFamily: "'Geist Mono', ui-monospace, monospace",
      fontSize: 10.5, attributionLogo: false,
    },
    grid: { vertLines: { color: 'transparent' }, horzLines: { color: grid } },
    crosshair: {
      mode: 1,
      vertLine: { color: cross, width: 1, style: 3, labelBackgroundColor: crossLabel },
      horzLine: { color: cross, width: 1, style: 3, labelBackgroundColor: crossLabel },
    },
    rightPriceScale: { borderColor: border, scaleMargins: { top: 0.08, bottom: 0.28 } },
    timeScale: { borderColor: border, rightOffset: 4, fixLeftEdge: true, timeVisible: !!intraday, secondsVisible: false },
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

  // Load intraday bars when an intraday timeframe is selected — cached warehouse
  // bars first, live terminal feed as fallback.
  useEffect(() => {
    setIntradayBars(null);
    if (!preset.intraday) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const wh = await fetchWarehouseIntraday(symbol, preset.interval);
      if (cancelled) return;
      if (wh?.available && wh.bars?.length) { setIntradayBars(wh.bars); setLoading(false); return; }
      const live = await fetchTerminalChart(symbol, preset.period, preset.interval).catch(() => null);
      if (cancelled) return;
      setIntradayBars((live?.data || []).filter((b) => b.close != null));
      setLoading(false);
    })();
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
  const GAIN = dark ? '#34d399' : '#059669';
  const LOSS = dark ? '#fb7185' : '#e11d48';
  const lineColor = up ? GAIN : LOSS;

  const buildChart = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !bars.length) return;
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    const chart = createChart(el, { width: el.clientWidth, height, ...themeOpts(dark, preset.intraday) });
    chartRef.current = chart;

    if (type === 'candles') {
      const s = chart.addSeries(CandlestickSeries, {
        upColor: GAIN, downColor: LOSS, borderUpColor: GAIN,
        borderDownColor: LOSS, wickUpColor: `${GAIN}99`, wickDownColor: `${LOSS}99`,
      });
      s.setData(bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
      mainRef.current = s;
    } else {
      const s = chart.addSeries(AreaSeries, {
        lineColor, topColor: `${lineColor}36`, bottomColor: `${lineColor}00`,
        lineWidth: 1.8, priceLineVisible: false,
      });
      s.setData(bars.map((b) => ({ time: b.time, value: b.close })));
      mainRef.current = s;
    }

    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(bars.map((b) => ({ time: b.time, value: b.volume || 0, color: b.close >= b.open ? `${GAIN}2e` : `${LOSS}2e` })));
    volRef.current = vol;
    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((p) => {
      if (!p?.time || !p.seriesData?.size) { setLegend(null); return; }
      const md = p.seriesData.get(mainRef.current);
      const vd = p.seriesData.get(volRef.current);
      setLegend({ close: md?.close ?? md?.value, open: md?.open, high: md?.high, low: md?.low, volume: vd?.value });
    });
  }, [bars, type, dark, height, lineColor, GAIN, LOSS, up, preset.intraday]);

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
          <div className="eq-num flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--eq-text3)]">
            {legend.open != null && <span>O <b className="font-semibold text-[var(--eq-text)]">{fmtNum(legend.open)}</b></span>}
            {legend.high != null && <span>H <b className="font-semibold text-[var(--eq-text)]">{fmtNum(legend.high)}</b></span>}
            {legend.low != null && <span>L <b className="font-semibold text-[var(--eq-text)]">{fmtNum(legend.low)}</b></span>}
            <span>C <b className="font-semibold text-[var(--eq-text)]">{fmtNum(legend.close)}</b></span>
            {legend.volume != null && <span>V <b className="font-semibold text-[var(--eq-text)]">{fmtVol(legend.volume)}</b></span>}
          </div>
        ) : (
          <div className="eq-num text-[11px] text-[var(--eq-text3)]">
            {last ? <>Last <b className="font-semibold text-[var(--eq-text)]">{fmtNum(last.close)}</b> · <span className={chg >= 0 ? 'eq-gain' : 'eq-loss'}>{chg >= 0 ? '+' : ''}{chg?.toFixed(2)}% {tf}</span></> : '—'}
          </div>
        )}
        <div className="flex items-center gap-1">
          <button onClick={() => setType(type === 'area' ? 'candles' : 'area')}
            className="eq-btn !px-2 !py-1.5"
            title={type === 'area' ? 'Candlesticks' : 'Area'}>
            {type === 'area' ? <CandleIcon className="h-3.5 w-3.5" /> : <AreaIcon className="h-3.5 w-3.5" />}
          </button>
          <div className="eq-seg flex-wrap">
            {TFS.map((t) => (
              <button key={t.k} onClick={() => setTf(t.k)} className="eq-seg-item" data-on={tf === t.k}>
                {t.k}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div ref={wrapRef} style={{ height }} className="relative w-full">
        {loading && <div className="absolute inset-0 flex items-center justify-center text-[var(--eq-text3)]"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {!loading && !bars.length && <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--eq-text3)]">No data for this timeframe</div>}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
} from 'lightweight-charts';
import { fetchTerminalChart, fetchTerminalIndicators } from '../../api';
import { Loader2 } from 'lucide-react';

const INDICATOR_COLORS = {
  sma_20: '#6366f1',
  sma_50: '#f59e0b',
  sma_200: '#ef4444',
  ema_12: '#06b6d4',
  ema_26: '#8b5cf6',
  bb_upper: '#a1a1aa',
  bb_lower: '#a1a1aa',
  bb_middle: '#71717a',
};

function chartThemeLayout(isDark) {
  if (isDark) {
    return {
      layout: {
        background: { color: '#18181b' },
        textColor: '#a1a1aa',
        fontFamily: "'Inter', -apple-system, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#27272a' },
        horzLines: { color: '#27272a' },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: '#52525b', labelBackgroundColor: '#27272a' },
        horzLine: { color: '#52525b', labelBackgroundColor: '#27272a' },
      },
      rightPriceScale: {
        borderColor: '#3f3f46',
        scaleMargins: { top: 0.05, bottom: 0.12 },
      },
      timeScale: {
        borderColor: '#3f3f46',
      },
    };
  }
  return {
    layout: {
      background: { color: '#fafafa' },
      textColor: '#52525b',
      fontFamily: "'Inter', -apple-system, sans-serif",
      fontSize: 11,
    },
    grid: {
      vertLines: { color: '#e4e4e7' },
      horzLines: { color: '#e4e4e7' },
    },
    crosshair: {
      mode: 0,
      vertLine: { color: '#a1a1aa', labelBackgroundColor: '#f4f4f5' },
      horzLine: { color: '#a1a1aa', labelBackgroundColor: '#f4f4f5' },
    },
    rightPriceScale: {
      borderColor: '#e4e4e7',
      scaleMargins: { top: 0.05, bottom: 0.12 },
    },
    timeScale: {
      borderColor: '#e4e4e7',
    },
  };
}

export default function CandlestickChart({ symbol, timeframe, interval, indicators, focused, onSymbolChange }) {
  const wrapperRef = useRef(null);
  const chartRef = useRef(null);
  const candleRef = useRef(null);
  const extraRef = useRef([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [symbolInput, setSymbolInput] = useState(symbol);
  const [ready, setReady] = useState(false);
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => { setSymbolInput(symbol); }, [symbol]);

  useEffect(() => {
    const onTheme = () => setThemeTick((n) => n + 1);
    window.addEventListener('eq-theme-changed', onTheme);
    return () => window.removeEventListener('eq-theme-changed', onTheme);
  }, []);

  // Create chart
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    let attempts = 0;
    let timer;

    const tryInit = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if ((w === 0 || h === 0) && attempts < 30) {
        attempts++;
        timer = setTimeout(tryInit, 50);
        return;
      }

      try {
        const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
        const theme = chartThemeLayout(isDark);
        const chart = createChart(el, {
          width: w || 600,
          height: h || 400,
          ...theme,
          timeScale: {
            ...theme.timeScale,
            timeVisible: !['1d', '1wk', '1mo'].includes(interval),
          },
        });

        // v5 API: chart.addSeries(SeriesDefinition, options)
        const candles = chart.addSeries(CandlestickSeries, {
          upColor: '#22c55e',
          downColor: '#ef4444',
          borderUpColor: '#22c55e',
          borderDownColor: '#ef4444',
          wickUpColor: '#22c55e80',
          wickDownColor: '#ef444480',
        });

        chartRef.current = chart;
        candleRef.current = candles;

        const ro = new ResizeObserver(entries => {
          for (const entry of entries) {
            const { width, height } = entry.contentRect;
            if (width > 0 && height > 0) chart.resize(width, height);
          }
        });
        ro.observe(el);
        el._cleanup_ro = ro;

        setReady(true);
      } catch (err) {
        console.error('Chart init error:', err);
        setError('Chart init failed: ' + err.message);
      }
    };

    tryInit();

    return () => {
      clearTimeout(timer);
      setReady(false);
      if (el._cleanup_ro) { el._cleanup_ro.disconnect(); delete el._cleanup_ro; }
      if (chartRef.current) {
        try { chartRef.current.remove(); } catch {}
        chartRef.current = null;
        candleRef.current = null;
        extraRef.current = [];
      }
    };
  }, [interval]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    const theme = chartThemeLayout(isDark);
    chart.applyOptions({
      ...theme,
      timeScale: {
        ...theme.timeScale,
        timeVisible: !['1d', '1wk', '1mo'].includes(interval),
      },
    });
  }, [themeTick, ready, interval]);

  // Load data
  useEffect(() => {
    if (!ready || !chartRef.current || !candleRef.current) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [chartRes, indRes] = await Promise.all([
          fetchTerminalChart(symbol, timeframe, interval),
          fetchTerminalIndicators(symbol, timeframe, interval, indicators.join(',')),
        ]);
        if (cancelled) return;

        const chart = chartRef.current;
        const candles = candleRef.current;
        if (!chart || !candles) return;

        candles.setData(chartRes.data);

        // Remove old extras
        for (const s of extraRef.current) {
          try { chart.removeSeries(s); } catch {}
        }
        extraRef.current = [];

        const indData = indRes.indicators || {};

        // Volume
        if (indData.volume) {
          const vs = chart.addSeries(HistogramSeries, {
            priceScaleId: 'vol',
            priceFormat: { type: 'volume' },
          });
          chart.priceScale('vol').applyOptions({
            scaleMargins: { top: 0.85, bottom: 0 },
          });
          vs.setData(indData.volume);
          extraRef.current.push(vs);
        }

        // Line overlays
        for (const [key, data] of Object.entries(indData)) {
          if (key === 'volume' || key === 'rsi' || key.startsWith('macd')) continue;
          if (!data || data.length === 0) continue;
          const color = INDICATOR_COLORS[key] || '#a1a1aa';
          const ls = chart.addSeries(LineSeries, {
            color,
            lineWidth: key.startsWith('bb_') ? 1 : 2,
            lineStyle: key.startsWith('bb_') ? 2 : 0,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          ls.setData(data);
          extraRef.current.push(ls);
        }

        chart.timeScale().fitContent();
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [ready, symbol, timeframe, interval, indicators.join(',')]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const s = symbolInput.trim().toUpperCase();
    if (s && s !== symbol) onSymbolChange(s);
  };

  void themeTick;
  const chromeDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  return (
    <div
      className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg border ${
        focused
          ? 'border-zinc-400 shadow-md shadow-zinc-900/10 dark:border-zinc-500 dark:shadow-black/30'
          : 'border-zinc-200 dark:border-zinc-700'
      } bg-[#fafafa] dark:bg-zinc-900`}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900">
        <form onSubmit={handleSubmit}>
          <input
            type="text" value={symbolInput}
            onChange={e => setSymbolInput(e.target.value.toUpperCase())}
            style={{
              width: 70, background: 'transparent', border: 'none',
              color: chromeDark ? '#fafafa' : '#18181b',
              fontSize: 12, fontWeight: 700, outline: 'none', fontFamily: 'inherit',
            }}
            spellCheck={false}
          />
        </form>
        <span
          className={`rounded px-1.5 py-0.5 text-[9px] border ${
            chromeDark
              ? 'border-zinc-600 bg-zinc-800 text-zinc-300'
              : 'border-zinc-200 bg-zinc-100 text-zinc-600'
          }`}
        >
          {interval}
        </span>
        <div className="flex-1" />
        {loading && <Loader2 className={`h-3 w-3 animate-spin ${chromeDark ? 'text-zinc-500' : 'text-zinc-400'}`} />}
      </div>

      {/* Chart container */}
      <div ref={wrapperRef} style={{ flex: 1, minHeight: 0, position: 'relative' }} />

      {/* Error */}
      {error && !loading && (
        <div
          className={`absolute inset-0 z-20 flex items-center justify-center ${
            chromeDark ? 'bg-zinc-900/92' : 'bg-[#fafafa]/92'
          }`}
        >
          <div className="text-center">
            <div className="mb-1 text-xs text-red-500">{error}</div>
            <button
              type="button"
              onClick={() => { setError(null); setReady(false); setTimeout(() => setReady(true), 100); }}
              className="text-[10px] text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

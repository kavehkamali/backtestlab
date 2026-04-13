/**
 * Helpers for overview hero area charts (Markets + Crypto): time-aligned X axis by period.
 */

export const HERO_PERIOD_DAYS = {
  null: 2,
  '1W': 5,
  '1M': 21,
  '3M': 63,
  '6M': 126,
  'YTD': 180,
  '1Y': 252,
  '2Y': 504,
  '5Y': 1260,
  '10Y': 2520,
};

export function pickSparklinePair(item, periodKey) {
  if (!item) return { prices: null, dates: null };
  if (periodKey === null) {
    if (item.sparkline_1d?.length) {
      return {
        prices: item.sparkline_1d,
        dates: item.sparkline_1d_dates || null,
      };
    }
    return {
      prices: item.sparkline,
      dates: item.sparkline_dates || null,
    };
  }
  if (periodKey === '1W') {
    if (item.sparkline_1w?.length) {
      return {
        prices: item.sparkline_1w,
        dates: item.sparkline_1w_dates || null,
      };
    }
    return {
      prices: item.sparkline,
      dates: item.sparkline_dates || null,
    };
  }
  return {
    prices: item.sparkline,
    dates: item.sparkline_dates || null,
  };
}

export function sliceSparkPair(prices, dates, periodKey) {
  if (!prices?.length) return { prices: [], dates: null };
  if (periodKey === '1W' || periodKey === null) {
    const d = dates?.length === prices.length ? dates : null;
    return { prices, dates: d };
  }
  const days = HERO_PERIOD_DAYS[periodKey] ?? 60;
  const n = Math.min(days, prices.length);
  return {
    prices: prices.slice(-n),
    dates: dates?.length === prices.length ? dates.slice(-n) : null,
  };
}

/** Parse backend date / datetime / "YYYY-MM-DD open" label to UTC ms. */
export function parseSparkLabelToMs(label) {
  if (label == null) return null;
  const s = String(label).trim();
  const datePart = s.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!datePart) {
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : null;
  }
  if (s.includes('T')) {
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : null;
  }
  return Date.parse(`${datePart}T12:00:00Z`);
}

export function formatHeroXTick(periodKey, ms) {
  if (ms == null || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  if (periodKey === null) {
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  if (periodKey === '1W' || periodKey === '1M' || periodKey === '3M' || periodKey === '6M' || periodKey === 'YTD') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (periodKey === '1Y') {
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function formatResearchPriceXTick(ms) {
  if (ms == null || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function syntheticTsSeries(n) {
  const DAY = 86400000;
  const end = Date.now();
  return Array.from({ length: n }, (_, i) => end - DAY * (n - 1 - i));
}

/**
 * @returns {{ chartData: Array<{ ts: number, price: number, label: string }>, xTicks: number[] }}
 */
export function buildOverviewHeroChartRows(item, periodKey) {
  const { prices: rawP, dates: rawD } = pickSparklinePair(item, periodKey);
  const { prices, dates } = sliceSparkPair(rawP, rawD, periodKey);
  if (!prices?.length) return { chartData: [], xTicks: [] };

  const fallbackTs = !dates || dates.length !== prices.length ? syntheticTsSeries(prices.length) : null;

  const chartData = prices.map((price, i) => {
    const label = dates?.[i] ?? null;
    const ts = label != null ? parseSparkLabelToMs(label) : fallbackTs[i];
    const safeTs = Number.isFinite(ts) ? ts : fallbackTs[i];
    return {
      price,
      ts: safeTs,
      label: label ?? new Date(safeTs).toISOString().slice(0, 10),
    };
  });

  const maxTicks = periodKey === null ? 4 : periodKey === '1W' ? 5 : 5;
  const xTicks = pickSparseTsTicks(chartData, maxTicks);
  return { chartData, xTicks };
}

function pickSparseTsTicks(chartData, maxTicks) {
  if (!chartData.length) return [];
  if (chartData.length <= maxTicks) return chartData.map((d) => d.ts);
  const out = [];
  const denom = Math.max(maxTicks - 1, 1);
  for (let k = 0; k < maxTicks; k++) {
    const idx = Math.round((k / denom) * (chartData.length - 1));
    out.push(chartData[idx].ts);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

export function buildResearchPriceChartRows(chartRows, maxPoints = 320) {
  if (!chartRows?.length) return { chartData: [], xTicks: [] };
  const step = Math.max(1, Math.floor(chartRows.length / maxPoints));
  const sampled = chartRows.filter((_, i) => i % step === 0 || i === chartRows.length - 1);
  const chartData = sampled.map((row) => {
    const ts = Date.parse(`${row.date}T12:00:00Z`);
    return {
      ...row,
      ts: Number.isFinite(ts) ? ts : 0,
      label: row.date,
    };
  });
  const xTicks = pickSparseTsTicks(chartData, 6);
  return { chartData, xTicks };
}

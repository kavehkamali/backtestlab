import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Brain, Loader2, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchMacroOverview } from '../api';

function fmt(value, suffix = '') {
  if (value == null || Number.isNaN(Number(value))) return '-';
  const n = Number(value);
  if (Math.abs(n) >= 1000) return `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })}${suffix}`;
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}${suffix}`;
}

function changeClass(value) {
  if (value > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-zinc-500 dark:text-zinc-400';
}

function signalStyle(tone) {
  if (tone === 'buy') return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-100';
  if (tone === 'sell') return 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-100';
  return 'border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100';
}

function SignalCard({ item }) {
  const Icon = item.tone === 'sell' ? TrendingDown : item.tone === 'buy' ? TrendingUp : Activity;
  return (
    <div className={`rounded-lg border p-3 ${signalStyle(item.tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide opacity-70">{item.symbol}</div>
          <div className="text-sm font-semibold">{item.asset}</div>
        </div>
        <Icon className="h-4 w-4 shrink-0 opacity-80" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="opacity-60">Short</div>
          <div className="font-semibold">{item.short_term}</div>
        </div>
        <div>
          <div className="opacity-60">Long</div>
          <div className="font-semibold">{item.long_term}</div>
        </div>
      </div>
      <div className="mt-2 text-[11px] leading-snug opacity-75">{item.rationale}</div>
    </div>
  );
}

function mergeSeries(chart) {
  const byDate = new Map();
  for (const series of chart.series || []) {
    for (const point of series.data || []) {
      if (!point?.date) continue;
      const row = byDate.get(point.date) || { date: point.date };
      row[series.key] = point.value;
      byDate.set(point.date, row);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function MacroChart({ chart }) {
  const rows = useMemo(() => mergeSeries(chart), [chart]);
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border border-zinc-200/70 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/75">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{chart.title}</h3>
        <div className="flex flex-wrap gap-3">
          {(chart.series || []).map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" />
            <XAxis
              dataKey="date"
              minTickGap={32}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-zinc-500 dark:text-zinc-400"
            />
            <YAxis
              width={46}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-zinc-500 dark:text-zinc-400"
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: '1px solid rgba(113,113,122,.25)',
                boxShadow: '0 12px 30px rgba(0,0,0,.12)',
              }}
              formatter={(value, name) => [fmt(value), (chart.series || []).find((s) => s.key === name)?.label || name]}
            />
            {(chart.series || []).map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AnalysisText({ text }) {
  const lines = String(text || '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
  return (
    <div className="space-y-3 text-sm leading-6 text-zinc-700 dark:text-zinc-200">
      {lines.map((line, idx) => {
        const isBullet = /^[-\u2022*]\s+/.test(line);
        const clean = line.replace(/^[-\u2022*]\s+/, '');
        return isBullet ? (
          <div key={idx} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-indigo-500" />
            <p>{clean}</p>
          </div>
        ) : (
          <p key={idx}>{clean}</p>
        );
      })}
    </div>
  );
}

function AssetStrip({ assets }) {
  const visible = (assets || []).slice(0, 10);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {visible.map((a) => (
        <div key={a.symbol} className="rounded-lg border border-zinc-200/70 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/75">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">{a.name}</div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{a.symbol}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono text-zinc-700 dark:text-zinc-200">{fmt(a.price)}</div>
              <div className={`text-[11px] font-semibold ${changeClass(a.change_3m)}`}>
                {a.change_3m > 0 ? '+' : ''}{fmt(a.change_3m, '%')}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MacroPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    fetchMacroOverview()
      .then(setData)
      .catch((e) => setError(e.message || 'Failed to load macro data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading macro data and daily agent analysis...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/35 dark:text-red-100">
        <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Macro unavailable</div>
        <p className="mt-1">{error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Macro</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Live macro dashboard with one cached agent analysis per visitor per day.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <Brain className="h-4 w-4 text-indigo-500" />
          <span>{data.analysis?.cached ? "Using today's cached agent view" : 'Fresh agent view generated'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(data.signals || []).map((item) => <SignalCard key={item.asset} item={item} />)}
      </div>

      <AssetStrip assets={data.assets} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {(data.charts || []).map((chart) => <MacroChart key={chart.id} chart={chart} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-lg border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/75">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Agent Macro View</h3>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{data.updated_at}</span>
          </div>
          <AnalysisText text={data.analysis?.text} />
        </div>

        <div className="rounded-lg border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/75">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Macro Headlines</h3>
          <div className="space-y-3">
            {(data.news || []).slice(0, 8).map((n, idx) => (
              <a
                key={`${n.symbol}-${idx}`}
                href={n.url || undefined}
                target="_blank"
                rel="noreferrer"
                className="block rounded-md border border-zinc-100 p-3 text-sm hover:border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60"
              >
                <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{n.symbol} {n.publisher ? `/ ${n.publisher}` : ''}</div>
                <div className="mt-1 leading-snug text-zinc-800 dark:text-zinc-100">{n.title}</div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Brain, ChevronDown, Loader2, RefreshCw, SlidersHorizontal, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

function callToneKey(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'buy' || v === 'sell') return v;
  return 'hold';
}

function signalStyle(tone) {
  if (tone === 'buy') return 'border-[var(--eq-gain)]/25 bg-[var(--eq-gain-soft)] text-[var(--eq-text)]';
  if (tone === 'sell') return 'border-[var(--eq-loss)]/25 bg-[var(--eq-loss-soft)] text-[var(--eq-text)]';
  return 'border-amber-200/90 bg-gradient-to-br from-amber-50 to-stone-50 text-amber-950';
}

function callToneClass(value) {
  const v = callToneKey(value);
  if (v === 'buy') return 'bg-[var(--eq-gain-soft)] text-[var(--eq-gain)] ring-[var(--eq-gain)]/25';
  if (v === 'sell') return 'bg-[var(--eq-loss-soft)] text-[var(--eq-loss)] ring-[var(--eq-loss)]/25';
  return 'bg-amber-100 text-amber-800 ring-[var(--eq-warn)]/25';
}

function SignalCard({ item }) {
  const shortTone = callToneKey(item.short_term);
  const Icon = shortTone === 'sell' ? TrendingDown : shortTone === 'buy' ? TrendingUp : Activity;
  return (
    <div className={`rounded-lg border p-3 ${signalStyle(shortTone)}`}>
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
          <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 font-semibold ring-1 ${callToneClass(item.short_term)}`}>{item.short_term}</div>
        </div>
        <div>
          <div className="opacity-60">Long</div>
          <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 font-semibold ring-1 ${callToneClass(item.long_term)}`}>{item.long_term}</div>
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
    <div className="rounded-lg border border-[var(--eq-border)] bg-[var(--eq-card)] p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--eq-text)]">{chart.title}</h3>
          {chart.title?.includes('Indexed') && (
            <p className="mt-0.5 text-[11px] text-[var(--eq-text3)]">Each line starts at 100 so the trend is comparable.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {(chart.series || []).map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--eq-text3)]">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-[var(--eq-grid)]" />
            <XAxis
              dataKey="date"
              minTickGap={32}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-[var(--eq-text3)]"
            />
            <YAxis
              width={46}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-[var(--eq-text3)]"
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

function MacroBarChart({ chart }) {
  const rows = (chart.bars || []).filter((row) => row.value != null);
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border border-[var(--eq-border)] bg-[var(--eq-card)] p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--eq-text)]">{chart.title}</h3>
        <span className="text-[11px] text-[var(--eq-text3)]">{chart.subtitle || '3M % change'}</span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-[var(--eq-grid)]" />
            <XAxis
              dataKey="label"
              interval={0}
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-[var(--eq-text3)]"
            />
            <YAxis
              width={44}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-[var(--eq-text3)]"
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: '1px solid rgba(113,113,122,.25)',
                boxShadow: '0 12px 30px rgba(0,0,0,.12)',
              }}
              formatter={(value) => [`${Number(value).toFixed(2)}%`, '3M']}
            />
            <Bar dataKey="value" radius={[5, 5, 0, 0]}>
              {rows.map((entry) => (
                <Cell key={entry.label} fill={entry.value >= 0 ? entry.color : '#fb7185'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function InlineText({ text }) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx} className="font-semibold text-[var(--eq-text)]">{part.slice(2, -2)}</strong>;
    }
    return <span key={idx}>{part.replace(/\*/g, '')}</span>;
  });
}

function AnalysisText({ text }) {
  const lines = String(text || '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
  return (
    <div className="space-y-3 text-sm leading-6 text-[var(--eq-text2)]">
      {lines.map((line, idx) => {
        const heading = line.replace(/^#{1,4}\s*/, '').replace(/\*\*/g, '');
        const isHeading = /^#{1,4}\s+/.test(line) || (/^[A-Z][A-Za-z /&-]{2,}:$/.test(heading) && heading.length < 48);
        const isBullet = /^([-+\u2022*]|\d+\.)\s+/.test(line);
        const clean = line.replace(/^([-+\u2022*]|\d+\.)\s+/, '').replace(/^#{1,4}\s*/, '');
        if (isHeading) {
          return <h4 key={idx} className="pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--eq-text3)]">{heading.replace(/:$/, '')}</h4>;
        }
        return isBullet ? (
          <div key={idx} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--eq-accent)]" />
            <p><InlineText text={clean} /></p>
          </div>
        ) : (
          <p key={idx}><InlineText text={clean} /></p>
        );
      })}
    </div>
  );
}

const DEFAULT_CHARTS = ['risk', 'hard_assets', 'rates_jobs', 'debt_jobs', 'labor', 'momentum'];

function ChartMenu({ charts, selected, onToggle, onReset }) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => {
    const bucket = {
      Core: [],
      Rates: [],
      Housing: [],
      Global: [],
      Commodities: [],
    };
    for (const chart of charts || []) {
      const title = `${chart.title || ''} ${chart.id || ''}`.toLowerCase();
      if (title.includes('rate') || title.includes('fed') || title.includes('bond') || title.includes('yield')) bucket.Rates.push(chart);
      else if (title.includes('estate') || title.includes('housing') || title.includes('fixed') || title.includes('variable')) bucket.Housing.push(chart);
      else if (title.includes('gdp') || title.includes('global') || title.includes('china') || title.includes('canada') || title.includes('world')) bucket.Global.push(chart);
      else if (title.includes('oil') || title.includes('commodity') || title.includes('gold') || title.includes('crypto') || title.includes('metal')) bucket.Commodities.push(chart);
      else bucket.Core.push(chart);
    }
    return Object.entries(bucket).filter(([, items]) => items.length);
  }, [charts]);

  return (
    <div className="rounded-lg border border-[var(--eq-border)] bg-[var(--eq-card)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--eq-text)]">
          <SlidersHorizontal className="h-4 w-4 text-[var(--eq-accent)]" />
          Macro chart menu
          <span className="rounded-full bg-[var(--eq-accent-soft)] px-2 py-0.5 text-[11px] text-[var(--eq-accent)] ring-1 ring-[var(--eq-accent-ring)]">
            {selected.length} selected
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 text-[var(--eq-text3)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-[var(--eq-border)] p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" onClick={onReset} className="rounded-md bg-[var(--eq-card2)] px-2.5 py-1 text-xs font-medium text-[var(--eq-text2)] hover:bg-[var(--eq-border)]">
              Default
            </button>
            <button
              type="button"
              onClick={() => charts.forEach((chart) => { if (!selected.includes(chart.id)) onToggle(chart.id); })}
              className="rounded-md bg-[var(--eq-gain-soft)] px-2.5 py-1 text-xs font-medium text-[var(--eq-gain)] hover:bg-[var(--eq-gain-soft)]"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => selected.forEach((id) => onToggle(id))}
              className="rounded-md bg-[var(--eq-loss-soft)] px-2.5 py-1 text-xs font-medium text-[var(--eq-loss)] hover:bg-[var(--eq-loss-soft)]"
            >
              Clear
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groups.map(([group, items]) => (
              <div key={group}>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--eq-text3)]">{group}</div>
                <div className="space-y-1.5">
                  {items.map((chart) => {
                    const checked = selected.includes(chart.id);
                    return (
                      <label key={chart.id} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs ring-1 transition ${
                        checked
                          ? 'bg-[var(--eq-accent-soft)] text-[var(--eq-accent-strong)] ring-[var(--eq-accent-ring)]'
                          : 'bg-[var(--eq-card2)] text-[var(--eq-text2)] ring-[var(--eq-border)] hover:bg-[var(--eq-card2)]'
                      }`}>
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-[var(--eq-border2)] text-[var(--eq-accent)] focus:ring-[var(--eq-accent-ring)]"
                          checked={checked}
                          onChange={() => onToggle(chart.id)}
                        />
                        <span className="truncate">{chart.title}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MacroPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCharts, setSelectedCharts] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('eq_macro_charts_v1') || 'null');
      return Array.isArray(saved) && saved.length ? saved : DEFAULT_CHARTS;
    } catch {
      return DEFAULT_CHARTS;
    }
  });

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

  useEffect(() => {
    try {
      localStorage.setItem('eq_macro_charts_v1', JSON.stringify(selectedCharts));
    } catch {}
  }, [selectedCharts]);

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-[var(--eq-text3)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading macro data and daily agent analysis...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-[var(--eq-loss-soft)] p-4 text-sm text-[var(--eq-loss)]">
        <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Macro unavailable</div>
        <p className="mt-1">{error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-[var(--eq-bg)] hover:bg-red-700"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  if (!data) return null;
  const charts = data.charts || [];
  const visibleCharts = charts.filter((chart) => selectedCharts.includes(chart.id));
  const toggleChart = (id) => {
    setSelectedCharts((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-[var(--eq-text)]">Macro</h2>
          <p className="text-sm text-[var(--eq-text3)]">
            Live macro dashboard with one cached agent analysis per visitor per day.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--eq-border)] bg-[var(--eq-card)] px-3 py-2 text-xs text-[var(--eq-text2)]">
          <Brain className="h-4 w-4 text-[var(--eq-accent)]" />
          <span>{data.analysis?.cached ? "Using today's cached agent view" : 'Fresh agent view generated'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(data.signals || []).map((item) => <SignalCard key={item.asset} item={item} />)}
      </div>

      <ChartMenu
        charts={charts}
        selected={selectedCharts}
        onToggle={toggleChart}
        onReset={() => setSelectedCharts(DEFAULT_CHARTS)}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {visibleCharts.map((chart) => (
          chart.type === 'bar' ? <MacroBarChart key={chart.id} chart={chart} /> : <MacroChart key={chart.id} chart={chart} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-lg border border-[var(--eq-border)] bg-[var(--eq-card)] p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[var(--eq-text)]">Agent Macro View</h3>
            <span className="text-[11px] text-[var(--eq-text3)]">{data.updated_at}</span>
          </div>
          <AnalysisText text={data.analysis?.text} />
        </div>

        <div className="rounded-lg border border-[var(--eq-border)] bg-[var(--eq-card)] p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-[var(--eq-text)]">Macro Headlines</h3>
          <div className="space-y-3">
            {(data.news || []).slice(0, 8).map((n, idx) => (
              <a
                key={`${n.symbol}-${idx}`}
                href={n.url || undefined}
                target="_blank"
                rel="noreferrer"
                className="block rounded-md border border-[var(--eq-grid)] p-3 text-sm hover:border-[var(--eq-border)] hover:bg-[var(--eq-card2)]"
              >
                <div className="text-[11px] font-semibold text-[var(--eq-text3)]">{n.symbol} {n.publisher ? `/ ${n.publisher}` : ''}</div>
                <div className="mt-1 leading-snug text-[var(--eq-text)]">{n.title}</div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

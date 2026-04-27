import { useEffect, useMemo, useState } from 'react';
import { Brain, RefreshCw, ShieldAlert, Sparkles, TrendingUp } from 'lucide-react';
import { fetchAiPicks } from '../api';

const toneClasses = {
  emerald: 'bg-emerald-50 ring-emerald-200/70 dark:bg-emerald-950/25 dark:ring-emerald-800/60',
  sky: 'bg-sky-50 ring-sky-200/70 dark:bg-sky-950/25 dark:ring-sky-800/60',
  amber: 'bg-amber-50 ring-amber-200/70 dark:bg-amber-950/25 dark:ring-amber-800/60',
  rose: 'bg-rose-50 ring-rose-200/70 dark:bg-rose-950/25 dark:ring-rose-800/60',
};

const scoreColor = (score) => {
  if (score >= 72) return 'bg-emerald-500';
  if (score >= 62) return 'bg-lime-500';
  if (score >= 54) return 'bg-amber-500';
  return 'bg-zinc-400';
};

function fmtCap(v) {
  if (!v) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v}`;
}

function metric(v, suffix = '') {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  return `${Number(v).toFixed(1)}${suffix}`;
}

function PickCard({ pick, rank, onOpenTicker }) {
  const score = pick?.scores?.overall || 0;
  return (
    <button
      type="button"
      onClick={() => onOpenTicker?.(pick.symbol)}
      className="w-full text-left rounded-lg bg-white/90 p-3 ring-1 ring-zinc-200/70 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition dark:bg-zinc-900/80 dark:ring-zinc-800"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-zinc-500">#{rank}</span>
            <span className="font-semibold text-zinc-950 dark:text-zinc-100">{pick.symbol}</span>
            <span className="text-[10px] text-zinc-500">{pick.country}</span>
          </div>
          <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">{pick.name}</p>
        </div>
        <div className="text-right shrink-0">
          <div className={`ml-auto h-8 w-8 rounded-md ${scoreColor(score)} text-white text-xs font-bold grid place-items-center`}>
            {Math.round(score)}
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-zinc-600 dark:text-zinc-400">
        <span>Q {metric(pick.scores?.quality)}</span>
        <span>M {metric(pick.scores?.momentum)}</span>
        <span>V {metric(pick.scores?.value)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {(pick.reasons || []).slice(0, 4).map((r) => (
          <span key={r} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {r}
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
        <span>{pick.sector || '—'}</span>
        <span>{fmtCap(pick.market_cap)}</span>
      </div>
      {pick.news?.length > 0 && (
        <div className="mt-2 border-t border-zinc-100 pt-2 text-[10px] leading-4 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          {pick.news[0]}
        </div>
      )}
    </button>
  );
}

export default function AiPicksPanel({ onOpenTicker }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (refresh = false) => {
    setLoading(true);
    setError('');
    try {
      setData(await fetchAiPicks({ refresh }));
    } catch (e) {
      setError(e.message || 'Failed to load picks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(false);
  }, []);

  const columns = useMemo(() => data?.columns || [], [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-zinc-500">
            <Brain className="h-4 w-4" /> AI-ranked stock shortlist
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">Picks</h2>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-200 dark:ring-red-900">{error}</div>}

      <div className="grid gap-3 rounded-lg bg-white p-3 ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:ring-zinc-800 sm:grid-cols-3">
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <TrendingUp className="h-4 w-4 text-emerald-500" /> {data?.scored_count || 0} scored from {data?.universe_count || 0} candidates
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <Sparkles className="h-4 w-4 text-sky-500" /> Fundamentals, technicals, news and agent synthesis
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <ShieldAlert className="h-4 w-4 text-amber-500" /> Research shortlist, not investment advice
        </div>
      </div>

      {data?.ai_summary && (
        <div className="whitespace-pre-wrap rounded-lg bg-zinc-950 p-4 text-sm leading-6 text-zinc-100 dark:bg-black">
          {data.ai_summary}
        </div>
      )}

      {loading && !data ? (
        <div className="grid gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-80 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />)}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {columns.map((col) => (
            <section key={col.id} className={`rounded-lg p-3 ring-1 ${toneClasses[col.tone] || toneClasses.emerald}`}>
              <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">{col.title}</h3>
              <p className="mt-0.5 min-h-8 text-xs text-zinc-600 dark:text-zinc-400">{col.subtitle}</p>
              <div className="mt-3 space-y-2">
                {(col.picks || []).map((pick, idx) => (
                  <PickCard key={pick.symbol} pick={pick} rank={idx + 1} onOpenTicker={onOpenTicker} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-zinc-500">{data?.disclaimer || 'Research shortlist only. Verify independently before trading.'}</p>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Brain, ExternalLink, MessageCircle, RefreshCw, ShieldAlert, Sparkles, TrendingUp } from 'lucide-react';
import { fetchAiPicks, fetchRedditPicks } from '../api';

const toneClasses = {
  emerald: 'bg-emerald-50 ring-emerald-200/70 dark:bg-emerald-950/25 dark:ring-emerald-800/60',
  sky: 'bg-sky-50 ring-sky-200/70 dark:bg-sky-950/25 dark:ring-sky-800/60',
  cyan: 'bg-cyan-50 ring-cyan-200/70 dark:bg-cyan-950/25 dark:ring-cyan-800/60',
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

function trendStats(values) {
  if (!Array.isArray(values) || values.length < 2) return null;
  const first = Number(values[0]);
  const last = Number(values[values.length - 1]);
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
  return { up: last >= first, pct: ((last / first) - 1) * 100, last };
}

function Sparkline({ values, color = '#2563eb' }) {
  if (!Array.isArray(values) || values.length < 2) {
    return <div className="h-10 rounded bg-zinc-50 dark:bg-zinc-950/30" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${34 - ((v - min) / span) * 28 - 3}`).join(' ');
  const up = values[values.length - 1] >= values[0];
  return (
    <svg viewBox="0 0 100 38" className="h-10 w-full overflow-visible" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke={up ? color : '#dc2626'} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TrendBlock({ values, color = '#2563eb' }) {
  const trend = trendStats(values);
  return (
    <div className="mt-2 rounded-md bg-zinc-50 px-2 py-1.5 ring-1 ring-zinc-100 dark:bg-zinc-950/30 dark:ring-zinc-800">
      <div className="mb-1 flex items-center justify-between text-[10px]">
        <span className="font-medium text-zinc-500">Price trend</span>
        {trend && (
          <span className={trend.up ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'font-semibold text-red-600 dark:text-red-400'}>
            {trend.up ? '+' : ''}{trend.pct.toFixed(1)}%
          </span>
        )}
      </div>
      <Sparkline values={values} color={color} />
    </div>
  );
}

function ConsensusBadge({ consensus }) {
  if (!consensus) {
    return <div className="rounded-md bg-zinc-50 px-2 py-1.5 text-[10px] text-zinc-500 ring-1 ring-zinc-100 dark:bg-zinc-950/30 dark:ring-zinc-800">Consensus unavailable</div>;
  }
  const rating = consensus.rating || 'Consensus';
  const r = rating.toLowerCase();
  const tone = r.includes('buy')
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900'
    : r.includes('hold')
      ? 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900'
      : 'bg-zinc-50 text-zinc-600 ring-zinc-100 dark:bg-zinc-950/30 dark:text-zinc-300 dark:ring-zinc-800';
  return (
    <div className={`rounded-md px-2 py-1.5 ring-1 ${tone}`}>
      <div className="text-[10px] font-semibold">{rating}</div>
      <div className="mt-0.5 text-[10px] opacity-80">
        {consensus.target ? `Target $${consensus.target}` : 'No target'}{consensus.analysts ? ` · ${consensus.analysts} analysts` : ''}
      </div>
    </div>
  );
}

function SentimentBadge({ sentiment }) {
  const value = sentiment || 'mixed';
  const s = value.toLowerCase();
  const tone = s.includes('bull')
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900'
    : s.includes('bear')
      ? 'bg-red-50 text-red-700 ring-red-100 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900'
      : s.includes('hype')
        ? 'bg-orange-50 text-orange-700 ring-orange-100 dark:bg-orange-950/30 dark:text-orange-300 dark:ring-orange-900'
        : 'bg-zinc-50 text-zinc-600 ring-zinc-100 dark:bg-zinc-950/30 dark:text-zinc-300 dark:ring-zinc-800';
  return (
    <div className={`rounded-md px-2 py-1.5 ring-1 ${tone}`}>
      <div className="text-[10px] font-semibold">Reddit sentiment</div>
      <div className="mt-0.5 text-[10px] capitalize opacity-80">{value}</div>
    </div>
  );
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
      <TrendBlock values={pick.sparkline} />
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-zinc-500">
        <span>{pick.sector || '—'}</span>
        <span>{fmtCap(pick.market_cap)}</span>
      </div>
      <div className="mt-2">
        <ConsensusBadge consensus={pick.consensus} />
      </div>
      {pick.candidate_sources?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {pick.candidate_sources.slice(0, 3).map((source) => (
            <span key={source} className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700 dark:bg-sky-950/30 dark:text-sky-300">
              {source}
            </span>
          ))}
        </div>
      )}
      {pick.agent_note && (
        <div className="mt-2 rounded bg-sky-50 px-2 py-1.5 text-[10px] leading-4 text-sky-800 ring-1 ring-sky-100 dark:bg-sky-950/30 dark:text-sky-200 dark:ring-sky-900">
          {pick.agent_note}
        </div>
      )}
      {pick.agent_risk && <div className="mt-1 text-[10px] leading-4 text-zinc-500">Risk: {pick.agent_risk}</div>}
    </button>
  );
}

function RedditBuzzCard({ item, rank, onOpenTicker }) {
  return (
    <div className="rounded-lg bg-white p-3 ring-1 ring-zinc-200/70 shadow-sm dark:bg-zinc-900/80 dark:ring-zinc-800">
      <button type="button" onClick={() => onOpenTicker?.(item.symbol)} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-zinc-500">#{rank}</span>
              <span className="font-semibold text-zinc-950 dark:text-zinc-100">{item.symbol}</span>
            </div>
            <div className="mt-1 text-xs text-zinc-500">{item.subreddits?.map((s) => `r/${s}`).join(' · ')}</div>
          </div>
          <div className="grid h-9 w-9 place-items-center rounded-md bg-orange-500 text-xs font-bold text-white">
            {Math.round(item.buzz_score)}
          </div>
        </div>
      </button>
      <div className="mt-3 grid grid-cols-2 gap-1 text-[10px] text-zinc-600 dark:text-zinc-400">
        <span>{item.mentions} mentions</span>
        <span>{item.recommendations} bullish</span>
      </div>
      <TrendBlock values={item.sparkline} color="#f97316" />
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-zinc-500">
        <span>{item.sector || 'Reddit buzz'}</span>
        <span>{fmtCap(item.market_cap)}</span>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2">
        <SentimentBadge sentiment={item.agent_sentiment} />
        <ConsensusBadge consensus={item.consensus} />
      </div>
      {item.agent_note && (
        <div className="mt-2 rounded bg-orange-50 px-2 py-1.5 text-[10px] leading-4 text-orange-800 ring-1 ring-orange-100 dark:bg-orange-950/30 dark:text-orange-200 dark:ring-orange-900">
          {item.agent_note}
        </div>
      )}
      {item.agent_risk && <div className="mt-1 text-[10px] leading-4 text-zinc-500">Risk: {item.agent_risk}</div>}
      <div className="mt-2 space-y-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
        {(item.examples || []).slice(0, 2).map((ex) => (
          <a
            key={ex.url}
            href={ex.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-1.5 text-[10px] leading-4 text-zinc-500 hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-300"
          >
            <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="line-clamp-2">{ex.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export default function AiPicksPanel({ onOpenTicker }) {
  const [view, setView] = useState('agent');
  const [data, setData] = useState(null);
  const [redditData, setRedditData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [redditLoading, setRedditLoading] = useState(false);
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

  const loadReddit = async (refresh = false) => {
    setRedditLoading(true);
    setError('');
    try {
      setRedditData(await fetchRedditPicks({ refresh }));
    } catch (e) {
      setError(e.message || 'Failed to load Reddit buzz');
    } finally {
      setRedditLoading(false);
    }
  };

  useEffect(() => {
    load(false);
  }, []);

  useEffect(() => {
    if (view === 'reddit' && !redditData && !redditLoading) loadReddit(false);
  }, [view, redditData, redditLoading]);

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
          onClick={() => (view === 'reddit' ? loadReddit(true) : load(true))}
          disabled={view === 'reddit' ? redditLoading : loading}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${(view === 'reddit' ? redditLoading : loading) ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-200 dark:ring-red-900">{error}</div>}

      <div className="flex flex-wrap gap-1 rounded-lg bg-zinc-100 p-1 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
        <button
          type="button"
          onClick={() => setView('agent')}
          className={`inline-flex min-w-32 flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition ${
            view === 'agent' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <Brain className="h-3.5 w-3.5" /> AI Picks
        </button>
        <button
          type="button"
          onClick={() => setView('reddit')}
          className={`inline-flex min-w-32 flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition ${
            view === 'reddit' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <span className="grid h-5 w-5 place-items-center rounded-full bg-orange-500 text-[10px] font-bold text-white">r/</span>
          Reddit Buzz
        </button>
      </div>

      {view === 'agent' && <div className="grid gap-3 rounded-lg bg-white p-3 ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:ring-zinc-800 sm:grid-cols-3">
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <TrendingUp className="h-4 w-4 text-emerald-500" /> {data?.scored_count || 0} scored from {data?.universe_count || 0} candidates
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <Sparkles className="h-4 w-4 text-sky-500" /> Fundamentals, technicals, recent headlines and macro context
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <ShieldAlert className="h-4 w-4 text-amber-500" /> {data?.agent_reviewed ? 'Final picks selected by tab-1 agent' : 'Click a ticker for full agent research'}
        </div>
      </div>}

      {view === 'reddit' && (
        <div className="grid gap-3 rounded-lg bg-white p-3 ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:ring-zinc-800 sm:grid-cols-3">
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <MessageCircle className="h-4 w-4 text-orange-500" /> {redditData?.items?.length || 0} Reddit tickers ranked
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <Sparkles className="h-4 w-4 text-sky-500" /> {redditData?.agent_reviewed ? 'Final Reddit ideas selected by tab-1 agent' : 'Mention and engagement based'}
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <ShieldAlert className="h-4 w-4 text-amber-500" /> Social buzz, not recommendations
          </div>
        </div>
      )}

      {view === 'agent' && (loading && !data ? (
        <div className="grid gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-80 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />)}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
      ))}

      {view === 'reddit' && (redditLoading && !redditData ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-56 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />)}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(redditData?.items || []).slice(0, 24).map((item, idx) => (
            <RedditBuzzCard key={item.symbol} item={item} rank={idx + 1} onOpenTicker={onOpenTicker} />
          ))}
        </div>
      ))}

      <p className="text-xs text-zinc-500">{view === 'reddit' ? redditData?.disclaimer : data?.disclaimer || 'Research shortlist only. Verify independently before trading.'}</p>
    </div>
  );
}

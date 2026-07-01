import { useEffect, useMemo, useState } from 'react';
import { Brain, ExternalLink, MessageCircle, RefreshCw, ShieldAlert, Sparkles, TrendingUp } from 'lucide-react';
import { fetchAiPicks, fetchRedditPicks } from '../api';

const scoreColor = (score) => {
  if (score >= 72) return 'bg-emerald-500';
  if (score >= 62) return 'bg-lime-500';
  if (score >= 54) return 'bg-amber-500';
  return 'bg-[var(--eq-text3)]';
};

function fmtCap(v) {
  if (!v) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v}`;
}

function fmtRatio(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toFixed(n >= 100 ? 0 : 1) : '—';
}

function fmtPct(v) {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : '—';
}

function metricTone(label, rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) return 'bg-[var(--eq-card2)] text-[var(--eq-text3)]';
  if (label === 'P/E') {
    if (n > 0 && n <= 25) return 'bg-[var(--eq-gain-soft)] text-[var(--eq-gain)]';
    if (n <= 45) return 'bg-yellow-50 text-yellow-700';
    return 'bg-[var(--eq-loss-soft)] text-[var(--eq-loss)]';
  }
  if (label === 'Rev') {
    if (n >= 15) return 'bg-[var(--eq-gain-soft)] text-[var(--eq-gain)]';
    if (n >= 3) return 'bg-yellow-50 text-yellow-700';
    if (n < 0) return 'bg-[var(--eq-loss-soft)] text-[var(--eq-loss)]';
  }
  if (label === 'ROE') {
    if (n >= 20) return 'bg-[var(--eq-gain-soft)] text-[var(--eq-gain)]';
    if (n >= 8) return 'bg-yellow-50 text-yellow-700';
    if (n < 0) return 'bg-[var(--eq-loss-soft)] text-[var(--eq-loss)]';
  }
  return 'bg-sky-50 text-sky-700';
}

function ConsensusBadge({ consensus }) {
  if (!consensus) {
    return (
      <div className="inline-flex w-full items-center justify-center rounded-md bg-[var(--eq-card2)] px-2 py-1 text-[10px] font-medium text-[var(--eq-text3)] ring-1 ring-[var(--eq-border)]">
        Consensus unavailable
      </div>
    );
  }
  const rating = consensus.rating || 'Consensus';
  const r = rating.toLowerCase();
  const tone = r.includes('strong') && r.includes('buy')
    ? 'bg-[var(--eq-gain)] text-[var(--eq-bg)] shadow-sm'
    : r.includes('buy')
      ? 'bg-[var(--eq-gain-soft)] text-[var(--eq-gain)] ring-1 ring-[var(--eq-gain)]/25'
      : r.includes('hold')
        ? 'bg-[var(--eq-card2)] text-[var(--eq-text2)] ring-1 ring-[var(--eq-border)]'
        : r.includes('sell')
          ? 'bg-red-100 text-[var(--eq-loss)] ring-1 ring-[var(--eq-loss)]/25'
          : 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-100';
  const details = [
    consensus.target ? `$${consensus.target}` : null,
    consensus.analysts ? `${consensus.analysts} analysts` : null,
  ].filter(Boolean).join(' · ');
  return (
    <div className={`inline-flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-[10px] ${tone}`}>
      <span className="shrink-0 font-bold">{rating}</span>
      {details && <span className="truncate opacity-80">{details}</span>}
    </div>
  );
}

function SentimentBadge({ sentiment }) {
  const value = sentiment || 'mixed';
  const s = value.toLowerCase();
  const tone = s.includes('bull')
    ? 'bg-[var(--eq-gain-soft)] text-[var(--eq-gain)] ring-[var(--eq-gain)]/25'
    : s.includes('bear')
      ? 'bg-[var(--eq-loss-soft)] text-[var(--eq-loss)] ring-[var(--eq-loss)]/25'
      : s.includes('hype')
        ? 'bg-yellow-50 text-yellow-700 ring-yellow-200'
        : 'bg-[var(--eq-card2)] text-[var(--eq-text2)] ring-[var(--eq-border)]';
  return (
    <div className={`inline-flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[10px] ring-1 ${tone}`}>
      <span className="font-semibold">Sentiment</span>
      <span className="capitalize opacity-85">{value}</span>
    </div>
  );
}

function FundamentalsGrid({ item }) {
  const metrics = [
    ['P/E', fmtRatio(item.forward_pe || item.pe_ratio), item.forward_pe || item.pe_ratio],
    ['Rev', fmtPct(item.revenue_growth), item.revenue_growth],
    ['ROE', fmtPct(item.return_on_equity), item.return_on_equity],
    ['Cap', fmtCap(item.market_cap), item.market_cap],
  ];
  return (
    <div className="mt-2 grid grid-cols-4 gap-1">
      {metrics.map(([label, value, rawValue]) => (
        <div key={label} className={`min-w-0 rounded px-1.5 py-1 ${metricTone(label, rawValue)}`}>
          <div className="text-[8px] font-semibold uppercase opacity-70">{label}</div>
          <div className="truncate text-[10px] font-bold">{value}</div>
        </div>
      ))}
    </div>
  );
}

function AgentRecommendation({ note, risk, tone = 'sky' }) {
  const text = note || risk;
  if (!text) return null;
  const colors = tone === 'orange'
    ? 'bg-yellow-50 text-yellow-800'
    : 'bg-sky-50 text-sky-800';
  return (
    <div className={`mt-2 flex items-start gap-1.5 rounded-md px-2 py-1.5 text-[10px] leading-4 ${colors}`}>
      <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
      <span className="line-clamp-2">{text}</span>
    </div>
  );
}

function PickCard({ pick, onOpenTicker }) {
  const score = pick?.scores?.overall || 0;
  return (
    <button
      type="button"
      onClick={() => onOpenTicker?.(pick.symbol)}
      className="w-full text-left rounded-lg bg-[var(--eq-card)]/90 p-3 ring-1 ring-[var(--eq-border)] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--eq-text)]">{pick.symbol}</span>
            <span className="text-[10px] text-[var(--eq-text3)]">{pick.country}</span>
          </div>
          <p className="truncate text-xs text-[var(--eq-text2)]">{pick.name}</p>
        </div>
        <div className="text-right shrink-0">
          <div className={`ml-auto h-8 w-8 rounded-md ${scoreColor(score)} text-[var(--eq-bg)] text-xs font-bold grid place-items-center`}>
            {Math.round(score)}
          </div>
        </div>
      </div>
      <AgentRecommendation note={pick.agent_note} risk={pick.agent_risk} />
      <FundamentalsGrid item={pick} />
      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[var(--eq-text3)]">
        <span>{pick.sector || '—'}</span>
        {pick.price && <span>${pick.price}</span>}
      </div>
      <div className="mt-2">
        <ConsensusBadge consensus={pick.consensus} />
      </div>
      {pick.candidate_sources?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {pick.candidate_sources.slice(0, 3).map((source) => (
            <span key={source} className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700">
              {source}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function RedditBuzzCard({ item, onOpenTicker }) {
  return (
    <div className="rounded-lg bg-[var(--eq-card)] p-3 ring-1 ring-[var(--eq-border)] shadow-sm">
      <button type="button" onClick={() => onOpenTicker?.(item.symbol)} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--eq-text)]">{item.symbol}</span>
            </div>
            <div className="mt-1 text-xs text-[var(--eq-text3)]">{item.subreddits?.map((s) => `r/${s}`).join(' · ')}</div>
          </div>
          <div className="grid h-9 w-9 place-items-center rounded-md bg-orange-500 text-xs font-bold text-[var(--eq-bg)]">
            {Math.round(item.buzz_score)}
          </div>
        </div>
      </button>
      <div className="mt-3 grid grid-cols-2 gap-1 text-[10px] text-[var(--eq-text2)]">
        <span>{item.mentions} mentions</span>
        <span>{item.recommendations} bullish</span>
      </div>
      <AgentRecommendation note={item.agent_note} risk={item.agent_risk} tone="orange" />
      <FundamentalsGrid item={item} />
      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[var(--eq-text3)]">
        <span>{item.sector || 'Reddit buzz'}</span>
        {item.price && <span>${item.price}</span>}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2">
        <SentimentBadge sentiment={item.agent_sentiment} />
        <ConsensusBadge consensus={item.consensus} />
      </div>
      <div className="mt-2 space-y-1 border-t border-[var(--eq-grid)] pt-2">
        {(item.examples || []).slice(0, 2).map((ex) => (
          <a
            key={ex.url}
            href={ex.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-1.5 text-[10px] leading-4 text-[var(--eq-text3)] hover:text-orange-600"
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
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-[var(--eq-text3)]">
            <Brain className="h-4 w-4" /> AI-ranked stock shortlist
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--eq-text)]">Picks</h2>
        </div>
        <button
          type="button"
          onClick={() => (view === 'reddit' ? loadReddit(true) : load(true))}
          disabled={view === 'reddit' ? redditLoading : loading}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--eq-text)] px-3 py-2 text-xs font-medium text-[var(--eq-bg)] disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${(view === 'reddit' ? redditLoading : loading) ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div className="rounded-lg bg-[var(--eq-loss-soft)] p-3 text-sm text-[var(--eq-loss)] ring-1 ring-[var(--eq-loss)]/25">{error}</div>}

      <div className="flex flex-wrap gap-1 rounded-lg bg-[var(--eq-card2)] p-1 ring-1 ring-[var(--eq-border)]">
        <button
          type="button"
          onClick={() => setView('agent')}
          className={`inline-flex min-w-32 flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition ${
            view === 'agent' ? 'bg-[var(--eq-card)] text-[var(--eq-text)] shadow-sm' : 'text-[var(--eq-text3)] hover:text-[var(--eq-text)]'
          }`}
        >
          <Brain className="h-3.5 w-3.5" /> AI Picks
        </button>
        <button
          type="button"
          onClick={() => setView('reddit')}
          className={`inline-flex min-w-32 flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition ${
            view === 'reddit' ? 'bg-[var(--eq-card)] text-[var(--eq-text)] shadow-sm' : 'text-[var(--eq-text3)] hover:text-[var(--eq-text)]'
          }`}
        >
          <span className="grid h-5 w-5 place-items-center rounded-full bg-orange-500 text-[10px] font-bold text-[var(--eq-bg)]">r/</span>
          Reddit Buzz
        </button>
      </div>

      {view === 'agent' && <div className="grid gap-3 rounded-lg bg-[var(--eq-card)] p-3 ring-1 ring-[var(--eq-border)] sm:grid-cols-3">
        <div className="flex items-center gap-2 text-sm text-[var(--eq-text2)]">
          <TrendingUp className="h-4 w-4 text-[var(--eq-gain)]" /> {data?.scored_count || 0} scored from {data?.universe_count || 0} candidates
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--eq-text2)]">
          <Sparkles className="h-4 w-4 text-sky-500" /> Fundamentals, technicals, recent headlines and macro context
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--eq-text2)]">
          <ShieldAlert className="h-4 w-4 text-amber-500" /> {data?.agent_reviewed ? 'Final picks selected by tab-1 agent' : 'Click a ticker for full agent research'}
        </div>
      </div>}

      {view === 'reddit' && (
        <div className="grid gap-3 rounded-lg bg-[var(--eq-card)] p-3 ring-1 ring-[var(--eq-border)] sm:grid-cols-3">
          <div className="flex items-center gap-2 text-sm text-[var(--eq-text2)]">
            <MessageCircle className="h-4 w-4 text-orange-500" /> {redditData?.items?.length || 0} Reddit tickers ranked
          </div>
          <div className="flex items-center gap-2 text-sm text-[var(--eq-text2)]">
            <Sparkles className="h-4 w-4 text-sky-500" /> {redditData?.agent_reviewed ? 'Final Reddit ideas selected by tab-1 agent' : 'Mention and engagement based'}
          </div>
          <div className="flex items-center gap-2 text-sm text-[var(--eq-text2)]">
            <ShieldAlert className="h-4 w-4 text-amber-500" /> Social buzz, not recommendations
          </div>
        </div>
      )}

      {view === 'agent' && (loading && !data ? (
        <div className="grid gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-80 animate-pulse rounded-lg bg-[var(--eq-card2)]" />)}
        </div>
      ) : (
        <div className="grid gap-[1.125rem] md:grid-cols-2 xl:grid-cols-5">
          {columns.map((col) => (
            <section key={col.id} className="min-w-0">
              <div className="mb-2">
                <h3 className="text-sm font-semibold text-[var(--eq-text)]">{col.title}</h3>
                <p className="mt-0.5 text-xs text-[var(--eq-text3)]">{col.subtitle}</p>
              </div>
              <div className="space-y-2">
                {(col.picks || []).map((pick, idx) => (
                  <PickCard key={pick.symbol} pick={pick} onOpenTicker={onOpenTicker} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ))}

      {view === 'reddit' && (redditLoading && !redditData ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-56 animate-pulse rounded-lg bg-[var(--eq-card2)]" />)}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(redditData?.items || []).slice(0, 24).map((item, idx) => (
            <RedditBuzzCard key={item.symbol} item={item} onOpenTicker={onOpenTicker} />
          ))}
        </div>
      ))}

      <p className="text-xs text-[var(--eq-text3)]">{view === 'reddit' ? redditData?.disclaimer : data?.disclaimer || 'Research shortlist only. Verify independently before trading.'}</p>
    </div>
  );
}

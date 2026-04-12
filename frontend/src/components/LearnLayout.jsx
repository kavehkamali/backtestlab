import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ArrowLeft, LineChart, LayoutGrid, Sparkles } from 'lucide-react';
import { fetchPublishedArticles, fetchPublishedArticle, trackPageView } from '../api';
import { clearLearnToHome, navigateLearn, navigateLearnTopic } from '../learnNavigation';

function upsertMetaProperty(property, content) {
  let el = document.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function applyArticleSeo(article) {
  if (!article) return () => {};
  const prevTitle = document.title;
  document.title = `${article.title} | Equilima`;
  let desc = document.querySelector('meta[name="description"]');
  if (!desc) {
    desc = document.createElement('meta');
    desc.setAttribute('name', 'description');
    document.head.appendChild(desc);
  }
  desc.setAttribute('content', article.meta_description || article.excerpt || '');
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', article.canonical_url);
  const ogImage = article.og_image_url || `${window.location.origin}/og-image.png`;
  upsertMetaProperty('og:type', 'article');
  upsertMetaProperty('og:url', article.canonical_url);
  upsertMetaProperty('og:title', article.title);
  upsertMetaProperty('og:description', article.meta_description || article.excerpt || '');
  upsertMetaProperty('og:image', ogImage);
  upsertMetaProperty('twitter:card', 'summary_large_image');
  upsertMetaProperty('twitter:title', article.title);
  upsertMetaProperty('twitter:description', article.meta_description || article.excerpt || '');
  upsertMetaProperty('twitter:image', ogImage);

  let script = document.getElementById('eq-article-jsonld');
  if (!script) {
    script = document.createElement('script');
    script.id = 'eq-article-jsonld';
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(article.json_ld);

  return () => {
    document.title = prevTitle;
    const s = document.getElementById('eq-article-jsonld');
    if (s) s.remove();
  };
}

function applyIndexSeo() {
  const prevTitle = document.title;
  document.title = 'Learn | Equilima — Guides & stock investing insights';
  let desc = document.querySelector('meta[name="description"]');
  if (!desc) {
    desc = document.createElement('meta');
    desc.setAttribute('name', 'description');
    document.head.appendChild(desc);
  }
  desc.setAttribute(
    'content',
    'Deep guides on AI research agents, LLM tooling for investors, grounding and evaluation, workflows, and market-structure context—plus Equilima product walkthroughs. Hub-and-spoke internal links for research-grade SEO.',
  );
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', `${window.location.origin}/learn`);
  return () => {
    document.title = prevTitle;
  };
}

const proseClass =
  'learn-prose max-w-3xl mx-auto text-[15px] leading-relaxed text-zinc-700 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-zinc-900 [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-zinc-900 [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-medium [&_h3]:text-zinc-800 [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-4 [&_a]:text-indigo-600 [&_a]:underline [&_a:hover]:text-indigo-800 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_li]:mb-1 [&_strong]:text-zinc-900 [&_code]:text-pink-700 [&_code]:text-sm [&_blockquote]:border-l-2 [&_blockquote]:border-indigo-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-zinc-600 [&_table]:w-full [&_table]:text-[13px] [&_th]:text-left [&_th]:py-2 [&_th]:pr-3 [&_th]:text-zinc-500 [&_th]:font-medium [&_td]:py-2 [&_td]:pr-3 [&_td]:border-t [&_td]:border-zinc-200';

/** Equilima product-topic guides first (Research emphasized in nav order), then AI agent series. */
const CLUSTER_SECTION_ORDER = [
  'Equilima — Research',
  'Equilima — Crypto',
  'Equilima — Screener',
  'Equilima — Backtest',
  'Equilima — Markets',
  'AI agents — Fundamentals',
  'AI agents — Models & tools',
  'AI agents — Grounding & evaluation',
  'AI agents — Workflows',
  'AI agents — Governance & markets',
];

const TOPIC_TO_CLUSTER = {
  research: 'Equilima — Research',
  crypto: 'Equilima — Crypto',
  screener: 'Equilima — Screener',
  backtest: 'Equilima — Backtest',
  markets: 'Equilima — Markets',
};

const TOPIC_NAV_ORDER = ['research', 'crypto', 'screener', 'backtest', 'markets'];

const TOPIC_LABELS = {
  research: 'Research',
  crypto: 'Crypto',
  screener: 'Screener',
  backtest: 'Backtest',
  markets: 'Markets',
};

function clusterRank(clusterKey) {
  const k = clusterKey || '';
  const i = CLUSTER_SECTION_ORDER.indexOf(k);
  return i === -1 ? 100 + k.localeCompare('') : i;
}

function sectionDomId(clusterKey) {
  const raw = (clusterKey || 'guides').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `learn-section-${raw.slice(0, 72) || 'guides'}`;
}

function groupArticlesByCluster(articles) {
  const map = new Map();
  for (const a of articles) {
    const ck = a.cluster_key || 'Guides';
    if (!map.has(ck)) map.set(ck, []);
    map.get(ck).push(a);
  }
  const keys = [...map.keys()].sort((a, b) => {
    const ra = clusterRank(a);
    const rb = clusterRank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
  return keys.map((key) => ({ clusterKey: key, items: map.get(key) }));
}

export default function LearnLayout({ route, setActiveTab }) {
  const [list, setList] = useState([]);
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const openAppTab = (tab) => {
    clearLearnToHome();
    if (tab) setActiveTab(tab);
  };

  useEffect(() => {
    if (route.kind !== 'index') return undefined;
    const cleanup = applyIndexSeo();
    setLoading(true);
    setError(null);
    setArticle(null);
    fetchPublishedArticles()
      .then((d) => setList(d.articles || []))
      .catch((e) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
    return cleanup;
  }, [route.kind]);

  useEffect(() => {
    if (route.kind !== 'article') return undefined;
    setArticle(null);
    setLoading(true);
    setError(null);
    let cancelled = false;
    fetchPublishedArticle(route.slug)
      .then((a) => {
        if (!cancelled) setArticle(a);
      })
      .catch((e) => {
        if (!cancelled) {
          setArticle(null);
          setError(e.message || 'Not found');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [route.kind, route.slug]);

  useEffect(() => {
    if (route.kind === 'article' && article) {
      return applyArticleSeo(article);
    }
    return undefined;
  }, [route.kind, article]);

  useEffect(() => {
    if (route.kind === 'article') trackPageView(`learn:${route.slug}`);
    else trackPageView('learn');
  }, [route.kind, route.slug]);

  const filteredList = useMemo(() => {
    if (route.kind !== 'index' || !route.topic) return list;
    const ck = TOPIC_TO_CLUSTER[route.topic];
    if (!ck) return list;
    return list.filter((a) => a.cluster_key === ck);
  }, [list, route.kind, route.topic]);

  const groupedList = useMemo(() => groupArticlesByCluster(filteredList), [filteredList]);

  const useMediumArticleChrome =
    route.kind === 'article' && article?.cluster_key?.startsWith('Equilima —');
  const wideArticleLayout = route.kind === 'article';

  const shellClass = useMediumArticleChrome
    ? 'learn-article-shell min-h-screen'
    : 'min-h-screen bg-zinc-50 text-zinc-900';
  const headerClass = useMediumArticleChrome
    ? 'learn-article-shell-header sticky top-0 z-50'
    : 'border-b border-zinc-200/60 bg-white/90 backdrop-blur-md sticky top-0 z-50 shadow-sm shadow-zinc-900/[0.02]';
  const backBtnClass = useMediumArticleChrome
    ? 'flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors'
    : 'flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 transition-colors';
  const navAllClass = useMediumArticleChrome
    ? 'px-2 py-1 rounded-md text-indigo-700 hover:bg-black/[0.04]'
    : 'px-2 py-1 rounded-md text-indigo-700 hover:bg-zinc-100';

  return (
    <div className={shellClass}>
      <header className={headerClass}>
        <div
          className={
            wideArticleLayout
              ? 'max-w-5xl xl:max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3'
              : 'max-w-4xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3'
          }
        >
          <button type="button" onClick={() => openAppTab('agent')} className={backBtnClass}>
            <ArrowLeft className="w-4 h-4" />
            Back to Equilima
          </button>
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <button type="button" onClick={() => navigateLearn()} className={navAllClass}>
              All articles
            </button>
            <span className={useMediumArticleChrome ? 'text-neutral-300 hidden sm:inline' : 'text-gray-600 hidden sm:inline'}>
              |
            </span>
            <span className="text-gray-600 sm:hidden w-full" />
            {TOPIC_NAV_ORDER.map((topic) => {
              const active = route.kind === 'index' && route.topic === topic;
              if (useMediumArticleChrome) {
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => navigateLearnTopic(topic)}
                    className={`px-2 py-1 rounded-md hover:bg-black/[0.04] ${
                      topic === 'research'
                        ? active
                          ? 'text-indigo-800 font-semibold bg-indigo-100'
                          : 'text-indigo-700 font-semibold'
                        : active
                          ? 'text-neutral-900 font-medium bg-neutral-100'
                          : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    {TOPIC_LABELS[topic]}
                  </button>
                );
              }
              return (
                <button
                  key={topic}
                  type="button"
                  onClick={() => navigateLearnTopic(topic)}
                  className={`px-2 py-1 rounded-md hover:bg-zinc-100 ${
                    topic === 'research'
                      ? active
                        ? 'text-indigo-800 font-semibold bg-indigo-100'
                        : 'text-indigo-700 font-semibold hover:text-indigo-800'
                      : active
                        ? 'text-zinc-900 font-medium bg-zinc-200/70'
                        : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {TOPIC_LABELS[topic]}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main
        className={
          wideArticleLayout
            ? 'max-w-5xl xl:max-w-6xl mx-auto px-4 sm:px-6 py-10 pb-24'
            : 'max-w-4xl mx-auto px-4 py-10 pb-20'
        }
      >
        {route.kind === 'index' && (
          <>
            <div className="flex items-start gap-3 mb-8">
              <BookOpen className="w-10 h-10 text-indigo-600 shrink-0 mt-1" />
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight">Learn</h1>
                <p className="text-sm text-zinc-600 mt-2 max-w-2xl">
                  Long-form guides on <strong className="text-zinc-800 font-medium">Research, Crypto, Screener, Backtest, and Markets</strong>—plus the <strong className="text-zinc-800 font-medium">AI agents for market research</strong> series. Use the topic links above to filter Equilima walkthroughs; open the app from any article when you are ready to apply the ideas.
                </p>
              </div>
            </div>
            {loading && <p className="text-zinc-500 text-sm">Loading…</p>}
            {error && <p className="text-red-600 text-sm">{error}</p>}
            {!loading && !error && list.length === 0 && (
              <p className="text-zinc-500 text-sm">No published articles yet. Add them from the admin Learn tab.</p>
            )}
            {route.topic && TOPIC_TO_CLUSTER[route.topic] && !loading && !error && (
              <p className="text-xs text-indigo-700 mb-6">
                Showing <strong className="text-indigo-900">{TOPIC_TO_CLUSTER[route.topic]}</strong> guides
                {' · '}
                <button type="button" onClick={() => navigateLearn()} className="underline hover:text-indigo-900">
                  Clear filter
                </button>
              </p>
            )}
            {!loading && !error && route.topic && filteredList.length === 0 && list.length > 0 && (
              <p className="text-zinc-500 text-sm mb-6">No published guides for this topic yet.</p>
            )}
            <div className="space-y-14">
              {groupedList.map(({ clusterKey, items }) => (
                <section key={clusterKey} className="scroll-mt-8" aria-labelledby={sectionDomId(clusterKey)}>
                  <div className="flex flex-wrap items-end gap-3 mb-5 pb-4 border-b border-zinc-200/80">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="h-11 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-indigo-500 via-violet-500 to-fuchsia-500"
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <h2
                          id={sectionDomId(clusterKey)}
                          className="text-lg sm:text-xl font-bold text-zinc-900 tracking-tight"
                        >
                          {clusterKey}
                        </h2>
                        <p className="text-[11px] text-zinc-500 mt-0.5">{items.length} in-depth {items.length === 1 ? 'guide' : 'guides'}</p>
                      </div>
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-indigo-600/80 font-semibold">Guides</span>
                  </div>
                  <ul className="space-y-4">
                    {items.map((a) => (
                      <li key={a.slug}>
                        <button
                          type="button"
                          onClick={() => navigateLearn(a.slug)}
                          className="w-full text-left p-4 rounded-xl bg-white shadow-sm ring-1 ring-zinc-200/70 hover:ring-indigo-200 hover:shadow-md transition-all"
                        >
                          <span className="text-[10px] uppercase tracking-wider text-indigo-700 font-medium">{a.cluster_key || 'Article'}</span>
                          <h3 className="text-lg font-semibold text-zinc-900 mt-1 leading-snug">{a.title}</h3>
                          <p className="text-sm text-zinc-600 mt-2 line-clamp-3">{a.excerpt || a.meta_description}</p>
                          <span className="text-[11px] text-zinc-400 mt-2 block">{a.published_at?.slice(0, 10)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}

        {route.kind === 'article' && (
          <>
            {loading && (
              <p className={useMediumArticleChrome ? 'text-neutral-500 text-sm' : 'text-gray-500 text-sm'}>Loading…</p>
            )}
            {error && <p className="text-red-600 text-sm">{error}</p>}
            {article && (
              <article>
                {useMediumArticleChrome ? (
                  <>
                    <p className="learn-article-hero-meta text-xs font-semibold uppercase tracking-wider text-indigo-600 mb-2">
                      {article.cluster_key || 'Article'}
                    </p>
                    <h1 className="learn-article-hero-title text-[2.35rem] sm:text-[2.75rem] font-bold text-neutral-950 mb-3 leading-[1.06]">
                      {article.title}
                    </h1>
                    <p className="learn-article-hero-meta text-sm text-neutral-500 mb-10">
                      {article.author_name && <span>{article.author_name}</span>}
                      {article.published_at && (
                        <span className="ml-2">· {article.published_at.slice(0, 10)}</span>
                      )}
                    </p>
                    <div className="learn-article-reading" dangerouslySetInnerHTML={{ __html: article.body_html }} />
                    <aside className="learn-article-cta mt-14 mx-auto p-6 sm:p-7 rounded-2xl bg-white/95 shadow-lg shadow-zinc-900/8 ring-1 ring-zinc-200/70 backdrop-blur-sm">
                      <p className="learn-article-hero-meta text-sm font-semibold text-neutral-900 mb-1">Try it in Equilima</p>
                      <p className="learn-article-hero-meta text-xs text-neutral-500 mb-4">
                        Open the app to apply these ideas with live data.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openAppTab('agent')}
                          className="learn-article-hero-meta inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
                        >
                          <Sparkles className="w-3.5 h-3.5" /> AI Agent
                        </button>
                        <button
                          type="button"
                          onClick={() => openAppTab('screener')}
                          className="learn-article-hero-meta inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-neutral-300 text-neutral-800 hover:bg-neutral-50 text-xs font-medium"
                        >
                          <LayoutGrid className="w-3.5 h-3.5" /> Screener
                        </button>
                        <button
                          type="button"
                          onClick={() => openAppTab('backtest')}
                          className="learn-article-hero-meta inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-neutral-300 text-neutral-800 hover:bg-neutral-50 text-xs font-medium"
                        >
                          <LineChart className="w-3.5 h-3.5" /> Backtesting
                        </button>
                        <button
                          type="button"
                          onClick={() => openAppTab('markets')}
                          className="learn-article-hero-meta inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-neutral-300 text-neutral-800 hover:bg-neutral-50 text-xs font-medium"
                        >
                          Markets
                        </button>
                      </div>
                    </aside>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-indigo-700 uppercase tracking-wider mb-2">{article.cluster_key || 'Article'}</p>
                    <h1 className="text-3xl sm:text-4xl font-bold text-zinc-900 tracking-tight mb-4">{article.title}</h1>
                    <p className="text-sm text-zinc-500 mb-8">
                      {article.author_name && <span>{article.author_name}</span>}
                      {article.published_at && (
                        <span className="ml-2">· {article.published_at.slice(0, 10)}</span>
                      )}
                    </p>
                    <div className={proseClass} dangerouslySetInnerHTML={{ __html: article.body_html }} />
                    <aside className="mt-12 p-5 rounded-xl bg-indigo-50/80 ring-1 ring-indigo-100">
                      <p className="text-sm font-medium text-zinc-900 mb-3">Try it in Equilima</p>
                      <p className="text-xs text-zinc-600 mb-4">Open the app to explore live data alongside this guide.</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openAppTab('agent')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-sm"
                        >
                          <Sparkles className="w-3.5 h-3.5" /> AI Agent
                        </button>
                        <button
                          type="button"
                          onClick={() => openAppTab('screener')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-zinc-800 text-xs font-medium ring-1 ring-zinc-200/80 hover:bg-zinc-50"
                        >
                          <LayoutGrid className="w-3.5 h-3.5" /> Screener
                        </button>
                        <button
                          type="button"
                          onClick={() => openAppTab('backtest')}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-zinc-800 text-xs font-medium ring-1 ring-zinc-200/80 hover:bg-zinc-50"
                        >
                          <LineChart className="w-3.5 h-3.5" /> Backtesting
                        </button>
                      </div>
                    </aside>
                  </>
                )}
              </article>
            )}
          </>
        )}
      </main>
    </div>
  );
}

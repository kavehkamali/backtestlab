import { useEffect, useState } from 'react';
import { BookOpen, ArrowLeft, LineChart, LayoutGrid, Sparkles } from 'lucide-react';
import { fetchPublishedArticles, fetchPublishedArticle, trackPageView } from '../api';
import { clearLearnToHome, navigateLearn } from '../learnNavigation';

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
  desc.setAttribute('content', 'Guides and articles on stock research, backtesting, and using Equilima. Hub-and-spoke content with links to our screener, markets, and AI tools.');
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
  'learn-prose max-w-3xl mx-auto text-[15px] leading-relaxed text-gray-300 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-white [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-medium [&_h3]:text-gray-100 [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-4 [&_a]:text-indigo-400 [&_a]:underline [&_a:hover]:text-indigo-300 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_li]:mb-1 [&_strong]:text-gray-100 [&_code]:text-pink-300 [&_code]:text-sm [&_blockquote]:border-l-2 [&_blockquote]:border-indigo-500/50 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-400';

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

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-200">
      <header className="border-b border-white/10 bg-[#0a0a0f]/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => openAppTab('agent')}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Equilima
          </button>
          <nav className="flex items-center gap-2 text-xs">
            <button type="button" onClick={() => navigateLearn()} className="px-2 py-1 rounded-md text-indigo-300 hover:bg-white/5">
              All articles
            </button>
            <span className="text-gray-600">|</span>
            <button type="button" onClick={() => openAppTab('screener')} className="px-2 py-1 rounded-md text-gray-400 hover:text-white hover:bg-white/5">
              Screener
            </button>
            <button type="button" onClick={() => openAppTab('backtest')} className="px-2 py-1 rounded-md text-gray-400 hover:text-white hover:bg-white/5">
              Backtest
            </button>
            <button type="button" onClick={() => openAppTab('markets')} className="px-2 py-1 rounded-md text-gray-400 hover:text-white hover:bg-white/5">
              Markets
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 pb-20">
        {route.kind === 'index' && (
          <>
            <div className="flex items-start gap-3 mb-8">
              <BookOpen className="w-10 h-10 text-indigo-400 shrink-0 mt-1" />
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Learn</h1>
                <p className="text-sm text-gray-500 mt-2 max-w-2xl">
                  Practical guides linked to Equilima tools. Use internal links between articles (hub and spoke) and send readers to the screener, backtester, or AI agent when it helps.
                </p>
              </div>
            </div>
            {loading && <p className="text-gray-500 text-sm">Loading…</p>}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            {!loading && !error && list.length === 0 && (
              <p className="text-gray-500 text-sm">No published articles yet. Add them from the admin Learn tab.</p>
            )}
            <ul className="space-y-4">
              {list.map((a) => (
                <li key={a.slug}>
                  <button
                    type="button"
                    onClick={() => navigateLearn(a.slug)}
                    className="w-full text-left p-4 rounded-xl border border-white/10 bg-white/[0.02] hover:border-indigo-500/30 hover:bg-white/[0.04] transition-colors"
                  >
                    <span className="text-xs uppercase tracking-wider text-indigo-400/80">{a.cluster_key || 'Article'}</span>
                    <h2 className="text-lg font-semibold text-white mt-1">{a.title}</h2>
                    <p className="text-sm text-gray-500 mt-2 line-clamp-2">{a.excerpt || a.meta_description}</p>
                    <span className="text-[11px] text-gray-600 mt-2 block">{a.published_at?.slice(0, 10)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {route.kind === 'article' && (
          <>
            {loading && <p className="text-gray-500 text-sm">Loading…</p>}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            {article && (
              <article>
                <p className="text-xs text-indigo-400/90 uppercase tracking-wider mb-2">{article.cluster_key || 'Article'}</p>
                <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">{article.title}</h1>
                <p className="text-sm text-gray-500 mb-8">
                  {article.author_name && <span>{article.author_name}</span>}
                  {article.published_at && (
                    <span className="ml-2">· {article.published_at.slice(0, 10)}</span>
                  )}
                </p>
                <div className={proseClass} dangerouslySetInnerHTML={{ __html: article.body_html }} />

                <aside className="mt-12 p-5 rounded-xl border border-indigo-500/20 bg-indigo-500/5">
                  <p className="text-sm font-medium text-white mb-3">Try it in Equilima</p>
                  <p className="text-xs text-gray-500 mb-4">Product-led CTAs — link from your article body to these tools for SEO internal linking.</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openAppTab('agent')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> AI Agent
                    </button>
                    <button
                      type="button"
                      onClick={() => openAppTab('screener')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-gray-200 text-xs font-medium border border-white/10"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" /> Screener
                    </button>
                    <button
                      type="button"
                      onClick={() => openAppTab('backtest')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-gray-200 text-xs font-medium border border-white/10"
                    >
                      <LineChart className="w-3.5 h-3.5" /> Backtesting
                    </button>
                  </div>
                </aside>
              </article>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/** Learn hub routes: /learn and /learn/:slug (pathname), or #/learn / #/learn/:slug (hash fallback). */

const VALID_TOPICS = new Set(['research', 'crypto', 'screener', 'backtest', 'markets']);

function parseLearnTopic() {
  try {
    const path = (window.location.pathname || '/').replace(/\/$/, '') || '/';
    if (path === '/learn' || path === '') {
      const u = new URL(window.location.href);
      const t = (u.searchParams.get('topic') || '').toLowerCase();
      if (VALID_TOPICS.has(t)) return t;
    }
    const raw = (window.location.hash || '').replace(/^#/, '');
    const h = raw.startsWith('/') ? raw : `/${raw}`;
    if (h.startsWith('/learn')) {
      const q = h.includes('?') ? h.split('?')[1].split('#')[0] : '';
      if (q) {
        const t = new URLSearchParams(q).get('topic');
        if (t && VALID_TOPICS.has(t.toLowerCase())) return t.toLowerCase();
      }
    }
  } catch (_) {}
  return null;
}

export function getLearnRoute() {
  const path = (window.location.pathname || '/').replace(/\/$/, '') || '/';
  if (path === '/learn') return { kind: 'index', topic: parseLearnTopic() };
  const m = path.match(/^\/learn\/([^/]+)$/);
  if (m) return { kind: 'article', slug: decodeURIComponent(m[1]), topic: null };

  const raw = (window.location.hash || '').replace(/^#/, '');
  const h = raw.startsWith('/') ? raw : `/${raw}`;
  if (h === '/learn' || h === '/learn/') return { kind: 'index', topic: parseLearnTopic() };
  const hm = h.match(/^\/learn\/([^/?#]+)/);
  if (hm) return { kind: 'article', slug: decodeURIComponent(hm[1]), topic: null };
  return null;
}

/** Learn index: optional topic filter for Equilima hubs (research | crypto | screener | backtest | markets). */
export function navigateLearn(slug) {
  if (slug) {
    window.history.pushState({}, '', `/learn/${encodeURIComponent(slug)}`);
  } else {
    window.history.pushState({}, '', '/learn');
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function navigateLearnTopic(topic) {
  const t = (topic || '').trim().toLowerCase();
  const url =
    t && VALID_TOPICS.has(t) ? `/learn?topic=${encodeURIComponent(t)}` : '/learn';
  window.history.pushState({}, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function clearLearnToHome() {
  window.history.pushState({}, '', '/');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

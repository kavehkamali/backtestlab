/** Learn hub routes: /learn and /learn/:slug (pathname), or #/learn / #/learn/:slug (hash fallback). */

export function getLearnRoute() {
  const path = (window.location.pathname || '/').replace(/\/$/, '') || '/';
  if (path === '/learn') return { kind: 'index' };
  const m = path.match(/^\/learn\/([^/]+)$/);
  if (m) return { kind: 'article', slug: decodeURIComponent(m[1]) };

  const raw = (window.location.hash || '').replace(/^#/, '');
  const h = raw.startsWith('/') ? raw : `/${raw}`;
  if (h === '/learn' || h === '/learn/') return { kind: 'index' };
  const hm = h.match(/^\/learn\/([^/?#]+)/);
  if (hm) return { kind: 'article', slug: decodeURIComponent(hm[1]) };
  return null;
}

export function navigateLearn(slug) {
  const url = slug ? `/learn/${encodeURIComponent(slug)}` : '/learn';
  window.history.pushState({}, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function clearLearnToHome() {
  window.history.pushState({}, '', '/');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

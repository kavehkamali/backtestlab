const BASE = '/api';

// ─── Auth helpers ───
function getToken() { return localStorage.getItem('eq_token'); }

function authHeaders() {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export async function signup({ email, password, name, consent_policy, consent_newsletter }) {
  const res = await fetch(`${BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, consent_policy, consent_newsletter }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Signup failed');
  localStorage.setItem('eq_token', data.token);
  localStorage.setItem('eq_user', JSON.stringify(data.user));
  return data;
}

export async function signin({ email, password }) {
  const res = await fetch(`${BASE}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Sign in failed');
  localStorage.setItem('eq_token', data.token);
  localStorage.setItem('eq_user', JSON.stringify(data.user));
  return data;
}

export function signout() {
  localStorage.removeItem('eq_token');
  localStorage.removeItem('eq_user');
}

export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('eq_user')); } catch { return null; }
}

export async function fetchMe() {
  const res = await fetch(`${BASE}/auth/me`, { headers: { ...authHeaders() } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to load account');
  localStorage.setItem('eq_user', JSON.stringify({ id: data.id, email: data.email, name: data.name }));
  return data;
}

export async function updateMe({ name, consent_newsletter }) {
  const res = await fetch(`${BASE}/auth/me`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, consent_newsletter }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Update failed');
  return data;
}

export async function changePassword(current_password, new_password) {
  const res = await fetch(`${BASE}/auth/change-password`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password, new_password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Change password failed');
  return data;
}

export async function deleteAccount({ password, confirm }) {
  const res = await fetch(`${BASE}/auth/me`, {
    method: 'DELETE',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, confirm }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Delete failed');
  return data;
}

export async function checkInteraction() {
  const res = await fetch(`${BASE}/auth/interaction`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) return { exceeded: false, count: 0, remaining: 999 };
  return res.json();
}

// ─── Analytics tracking ───
let _sessionId = sessionStorage.getItem('eq_sid');
if (!_sessionId) { _sessionId = Math.random().toString(36).slice(2); sessionStorage.setItem('eq_sid', _sessionId); }

export function trackPageView(tab) {
  const user = getStoredUser();
  fetch(`${BASE}/admin/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: window.location.pathname, tab, session_id: _sessionId, user_id: user?.id }),
  }).catch(() => {});
}

export async function adminLogin(username, password) {
  const res = await fetch(`${BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Login failed');
  localStorage.setItem('eq_admin_token', data.token);
  return data;
}

export async function fetchAdminStats(daysOrOpts = 30) {
  const token = localStorage.getItem('eq_admin_token');
  const opts = (typeof daysOrOpts === 'object' && daysOrOpts) ? daysOrOpts : { days: daysOrOpts };
  const days = opts.days ?? 30;
  const recentDays = opts.recentDays ?? opts.recent_days;
  const recentLimit = opts.recentLimit ?? opts.recent_limit;
  const ipTableDays = opts.ipTableDays ?? opts.ip_table_days;
  const ipTableLimit = opts.ipTableLimit ?? opts.ip_table_limit;

  const qp = new URLSearchParams();
  qp.set('days', String(days));
  if (recentDays != null) qp.set('recent_days', String(recentDays));
  if (recentLimit != null) qp.set('recent_limit', String(recentLimit));
  if (ipTableDays != null) qp.set('ip_table_days', String(ipTableDays));
  if (ipTableLimit != null) qp.set('ip_table_limit', String(ipTableLimit));
  qp.set('_', String(Date.now()));

  const res = await fetch(`${BASE}/admin/stats?${qp.toString()}`, {
    cache: 'no-store',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem('eq_admin_token'); throw new Error('Session expired'); }
    throw new Error('Failed to load stats');
  }
  return res.json();
}

export async function toggleAdminExcludedIp(ip, ignore) {
  const token = localStorage.getItem('eq_admin_token');
  const res = await fetch(`${BASE}/admin/excluded-ips/toggle`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip, ignore }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem('eq_admin_token'); throw new Error('Session expired'); }
    throw new Error(data.detail || 'Toggle failed');
  }
  return data;
}

export async function saveAdminExcludedIps(ips) {
  const token = localStorage.getItem('eq_admin_token');
  const res = await fetch(`${BASE}/admin/excluded-ips`, {
    method: 'PUT',
    cache: 'no-store',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ips }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem('eq_admin_token'); throw new Error('Session expired'); }
    throw new Error(data.detail || 'Failed to save IP filters');
  }
  return data;
}

export async function fetchAdminUsers(q = '', limit = 200) {
  const token = localStorage.getItem('eq_admin_token');
  const qp = new URLSearchParams();
  if (q) qp.set('q', q);
  qp.set('limit', String(limit));
  qp.set('_', String(Date.now()));
  const res = await fetch(`${BASE}/admin/users?${qp.toString()}`, {
    cache: 'no-store',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem('eq_admin_token'); throw new Error('Session expired'); }
    throw new Error(data.detail || 'Failed to load users');
  }
  return data;
}

export async function updateAdminUser(userId, patch) {
  const token = localStorage.getItem('eq_admin_token');
  const res = await fetch(`${BASE}/admin/users/${userId}`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem('eq_admin_token'); throw new Error('Session expired'); }
    throw new Error(data.detail || 'Failed to update user');
  }
  return data;
}

export async function deleteAdminUser(userId) {
  const token = localStorage.getItem('eq_admin_token');
  const res = await fetch(`${BASE}/admin/users/${userId}`, {
    method: 'DELETE',
    cache: 'no-store',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem('eq_admin_token'); throw new Error('Session expired'); }
    throw new Error(data.detail || 'Failed to delete user');
  }
  return data;
}

export async function previewAdminNewsletter({ audience, user_ids }) {
  const token = localStorage.getItem('eq_admin_token');
  const res = await fetch(`${BASE}/admin/newsletter/preview`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ audience, user_ids: user_ids ?? undefined }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem('eq_admin_token'); throw new Error('Session expired'); }
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Preview failed');
  }
  return data;
}

export async function sendAdminNewsletter({ kind, subject, html_body, audience, user_ids }) {
  const token = localStorage.getItem('eq_admin_token');
  const res = await fetch(`${BASE}/admin/newsletter/send`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, subject, html_body, audience, user_ids: user_ids ?? undefined }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem('eq_admin_token'); throw new Error('Session expired'); }
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Send failed');
  }
  return data;
}

export async function fetchAdminNewsletterHistory(limit = 30) {
  const token = localStorage.getItem('eq_admin_token');
  const qp = new URLSearchParams();
  qp.set('limit', String(limit));
  qp.set('_', String(Date.now()));
  const res = await fetch(`${BASE}/admin/newsletter/history?${qp.toString()}`, {
    cache: 'no-store',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem('eq_admin_token'); throw new Error('Session expired'); }
    throw new Error(data.detail || 'Failed to load send history');
  }
  return data;
}

// ─── Public articles (SEO / Learn hub) ───
export async function fetchPublishedArticles(cluster = '') {
  const qp = new URLSearchParams();
  if (cluster) qp.set('cluster', cluster);
  const q = qp.toString();
  const res = await fetch(`${BASE}/articles${q ? `?${q}` : ''}`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to load articles');
  return data;
}

export async function fetchPublishedArticle(slug) {
  const res = await fetch(`${BASE}/articles/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Article not found');
  return data;
}

// ─── Admin articles ───
export async function fetchAdminArticles({ q = '', status = '', limit = 200 } = {}) {
  const token = localStorage.getItem('eq_admin_token');
  const qp = new URLSearchParams();
  if (q) qp.set('q', q);
  if (status) qp.set('status', status);
  qp.set('limit', String(limit));
  qp.set('_', String(Date.now()));
  const res = await fetch(`${BASE}/admin/articles?${qp.toString()}`, {
    cache: 'no-store',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem('eq_admin_token'); throw new Error('Session expired'); }
    throw new Error(data.detail || 'Failed to load articles');
  }
  return data;
}

export async function fetchAdminArticle(id) {
  const token = localStorage.getItem('eq_admin_token');
  const res = await fetch(`${BASE}/admin/articles/${id}`, {
    cache: 'no-store',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem('eq_admin_token'); throw new Error('Session expired'); }
    throw new Error(data.detail || 'Failed to load article');
  }
  return data;
}

export async function createAdminArticle(body) {
  const token = localStorage.getItem('eq_admin_token');
  const res = await fetch(`${BASE}/admin/articles`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem('eq_admin_token'); throw new Error('Session expired'); }
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Create failed');
  }
  return data;
}

export async function patchAdminArticle(id, body) {
  const token = localStorage.getItem('eq_admin_token');
  const res = await fetch(`${BASE}/admin/articles/${id}`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem('eq_admin_token'); throw new Error('Session expired'); }
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Save failed');
  }
  return data;
}

export async function deleteAdminArticle(id) {
  const token = localStorage.getItem('eq_admin_token');
  const res = await fetch(`${BASE}/admin/articles/${id}`, {
    method: 'DELETE',
    cache: 'no-store',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem('eq_admin_token'); throw new Error('Session expired'); }
    throw new Error(data.detail || 'Delete failed');
  }
  return data;
}

// ─── AI Agent ───
export async function agentChat(message, ticker = '') {
  const res = await fetch(`${BASE}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, ticker }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Agent unavailable' }));
    const msg = typeof err.detail === 'string' ? err.detail : Array.isArray(err.detail) ? err.detail.map(e => e.msg || e).join(', ') : JSON.stringify(err.detail);
    throw new Error(msg || 'Agent error');
  }
  return res.json();
}

export async function agentQuick(message, ticker = '') {
  const res = await fetch(`${BASE}/agent/quick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, ticker }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Agent unavailable' }));
    const msg = typeof err.detail === 'string' ? err.detail : Array.isArray(err.detail) ? err.detail.map(e => e.msg || e).join(', ') : JSON.stringify(err.detail);
    throw new Error(msg || 'Agent error');
  }
  return res.json();
}

export async function agentHealth() {
  try {
    const res = await fetch(`${BASE}/agent/health`);
    return res.json();
  } catch { return { status: 'offline' }; }
}

export async function fetchAiPicks({ refresh = false } = {}) {
  const res = await fetch(`${BASE}/picks`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to load AI picks');
  return data;
}

export async function fetchRedditPicks({ refresh = false } = {}) {
  const res = await fetch(`${BASE}/picks/reddit`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to load Reddit picks');
  return data;
}

// ─── Agent E2EE History (server-synced) ───
export async function fetchAgentE2EEMeta() {
  const token = getToken();
  const res = await fetch(`${BASE}/agent/e2ee/meta`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to load E2EE meta');
  return data;
}

export async function bootstrapAgentE2EE(meta) {
  const token = getToken();
  const res = await fetch(`${BASE}/agent/e2ee/bootstrap`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to bootstrap E2EE');
  return data;
}

export async function rewrapAgentE2EE(meta) {
  const token = getToken();
  const res = await fetch(`${BASE}/agent/e2ee/rewrap`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to update E2EE meta');
  return data;
}

export async function fetchAgentHistory() {
  const token = getToken();
  const res = await fetch(`${BASE}/agent/history`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(data.detail || 'Failed to load agent history');
  return data;
}

export async function putAgentHistory(blob) {
  const token = getToken();
  const res = await fetch(`${BASE}/agent/history`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ blob }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to save agent history');
  return data;
}

export async function forgotPassword(email) {
  const res = await fetch(`${BASE}/auth/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return res.json();
}

export async function resetPassword(token, password) {
  const res = await fetch(`${BASE}/auth/reset-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Reset failed');
  return data;
}

export async function verifyEmail(token) {
  const res = await fetch(`${BASE}/auth/verify-email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Verification failed');
  return data;
}

export async function resendVerification() {
  const token = getToken();
  const res = await fetch(`${BASE}/auth/resend-verification`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Resend failed');
  return data;
}

export async function resendVerificationPublic(email) {
  const res = await fetch(`${BASE}/auth/resend-verification-public`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Resend failed');
  return data;
}

export async function fetchStrategies() {
  const res = await fetch(`${BASE}/strategies`);
  if (!res.ok) throw new Error('Failed to fetch strategies');
  return res.json();
}

export async function fetchStockData(symbol, period = '2y') {
  const res = await fetch(`${BASE}/stock/${symbol}?period=${period}`);
  if (!res.ok) throw new Error(`Failed to fetch data for ${symbol}`);
  return res.json();
}

export async function runBacktest(params) {
  const res = await fetch(`${BASE}/backtest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Backtest failed');
  }
  return res.json();
}

export async function compareStrategies(params) {
  const res = await fetch(`${BASE}/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Comparison failed');
  }
  return res.json();
}

export async function runScreener(params) {
  const res = await fetch(`${BASE}/screener`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Screener failed');
  }
  return res.json();
}

export async function fetchScreenerLists() {
  const res = await fetch(`${BASE}/screener/lists`);
  if (!res.ok) throw new Error('Failed to fetch lists');
  return res.json();
}

export async function fetchStockDetail(symbol) {
  const res = await fetch(`${BASE}/stock/${symbol}/detail`);
  if (!res.ok) throw new Error(`Failed to fetch detail for ${symbol}`);
  return res.json();
}

export async function fetchNews(symbols = '') {
  const res = await fetch(`${BASE}/news?symbols=${encodeURIComponent(symbols)}`);
  if (!res.ok) throw new Error('Failed to fetch news');
  return res.json();
}

export async function fetchMarketOverview() {
  const res = await fetch(`${BASE}/market/overview`);
  if (!res.ok) throw new Error('Failed to fetch market data');
  return res.json();
}

export async function fetchCrypto() {
  const res = await fetch(`${BASE}/crypto`);
  if (!res.ok) throw new Error('Failed to fetch crypto data');
  return res.json();
}

// Terminal APIs
export async function fetchTerminalChart(symbol, period = '1y', interval = '1d') {
  const res = await fetch(`${BASE}/terminal/chart/${symbol}?period=${period}&interval=${interval}`);
  if (!res.ok) throw new Error(`Chart data failed for ${symbol}`);
  return res.json();
}

export async function fetchTerminalIndicators(symbol, period = '1y', interval = '1d', indicators = 'sma_20,sma_50,volume') {
  const res = await fetch(`${BASE}/terminal/indicators/${symbol}?period=${period}&interval=${interval}&indicators=${indicators}`);
  if (!res.ok) throw new Error(`Indicators failed for ${symbol}`);
  return res.json();
}

export async function fetchAiInsight(symbol, period = '1y') {
  const res = await fetch(`${BASE}/terminal/ai-insight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, period }),
  });
  if (!res.ok) throw new Error(`AI insight failed for ${symbol}`);
  return res.json();
}

export async function fetchResearch(symbol) {
  const res = await fetch(`${BASE}/research/${symbol}`);
  if (!res.ok) throw new Error(`Research failed for ${symbol}`);
  return res.json();
}

export async function fetchWatchlistPrices(symbols) {
  const res = await fetch(`${BASE}/terminal/watchlist-prices?symbols=${symbols.join(',')}`);
  if (!res.ok) throw new Error('Watchlist fetch failed');
  return res.json();
}

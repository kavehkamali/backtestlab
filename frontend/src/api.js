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

export async function checkInteraction() {
  const res = await fetch(`${BASE}/auth/interaction`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) return { exceeded: false, count: 0, remaining: 999 };
  return res.json();
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

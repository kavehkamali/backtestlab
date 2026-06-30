import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Loader2, Search, ExternalLink, Clock, TrendingUp, TrendingDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell, ComposedChart, Line, LineChart, PieChart, Pie } from 'recharts';
import { fetchMacroOverview, fetchResearch, searchSymbols } from '../api';
import SnowflakeChart from './SnowflakeChart';
import { buildResearchPriceChartRows, formatResearchPriceXTick } from '../utils/marketHeroChart';
import TerminalPanel from './terminal/TerminalPanel';
import ComparePanel from './ComparePanel';
import ResearchDashboard from './research/ResearchDashboard';

const RESEARCH_RECENTS_KEY = 'eq_research_recent_symbols_v1';
const DEFAULT_RESEARCH_SHORTCUTS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'JPM', 'V', 'WMT', 'UNH', 'XOM'];
const RESEARCH_SEARCH_INDEX = [
  ['AAPL', 'Apple Inc.'],
  ['MSFT', 'Microsoft Corporation'],
  ['GOOGL', 'Alphabet Inc. Class A'],
  ['GOOG', 'Alphabet Inc. Class C'],
  ['AMZN', 'Amazon.com Inc.'],
  ['NVDA', 'NVIDIA Corporation'],
  ['TSLA', 'Tesla Inc.'],
  ['META', 'Meta Platforms Inc.'],
  ['JPM', 'JPMorgan Chase & Co.'],
  ['V', 'Visa Inc.'],
  ['WMT', 'Walmart Inc.'],
  ['UNH', 'UnitedHealth Group Incorporated'],
  ['XOM', 'Exxon Mobil Corporation'],
  ['MA', 'Mastercard Incorporated'],
  ['LLY', 'Eli Lilly and Company'],
  ['AVGO', 'Broadcom Inc.'],
  ['COST', 'Costco Wholesale Corporation'],
  ['PG', 'Procter & Gamble Company'],
  ['HD', 'Home Depot Inc.'],
  ['JNJ', 'Johnson & Johnson'],
  ['ABBV', 'AbbVie Inc.'],
  ['BAC', 'Bank of America Corporation'],
  ['KO', 'Coca-Cola Company'],
  ['NFLX', 'Netflix Inc.'],
  ['MRK', 'Merck & Co. Inc.'],
  ['CVX', 'Chevron Corporation'],
  ['AMD', 'Advanced Micro Devices Inc.'],
  ['CRM', 'Salesforce Inc.'],
  ['PEP', 'PepsiCo Inc.'],
  ['ADBE', 'Adobe Inc.'],
  ['TMO', 'Thermo Fisher Scientific Inc.'],
  ['ORCL', 'Oracle Corporation'],
  ['LIN', 'Linde plc'],
  ['ACN', 'Accenture plc'],
  ['MCD', "McDonald's Corporation"],
  ['CSCO', 'Cisco Systems Inc.'],
  ['ABT', 'Abbott Laboratories'],
  ['IBM', 'International Business Machines Corporation'],
  ['GE', 'GE Aerospace'],
  ['QCOM', 'Qualcomm Incorporated'],
  ['TXN', 'Texas Instruments Incorporated'],
  ['INTC', 'Intel Corporation'],
  ['AMAT', 'Applied Materials Inc.'],
  ['MU', 'Micron Technology Inc.'],
  ['ARM', 'Arm Holdings plc'],
  ['SMCI', 'Super Micro Computer Inc.'],
  ['DELL', 'Dell Technologies Inc.'],
  ['PANW', 'Palo Alto Networks Inc.'],
  ['NOW', 'ServiceNow Inc.'],
  ['CRWD', 'CrowdStrike Holdings Inc.'],
  ['DDOG', 'Datadog Inc.'],
  ['ZS', 'Zscaler Inc.'],
  ['NET', 'Cloudflare Inc.'],
  ['PLTR', 'Palantir Technologies Inc.'],
  ['SHOP', 'Shopify Inc.'],
  ['UBER', 'Uber Technologies Inc.'],
  ['ABNB', 'Airbnb Inc.'],
  ['COIN', 'Coinbase Global Inc.'],
  ['PYPL', 'PayPal Holdings Inc.'],
  ['SQ', 'Block Inc.'],
  ['SOFI', 'SoFi Technologies Inc.'],
  ['RIVN', 'Rivian Automotive Inc.'],
  ['LCID', 'Lucid Group Inc.'],
  ['DIS', 'Walt Disney Company'],
  ['NKE', 'Nike Inc.'],
  ['SBUX', 'Starbucks Corporation'],
  ['TGT', 'Target Corporation'],
  ['LOW', "Lowe's Companies Inc."],
  ['CAT', 'Caterpillar Inc.'],
  ['BA', 'Boeing Company'],
  ['GS', 'Goldman Sachs Group Inc.'],
  ['MS', 'Morgan Stanley'],
  ['WFC', 'Wells Fargo & Company'],
  ['C', 'Citigroup Inc.'],
  ['BLK', 'BlackRock Inc.'],
  ['BX', 'Blackstone Inc.'],
  ['SCHW', 'Charles Schwab Corporation'],
  ['T', 'AT&T Inc.'],
  ['VZ', 'Verizon Communications Inc.'],
  ['TMUS', 'T-Mobile US Inc.'],
  ['PFE', 'Pfizer Inc.'],
  ['NVO', 'Novo Nordisk A/S'],
  ['TSM', 'Taiwan Semiconductor Manufacturing Company'],
  ['ASML', 'ASML Holding N.V.'],
  ['BABA', 'Alibaba Group Holding Limited'],
  ['PDD', 'PDD Holdings Inc.'],
  ['NIO', 'NIO Inc.'],
  ['SPY', 'SPDR S&P 500 ETF Trust'],
  ['QQQ', 'Invesco QQQ Trust'],
  ['IWM', 'iShares Russell 2000 ETF'],
  ['DIA', 'SPDR Dow Jones Industrial Average ETF'],
  ['TLT', 'iShares 20+ Year Treasury Bond ETF'],
  ['GLD', 'SPDR Gold Shares'],
  ['SLV', 'iShares Silver Trust'],
  ['USO', 'United States Oil Fund'],
  ['RY.TO', 'Royal Bank of Canada'],
  ['TD.TO', 'Toronto-Dominion Bank'],
  ['SHOP.TO', 'Shopify Inc. TSX'],
  ['ENB.TO', 'Enbridge Inc.'],
  ['CNR.TO', 'Canadian National Railway Company'],
  ['CP.TO', 'Canadian Pacific Kansas City Limited'],
  ['BNS.TO', 'Bank of Nova Scotia'],
  ['BMO.TO', 'Bank of Montreal'],
  ['BCE.TO', 'BCE Inc.'],
  ['SU.TO', 'Suncor Energy Inc.'],
].map(([symbol, name]) => ({ symbol, name }));

const RESEARCH_ASSET_INDEX = [
  { symbol: 'GC=F', name: 'Gold futures', type: 'commodity', aliases: ['gold', 'gold futures', 'xau', 'xauusd', 'gc=f'] },
  { symbol: 'GLD', name: 'SPDR Gold Shares', type: 'etf', aliases: ['gld', 'gold etf'], chartIds: ['hard_assets', 'precious_metals'] },
  { symbol: 'SI=F', name: 'Silver futures', type: 'commodity', aliases: ['silver', 'silver futures', 'xag', 'xagusd', 'si=f'] },
  { symbol: 'SLV', name: 'iShares Silver Trust', type: 'etf', aliases: ['slv', 'silver etf'], chartIds: ['precious_metals'] },
  { symbol: 'CL=F', name: 'WTI crude oil futures', type: 'commodity', aliases: ['oil', 'wti', 'crude', 'crude oil', 'oil futures', 'cl=f'] },
  { symbol: 'USO', name: 'United States Oil Fund', type: 'etf', aliases: ['uso', 'oil etf'], chartIds: ['hard_assets', 'commodities_demand', 'oil_exposure'] },
  { symbol: 'BZ=F', name: 'Brent crude oil futures', type: 'commodity', aliases: ['brent', 'brent oil', 'bz=f'] },
  { symbol: 'NG=F', name: 'Natural gas futures', type: 'commodity', aliases: ['natural gas', 'nat gas', 'gas futures', 'ng=f'] },
  { symbol: 'HG=F', name: 'Copper futures', type: 'commodity', aliases: ['copper', 'copper futures', 'hg=f'] },
  { symbol: 'BTC-USD', name: 'Bitcoin', type: 'crypto', aliases: ['bitcoin', 'btc', 'btc usd', 'btc-usd'] },
  { symbol: 'ETH-USD', name: 'Ethereum', type: 'crypto', aliases: ['ethereum', 'ether', 'eth', 'eth usd', 'eth-usd'] },
  { symbol: 'SOL-USD', name: 'Solana', type: 'crypto', aliases: ['solana', 'sol', 'sol usd', 'sol-usd'] },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', type: 'etf', aliases: ['spy', 's&p etf', 'sp500 etf'], chartIds: ['risk', 'global_equity', 'risk_volatility'] },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', type: 'etf', aliases: ['qqq', 'nasdaq etf', 'technology etf'], chartIds: ['risk', 'risk_volatility'] },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', type: 'etf', aliases: ['iwm', 'russell etf', 'small cap etf'], chartIds: ['risk'] },
  { symbol: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF', type: 'etf', aliases: ['dia', 'dow etf'], chartIds: ['risk'] },
  { symbol: '^GSPC', name: 'S&P 500 Index', type: 'index', aliases: ['s&p 500', 'sp500', 's and p', 's and p 500', 'spx', '^gspc'] },
  { symbol: '^IXIC', name: 'Nasdaq Composite', type: 'index', aliases: ['nasdaq', 'nasdaq composite', '^ixic'] },
  { symbol: '^DJI', name: 'Dow Jones Industrial Average', type: 'index', aliases: ['dow', 'dow jones', '^dji'] },
  { symbol: '^RUT', name: 'Russell 2000 Index', type: 'index', aliases: ['russell 2000', 'small cap index', '^rut'] },
  { symbol: '^VIX', name: 'CBOE Volatility Index', type: 'index', aliases: ['vix', 'volatility index', '^vix'] },
  { symbol: 'DX-Y.NYB', name: 'US Dollar Index', type: 'currency', aliases: ['usd index', 'dxy', 'dollar index', 'us dollar index', 'dx-y.nyb'] },
  { symbol: '^TNX', name: 'US 10Y Treasury Yield', type: 'yield', aliases: ['10y', '10 year', '10-year', 'us 10y', 'treasury yield', 'tnx', '^tnx'] },
  { symbol: 'TLT', name: '20+ Year Treasury Bond ETF', type: 'bond', aliases: ['tlt', 'long bonds', 'long treasury', 'treasury bonds'] },
  { symbol: 'VNQ', name: 'US Real Estate ETF', type: 'etf', aliases: ['vnq', 'real estate etf', 'reit etf', 'real estate'], chartIds: ['us_real_estate'] },
  { symbol: 'UNRATE', name: 'US Unemployment Rate', type: 'macro', aliases: ['unemployment', 'unemployment rate', 'job market', 'jobs market', 'labor market', 'unrate'], chartIds: ['rates_jobs', 'labor'], chartable: false },
  { symbol: 'JOLTS', name: 'US Job Openings', type: 'macro', aliases: ['job openings', 'jobs openings', 'jolts', 'labor demand', 'payrolls', 'employment'], chartIds: ['labor'], chartable: false },
  { symbol: 'FEDFUNDS', name: 'Fed Funds Rate', type: 'macro', aliases: ['fed funds', 'fed rate', 'fed rates', 'interest rates', 'policy rate'], chartIds: ['rates_jobs', 'us_curve', 'inflation_policy', 'us_fixed_variable_proxy'], chartable: false },
  { symbol: 'CPIAUCSL', name: 'US CPI Inflation Index', type: 'macro', aliases: ['cpi', 'inflation', 'consumer price index'], chartIds: ['inflation_policy'], chartable: false },
  { symbol: 'USDEBT', name: 'US Federal Debt', type: 'macro', aliases: ['us debt', 'federal debt', 'government debt', 'debt'], chartIds: ['debt_jobs'], chartable: false },
  { symbol: 'DEFICIT', name: 'US Federal Deficit Pressure', type: 'macro', aliases: ['deficit', 'federal deficit', 'us deficit'], chartIds: ['debt_jobs'], chartable: false },
  { symbol: 'GDP', name: 'GDP Growth', type: 'macro', aliases: ['gdp', 'world gdp', 'us gdp', 'global gdp', 'north america gdp'], chartIds: ['gdp_growth', 'world_gdp', 'north_america_gdp'], chartable: false },
];

function normalizeResearchSearch(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9.]+/g, ' ');
}

function getResearchRecents() {
  if (typeof window === 'undefined') return DEFAULT_RESEARCH_SHORTCUTS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RESEARCH_RECENTS_KEY) || '[]');
    const clean = parsed.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim().toUpperCase());
    return clean.length ? clean.slice(0, 12) : DEFAULT_RESEARCH_SHORTCUTS;
  } catch {
    return DEFAULT_RESEARCH_SHORTCUTS;
  }
}

function saveResearchRecents(symbols) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RESEARCH_RECENTS_KEY, JSON.stringify(symbols.slice(0, 12)));
  } catch {
    // Ignore storage failures; the search still works without shortcuts.
  }
}

// ─── Helpers ───
function fmtNum(v, dec = 2) { return v != null ? Number(v).toFixed(dec) : '—'; }
function fmtPct(v) { return v != null ? `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%` : '—'; }
function fmtLarge(v) {
  if (!v) return '—';
  v = Number(v);
  if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}
function PctSpan({ value }) {
  if (value == null) return <span className="text-zinc-600">—</span>;
  const c = value > 0 ? 'text-emerald-600' : value < 0 ? 'text-red-600' : 'text-zinc-500';
  return <span className={c}>{value > 0 ? '+' : ''}{Number(value).toFixed(2)}%</span>;
}
function Stat({ label, value, sub, color }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-zinc-100">
      <span className="text-zinc-500 text-xs">{label}</span>
      <div className="text-right">
        <span className={`text-xs font-medium ${color || 'text-zinc-700'}`}>{value ?? '—'}</span>
        {sub && <div className="text-[9px] text-zinc-600">{sub}</div>}
      </div>
    </div>
  );
}
function GradeBadge({ grade, label, score }) {
  const colors = {
    'A': 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
    'B': 'bg-green-500/15 text-green-400 border-green-500/30',
    'C': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    'D': 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    'F': 'bg-red-500/15 text-red-600 border-red-500/30',
  };
  const cls = colors[grade] || 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200/80';
  return (
    <div className="text-center">
      <div className={`w-10 h-10 rounded-lg border flex items-center justify-center text-lg font-bold ${cls}`}>{grade || '—'}</div>
      <div className="text-[9px] text-zinc-500 mt-1">{label}</div>
    </div>
  );
}
function QuantMetricRow({ grade, label, primary, secondary }) {
  const colors = {
    'A': 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
    'B': 'bg-green-500/15 text-green-600 border-green-500/30',
    'C': 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
    'D': 'bg-orange-500/15 text-orange-600 border-orange-500/30',
    'F': 'bg-red-500/15 text-red-600 border-red-500/30',
  };
  const cls = colors[grade] || 'bg-zinc-100 text-zinc-500 border-zinc-200';
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-white/70 px-2.5 py-2 ring-1 ring-zinc-200/70">
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-base font-bold ${cls}`}>{grade || '—'}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
        <div className="truncate text-xs font-semibold text-zinc-800">{primary}</div>
        {secondary && <div className="truncate text-[10px] text-zinc-500">{secondary}</div>}
      </div>
    </div>
  );
}
function Card({ title, children }) {
  return (
    <div className="bg-zinc-50/90 shadow-sm ring-1 ring-zinc-200/70 rounded-xl p-4">
      {title && <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2 font-semibold">{title}</div>}
      {children}
    </div>
  );
}
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-[10px]">
      <p className="text-zinc-500 mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' ? fmtLarge(p.value) : p.value}</p>)}
    </div>
  );
}

function PriceHistoryTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const d = row?.date || row?.label;
  const c = row?.close;
  return (
    <div className="bg-white ring-1 ring-zinc-200/80 rounded-lg px-3 py-2 text-[10px] dark:bg-zinc-800 dark:ring-zinc-600">
      <p className="text-zinc-500 mb-1 dark:text-zinc-400">{d}</p>
      <p className="text-zinc-900 font-medium dark:text-zinc-100">
        Close: {typeof c === 'number' ? `$${c.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : c}
      </p>
    </div>
  );
}

// SnowflakeChart imported from ./SnowflakeChart.jsx

// ─── DCF Fair Value Bar ───
function FairValueBar({ dcf, targetMean }) {
  if (!dcf?.fair_value) return null;
  const { fair_value, current_price, discount_pct, undervalued } = dcf;
  const bars = [
    { label: 'Current', value: current_price, tone: undervalued ? 'bg-emerald-500/35' : 'bg-red-500/35' },
    { label: 'DCF', value: fair_value, tone: 'bg-indigo-500/35' },
    targetMean ? { label: 'Target', value: targetMean, tone: 'bg-sky-500/35' } : null,
  ].filter(Boolean);
  const values = bars.map((bar) => Number(bar.value)).filter(Number.isFinite);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const heightPct = (value) => values.length > 1 ? 35 + ((Number(value) - low) / span) * 65 : 100;
  const deltaPct = (value) => current_price ? ((Number(value) / Number(current_price)) - 1) * 100 : null;
  return (
    <div>
      <div className="mb-2 flex h-44 items-end justify-center gap-5">
        {bars.map((bar) => {
          const delta = deltaPct(bar.value);
          return (
            <div key={bar.label} className="w-16 text-center">
              <div
                className={`mx-auto flex w-10 flex-col justify-start rounded-t-md px-1 ${bar.tone}`}
                style={{ height: `${heightPct(bar.value)}%` }}
              >
                <div className="pt-1 text-[10px] font-bold text-zinc-900">${fmtNum(bar.value, 2)}</div>
                {bar.label !== 'Current' && delta != null && (
                  <div className={`text-[9px] font-semibold ${delta >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                  </div>
                )}
              </div>
              <div className="mt-1 text-[9px] font-medium text-zinc-500">{bar.label}</div>
            </div>
          );
        })}
      </div>
      <div className={`text-center text-sm font-bold ${undervalued ? 'text-emerald-600' : 'text-red-600'}`}>
        {undervalued ? `${Math.abs(discount_pct)}% undervalued` : `${discount_pct}% overvalued`}
      </div>
      <div className="mt-1 text-center text-[9px] text-zinc-500">Relative scale</div>
    </div>
  );
}

// ─── Ownership Pie ───
function OwnershipPie({ data }) {
  if (!data?.length) return null;
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={120} height={120}>
        <PieChart>
          <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={50} paddingAngle={2}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
            <span className="text-xs text-zinc-500">{d.name}</span>
            <span className="text-xs text-zinc-900 font-medium">{d.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Risk Checklist ───
function RiskChecklist({ checks }) {
  if (!checks?.length) return null;
  const passed = checks.filter(c => c.pass).length;
  return (
    <div>
      <div className="text-xs text-zinc-500 mb-2">
        <span className="text-emerald-600 font-bold">{passed}</span>/{checks.length} checks passed
      </div>
      <div className="space-y-1.5">
        {checks.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${c.pass ? 'bg-emerald-500/20 text-emerald-600' : 'bg-red-500/20 text-red-600'}`}>
              {c.pass ? '✓' : '✗'}
            </div>
            <span className="text-xs text-zinc-600 flex-1">{c.label}</span>
            <span className={`text-[10px] font-mono ${c.pass ? 'text-emerald-600' : 'text-red-600'}`}>{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TABS ───
const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'financials', label: 'Financials' },
  { id: 'terminal', label: 'Chart' },
  { id: 'news', label: 'News' },
  { id: 'ownership', label: 'Ownership' },
];

const ASSET_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'terminal', label: 'Chart', chartOnly: true },
  { id: 'macro', label: 'Macro' },
  { id: 'asset_news', label: 'News' },
];

function resolveResearchSymbolFromText(message) {
  const raw = String(message || '');
  const upper = raw.toUpperCase();
  const tickerMatch = upper.match(/\b[A-Z][A-Z0-9.-]{0,9}(?:\.TO)?\b/g) || [];
  for (const token of tickerMatch) {
    if (RESEARCH_SEARCH_INDEX.some((item) => item.symbol === token)) return token;
  }
  const normalized = normalizeResearchSearch(raw);
  const compact = normalized.replace(/\s+/g, '');
  const hit = RESEARCH_SEARCH_INDEX
    .map((item) => {
      const symbolNorm = item.symbol.toLowerCase();
      const nameNorm = normalizeResearchSearch(item.name);
      const nameCompact = nameNorm.replace(/\s+/g, '');
      let score = 0;
      if (symbolNorm === compact) score = 100;
      else if (normalized.includes(nameNorm)) score = 95;
      else if (nameNorm.includes(normalized) && normalized.length >= 3) score = 78;
      else if (nameCompact.includes(compact) && compact.length >= 3) score = 72;
      else if (normalized.includes(symbolNorm)) score = 68;
      return { symbol: item.symbol, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0];
  return hit?.symbol || null;
}

function normalizeAssetToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9.^=-]+/g, ' ');
}

function assetAliasMatches(lower, compact, alias) {
  const aliasNorm = normalizeAssetToken(alias);
  const aliasCompact = aliasNorm.replace(/\s+/g, '');
  if (!aliasNorm) return false;
  if (compact === aliasCompact) return true;
  if (/[.^=-]/.test(aliasNorm)) return lower.includes(aliasNorm);
  return aliasNorm.length >= 3 && ` ${lower} `.includes(` ${aliasNorm} `);
}

function findResearchAsset(value) {
  const raw = String(value || '');
  if (!raw.trim()) return null;
  const lower = normalizeAssetToken(raw);
  const compact = lower.replace(/\s+/g, '');
  const upper = raw.trim().toUpperCase();

  for (const asset of RESEARCH_ASSET_INDEX) {
    const symbolNorm = asset.symbol.toLowerCase();
    if (upper === asset.symbol || compact === symbolNorm || lower.includes(symbolNorm)) return { ...asset, stock: false };
    if (asset.aliases.some((alias) => assetAliasMatches(lower, compact, alias))) {
      return { ...asset, stock: false };
    }
  }
  const stock = RESEARCH_SEARCH_INDEX.find((item) => item.symbol === upper);
  if (stock) return { symbol: stock.symbol, name: stock.name, type: 'stock', stock: true };
  return null;
}

function resolveResearchTargetFromText(message, tickers = []) {
  const combined = String(message || '');
  const combinedAsset = findResearchAsset(combined);
  if (combinedAsset) return combinedAsset;
  for (const ticker of tickers || []) {
    const asset = findResearchAsset(ticker);
    if (asset) return asset;
  }
  const stockSymbol = resolveResearchSymbolFromText(combined);
  if (!stockSymbol) return null;
  const item = RESEARCH_SEARCH_INDEX.find((x) => x.symbol === stockSymbol);
  return { symbol: stockSymbol, name: item?.name || stockSymbol, type: 'stock', stock: true };
}

function resolveResearchTargetFromAssistant(detail = {}) {
  const userMessage = String(detail.userMessage || '');
  const response = String(detail.response || '');
  const tickers = detail.tickers || [];
  const userAsset = findResearchAsset(userMessage);
  const userStockSymbol = resolveResearchSymbolFromText(userMessage);
  const userMentionsStockIntent = /\b(stock|stocks|share|shares|company|companies|ticker|equity|equities)\b/i.test(userMessage);
  const userMentionsAssetIntent = /\b(gold|silver|bitcoin|ethereum|crypto|oil price|crude|wti|brent|natural gas|copper|usd index|dxy|yield|treasury|s&p|nasdaq|dow|vix|unemployment|job openings|jobs|labor|fed funds|fed rate|cpi|inflation|deficit|debt|gdp)\b/i.test(userMessage);

  if (userAsset && (!userStockSymbol || userMentionsAssetIntent || !userMentionsStockIntent)) return userAsset;
  if (userStockSymbol) {
    const item = RESEARCH_SEARCH_INDEX.find((x) => x.symbol === userStockSymbol);
    return { symbol: userStockSymbol, name: item?.name || userStockSymbol, type: 'stock', stock: true };
  }

  for (const ticker of tickers) {
    const asset = findResearchAsset(ticker);
    if (asset) return asset;
  }

  const responseAsset = findResearchAsset(response);
  if (responseAsset) return responseAsset;
  return resolveResearchTargetFromText([userMessage, response, detail.message].filter(Boolean).join('\n\n'), tickers);
}

const PRICE_WINDOWS = [
  { key: '1M', label: '1M', days: 21 },
  { key: '3M', label: '3M', days: 63 },
  { key: '6M', label: '6M', days: 126 },
  { key: 'YTD', label: 'YTD', ytd: true },
  { key: '1Y', label: '1Y', days: 252 },
  { key: '2Y', label: '2Y', days: 504 },
];

function filterPriceWindow(chart, windowKey) {
  if (!chart?.length) return [];
  const opt = PRICE_WINDOWS.find((w) => w.key === windowKey) || PRICE_WINDOWS[PRICE_WINDOWS.length - 1];
  if (opt.ytd) {
    const year = new Date().getFullYear();
    const rows = chart.filter((row) => Number(String(row.date || '').slice(0, 4)) === year);
    return rows.length ? rows : chart.slice(-126);
  }
  return chart.slice(-Math.min(opt.days, chart.length));
}

// ═══════════════════════════════════════════
// SUMMARY TAB
// ═══════════════════════════════════════════
// ─── Adaptive (non-stock) asset research ───
const ASSET_RESEARCH_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'terminal', label: 'Chart' },
  { id: 'risk', label: 'Risk' },
  { id: 'macro', label: 'Macro' },
  { id: 'asset_news', label: 'News' },
];

function fmtCompactNum(v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function assetMetricTiles(s, ac) {
  const px = (v) => (v != null ? `$${v}` : '—');
  if (ac === 'crypto') {
    return [
      ['Market Cap', s.market_cap_fmt || '—'],
      ['24h Volume', fmtCompactNum(s.volume_24h)],
      ['Circulating Supply', fmtCompactNum(s.circulating_supply)],
      ['Max Supply', s.max_supply ? fmtCompactNum(s.max_supply) : '—'],
      ['52W High', px(s.high_52w)],
      ['52W Low', px(s.low_52w)],
    ];
  }
  if (ac === 'etf') {
    return [
      ['AUM', s.total_assets_fmt || '—'],
      ['Yield', s.yield_pct != null ? `${s.yield_pct}%` : '—'],
      ['Category', s.category || '—'],
      ['Fund Family', s.fund_family || '—'],
      ['YTD Return', s.ytd_return != null ? fmtPct(s.ytd_return * 100) : '—'],
      ['Volume', fmtCompactNum(s.volume)],
      ['52W High', px(s.high_52w)],
      ['52W Low', px(s.low_52w)],
    ];
  }
  if (ac === 'commodity') {
    return [
      ['Contract', s.contract || '—'],
      ['Exchange', s.exchange || '—'],
      ['Day High', px(s.day_high)],
      ['Day Low', px(s.day_low)],
      ['52W High', px(s.high_52w)],
      ['52W Low', px(s.low_52w)],
      ['Open Interest', s.open_interest != null ? fmtCompactNum(s.open_interest) : '—'],
      ['Volume', fmtCompactNum(s.volume)],
    ];
  }
  // index / forex / bond — level/rate based
  return [
    ['Open', s.open != null ? s.open : '—'],
    ['Day High', s.day_high != null ? s.day_high : '—'],
    ['Day Low', s.day_low != null ? s.day_low : '—'],
    ['52W High', s.high_52w != null ? s.high_52w : '—'],
    ['52W Low', s.low_52w != null ? s.low_52w : '—'],
    ['Volume', s.volume != null ? fmtCompactNum(s.volume) : '—'],
  ];
}

function AssetResearch({ data }) {
  const s = data.summary || {};
  const ac = data.asset_class || 'asset';
  const rm = data.risk_metrics || {};
  const chart = data.chart || [];
  const [priceWindow, setPriceWindow] = useState('1Y');
  const rows = filterPriceWindow(chart, priceWindow);
  const { chartData: priceChartRows, xTicks: priceXTicks } = buildResearchPriceChartRows(rows, 260);
  const tiles = assetMetricTiles(s, ac);
  const up = (s.change || 0) >= 0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">{s.name}</h2>
          <div className="text-xs text-zinc-500 mt-0.5">
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700 ring-1 ring-indigo-100">{s.asset_class_label || ac}</span>
            <span className="ml-2">{s.symbol}{s.exchange ? ` · ${s.exchange}` : ''}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-zinc-900">{s.price != null ? s.price : '—'} <span className="text-xs font-medium text-zinc-400">{s.currency || ''}</span></div>
          <div className={`text-sm font-semibold ${up ? 'text-emerald-600' : 'text-red-600'}`}>
            {s.change != null ? `${s.change >= 0 ? '+' : ''}${s.change} (${fmtPct(s.change_pct)})` : '—'}
          </div>
        </div>
      </div>

      {rm.performance && Object.keys(rm.performance).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(rm.performance).map(([k, v]) => (
            <div key={k} className={`px-3 py-1.5 rounded-lg text-center ${v >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              <div className="text-[9px] text-zinc-500">{k}</div>
              <div className={`text-xs font-bold ${v >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{v > 0 ? '+' : ''}{v}%</div>
            </div>
          ))}
        </div>
      )}

      <Card title="Key Stats">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {tiles.map(([label, value]) => <Stat key={label} label={label} value={value} />)}
        </div>
      </Card>

      {priceChartRows.length > 0 && (
        <Card>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Price History</div>
            <div className="flex flex-wrap gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
              {PRICE_WINDOWS.map((w) => (
                <button key={w.key} type="button" onClick={() => setPriceWindow(w.key)}
                  className={`h-6 min-w-8 rounded-md px-2 text-[10px] font-medium transition ${
                    priceWindow === w.key ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-700 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-800'
                  }`}>{w.label}</button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={priceChartRows} margin={{ top: 4, right: 8, left: 4, bottom: 8 }}>
              <defs><linearGradient id="rg_asset" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" />
              <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} ticks={priceXTicks}
                tickFormatter={(t) => formatResearchPriceXTick(t)} tick={{ fontSize: 9, fill: '#444' }} tickLine={false} axisLine={{ stroke: '#d4d4d8' }} minTickGap={14} />
              <YAxis tick={{ fontSize: 9, fill: '#444' }} domain={['auto', 'auto']} width={50} />
              <Tooltip content={<PriceHistoryTooltip />} />
              <Area type="monotone" dataKey="close" stroke="#6366f1" fill="url(#rg_asset)" strokeWidth={1.5} name="Close" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {s.description && (
        <Card title="About">
          <p className="text-xs leading-relaxed text-zinc-600">{String(s.description).slice(0, 600)}</p>
        </Card>
      )}
    </div>
  );
}

function SummaryTab({ data }) {
  const s = data.summary;
  const g = data.grades || {};
  const p = data.profitability || {};
  const gr = data.growth || {};
  const b = data.balance || {};
  const rc = data.revenue_chart || [];
  const rm = data.risk_metrics || {};
  const chart = data.chart || [];
  const [priceWindow, setPriceWindow] = useState('1Y');
  const priceWindowRows = filterPriceWindow(chart, priceWindow);
  const { chartData: priceChartRows, xTicks: priceXTicks } = buildResearchPriceChartRows(priceWindowRows, 260);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">{s.name}</h2>
          <div className="text-xs text-zinc-500 mt-0.5">{s.exchange} · {s.sector} · {s.industry}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-zinc-900">${s.price}</div>
          <div className={`text-sm font-semibold ${s.change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {s.change >= 0 ? '+' : ''}{s.change} ({fmtPct(s.change_pct)})
          </div>
        </div>
      </div>

      {/* Performance badges */}
      {rm.performance && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(rm.performance).map(([k, v]) => (
            <div key={k} className={`px-3 py-1.5 rounded-lg text-center ${v >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              <div className="text-[9px] text-zinc-500">{k}</div>
              <div className={`text-xs font-bold ${v >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{v > 0 ? '+' : ''}{v}%</div>
            </div>
          ))}
        </div>
      )}

      {/* Snowflake + DCF + Ownership + Risk — SWS-style row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title="Snowflake Analysis">
          <SnowflakeChart data={data.snowflake} />
        </Card>
        <Card title="Fair Value (DCF)">
          <FairValueBar dcf={data.dcf} targetMean={s.target_mean} />
        </Card>
        <Card title="Ownership Breakdown">
          <OwnershipPie data={data.ownership_pie} />
        </Card>
        <Card title="Health Check">
          <RiskChecklist checks={data.risk_checks} />
        </Card>
      </div>

      {/* Price Chart */}
      {priceChartRows.length > 0 && (
        <Card>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Price History</div>
            <div className="flex flex-wrap gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
              {PRICE_WINDOWS.map((w) => (
                <button
                  key={w.key}
                  type="button"
                  onClick={() => setPriceWindow(w.key)}
                  className={`h-6 min-w-8 rounded-md px-2 text-[10px] font-medium transition ${
                    priceWindow === w.key
                      ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-700 dark:text-zinc-100 dark:ring-zinc-600'
                      : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={priceChartRows} margin={{ top: 4, right: 8, left: 4, bottom: 8 }}>
              <defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" />
              <XAxis
                dataKey="ts"
                type="number"
                domain={['dataMin', 'dataMax']}
                ticks={priceXTicks}
                tickFormatter={(t) => formatResearchPriceXTick(t)}
                tick={{ fontSize: 9, fill: '#444' }}
                tickLine={false}
                axisLine={{ stroke: '#d4d4d8' }}
                minTickGap={14}
              />
              <YAxis tick={{ fontSize: 9, fill: '#444' }} domain={['auto', 'auto']} tickFormatter={v => `$${v}`} width={50} />
              <Tooltip content={<PriceHistoryTooltip />} />
              <Area type="monotone" dataKey="close" stroke="#6366f1" fill="url(#rg)" strokeWidth={1.5} name="Close" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Revenue / Earnings + Quant Grades */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {rc.length > 0 && (
          <Card title="Revenue & Earnings (Annual)">
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={rc}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" />
                <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#444' }} />
                <YAxis tick={{ fontSize: 9, fill: '#444' }} tickFormatter={v => fmtLarge(v)} width={60} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="revenue" fill="#6366f140" name="Revenue" radius={[3, 3, 0, 0]} />
                <Bar dataKey="gross_profit" fill="#22c55e30" name="Gross Profit" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="net_income" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} name="Net Income" />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        )}
        <Card title="Quant Rating">
          <div className="grid min-h-[200px] content-center gap-2 sm:grid-cols-2">
            <QuantMetricRow
              grade={g.valuation?.grade}
              label="Valuation"
              primary={`P/E ${fmtNum(s.pe_trailing, 1)} · Fwd ${fmtNum(s.pe_forward, 1)}`}
              secondary={`P/S ${fmtNum(s.price_to_sales)} · EV/EBITDA ${fmtNum(s.ev_to_ebitda)}`}
            />
            <QuantMetricRow
              grade={g.growth?.grade}
              label="Growth"
              primary={`Revenue ${fmtPct(gr.revenue_growth_pct)}`}
              secondary={`Earnings ${fmtPct(gr.earnings_growth_pct)}`}
            />
            <QuantMetricRow
              grade={g.profitability?.grade}
              label="Profitability"
              primary={`Margin ${fmtPct(p.profit_margin_pct)}`}
              secondary={`ROE ${fmtPct(p.return_on_equity_pct)}`}
            />
            <QuantMetricRow
              grade={g.momentum?.grade}
              label="Momentum"
              primary={`1M ${fmtPct(rm.performance?.['1M'])}`}
              secondary={`3M ${fmtPct(rm.performance?.['3M'])} · 1Y ${fmtPct(rm.performance?.['1Y'])}`}
            />
          </div>
        </Card>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Valuation">
          <Stat label="Market Cap" value={s.market_cap_fmt} />
          <Stat label="Enterprise Value" value={s.enterprise_value_fmt} />
          <Stat label="P/E (TTM)" value={fmtNum(s.pe_trailing, 1)} />
          <Stat label="Forward P/E" value={fmtNum(s.pe_forward, 1)} />
          <Stat label="PEG Ratio" value={fmtNum(s.peg_ratio)} />
          <Stat label="Price/Sales" value={fmtNum(s.price_to_sales)} />
          <Stat label="Price/Book" value={fmtNum(s.price_to_book)} />
          <Stat label="EV/Revenue" value={fmtNum(s.ev_to_revenue)} />
          <Stat label="EV/EBITDA" value={fmtNum(s.ev_to_ebitda)} />
        </Card>
        <Card title="Profitability">
          <Stat label="Gross Margin" value={fmtPct(p.gross_margin_pct)} color={p.gross_margin_pct > 0 ? 'text-emerald-600' : 'text-red-600'} />
          <Stat label="Operating Margin" value={fmtPct(p.operating_margin_pct)} color={p.operating_margin_pct > 0 ? 'text-emerald-600' : 'text-red-600'} />
          <Stat label="Profit Margin" value={fmtPct(p.profit_margin_pct)} color={p.profit_margin_pct > 0 ? 'text-emerald-600' : 'text-red-600'} />
          <Stat label="ROE" value={fmtPct(p.return_on_equity_pct)} />
          <Stat label="ROA" value={fmtPct(p.return_on_assets_pct)} />
        </Card>
        <Card title="Growth & Cash Flow">
          <Stat label="Revenue" value={gr.revenue_fmt} />
          <Stat label="Revenue Growth" value={fmtPct(gr.revenue_growth_pct)} color={gr.revenue_growth_pct > 0 ? 'text-emerald-600' : 'text-red-600'} />
          <Stat label="Earnings Growth" value={fmtPct(gr.earnings_growth_pct)} color={gr.earnings_growth_pct > 0 ? 'text-emerald-600' : 'text-red-600'} />
          <Stat label="EBITDA" value={gr.ebitda_fmt} />
          <Stat label="Free Cash Flow" value={gr.free_cash_flow_fmt} />
          <Stat label="Operating Cash Flow" value={gr.operating_cash_flow_fmt} />
          <Stat label="EPS (TTM)" value={s.eps_trailing != null ? `$${fmtNum(s.eps_trailing)}` : '—'} />
          <Stat label="EPS (Forward)" value={s.eps_forward != null ? `$${fmtNum(s.eps_forward)}` : '—'} />
        </Card>
        <Card title="Balance Sheet">
          <Stat label="Total Cash" value={b.total_cash_fmt} />
          <Stat label="Cash/Share" value={b.total_cash_per_share != null ? `$${fmtNum(b.total_cash_per_share)}` : '—'} />
          <Stat label="Total Debt" value={b.total_debt_fmt} />
          <Stat label="Debt/Equity" value={fmtNum(b.debt_to_equity, 1)} />
          <Stat label="Current Ratio" value={fmtNum(b.current_ratio)} />
          <Stat label="Quick Ratio" value={fmtNum(b.quick_ratio)} />
          <Stat label="Book Value" value={b.book_value != null ? `$${fmtNum(b.book_value)}` : '—'} />
        </Card>
      </div>

      {/* Analyst Target */}
      {s.target_mean && s.high_52w && s.low_52w && (
        <Card title="Analyst Price Target">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="relative h-2 bg-zinc-100 rounded-full">
                <div className="absolute h-full bg-indigo-500/30 rounded-full" style={{
                  left: `${Math.max(0, (s.target_low - s.low_52w) / (s.high_52w - s.low_52w) * 100)}%`,
                  right: `${Math.max(0, 100 - (s.target_high - s.low_52w) / (s.high_52w - s.low_52w) * 100)}%`,
                }} />
                <div className="absolute w-2 h-2 bg-white rounded-full -top-0" style={{
                  left: `${Math.min(100, Math.max(0, (s.price - s.low_52w) / (s.high_52w - s.low_52w) * 100))}%`,
                }} />
              </div>
              <div className="flex justify-between mt-1 text-[9px] text-zinc-600">
                <span>${s.target_low}</span>
                <span className="text-indigo-600 font-semibold">${s.target_mean} avg</span>
                <span>${s.target_high}</span>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-sm font-bold ${s.target_mean > s.price ? 'text-emerald-600' : 'text-red-600'}`}>
                {((s.target_mean / s.price - 1) * 100).toFixed(1)}% upside
              </div>
              <div className="text-[9px] text-zinc-600">{s.analyst_count} analysts · {s.recommendation}</div>
            </div>
          </div>
        </Card>
      )}

      <RatingsPeersSection data={data} />

      {/* About */}
      {s.description && (
        <Card title={`About ${s.name}`}>
          <p className="text-xs text-zinc-500 leading-relaxed line-clamp-6">{s.description}</p>
          <div className="flex gap-4 mt-3 text-[10px] text-zinc-500">
            {s.employees && <span>Employees: {s.employees.toLocaleString()}</span>}
            {s.country && <span>{s.country}</span>}
            {s.website && <a href={s.website} target="_blank" className="text-indigo-600 hover:underline flex items-center gap-0.5">{s.website.replace('https://', '')} <ExternalLink className="w-2.5 h-2.5" /></a>}
          </div>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// RATINGS TAB
// ═══════════════════════════════════════════
function RatingsTab({ data }) {
  const s = data.summary;
  const rs = data.ratings_summary || {};
  const recs = data.recommendations || [];

  // Build ratings bar from current month
  const currentRating = rs["0m"] || rs["0M"] || Object.values(rs)[0] || {};
  const total = (currentRating.strong_buy || 0) + (currentRating.buy || 0) + (currentRating.hold || 0) + (currentRating.sell || 0) + (currentRating.strong_sell || 0);

  return (
    <div className="space-y-5">
      {/* Wall Street Consensus */}
      <Card title="Wall Street Consensus">
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-zinc-900 capitalize">{s.recommendation || '—'}</div>
            <div className="text-xs text-zinc-500 mt-1">Mean: {s.recommendation_mean || '—'}</div>
          </div>
          {total > 0 && (
            <div className="flex-1">
              <div className="flex h-6 rounded-lg overflow-hidden">
                {[
                  { key: 'strong_buy', color: '#22c55e', label: 'Strong Buy' },
                  { key: 'buy', color: '#4ade80', label: 'Buy' },
                  { key: 'hold', color: '#f59e0b', label: 'Hold' },
                  { key: 'sell', color: '#f87171', label: 'Sell' },
                  { key: 'strong_sell', color: '#ef4444', label: 'Strong Sell' },
                ].map(({ key, color }) => {
                  const val = currentRating[key] || 0;
                  if (val === 0) return null;
                  return <div key={key} style={{ width: `${(val / total) * 100}%`, background: color }} className="flex items-center justify-center text-[9px] font-bold text-black">{val}</div>;
                })}
              </div>
              <div className="flex justify-between mt-1 text-[8px] text-zinc-500">
                <span>Strong Buy</span><span>Buy</span><span>Hold</span><span>Sell</span><span>Strong Sell</span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Price Target */}
      {s.target_mean && (
        <Card title="Price Target">
          <div className="grid grid-cols-4 gap-3 text-center">
            <div><div className="text-[9px] text-zinc-500">Low</div><div className="text-sm font-bold text-red-600">${s.target_low}</div></div>
            <div><div className="text-[9px] text-zinc-500">Average</div><div className="text-sm font-bold text-indigo-600">${s.target_mean}</div></div>
            <div><div className="text-[9px] text-zinc-500">High</div><div className="text-sm font-bold text-emerald-600">${s.target_high}</div></div>
            <div><div className="text-[9px] text-zinc-500">Current</div><div className="text-sm font-bold text-zinc-900">${s.price}</div></div>
          </div>
        </Card>
      )}

      {/* Recent Analyst Actions */}
      {recs.length > 0 && (
        <Card title="Recent Analyst Ratings">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-zinc-200/80 text-zinc-500">
                <th className="text-left py-2 px-2 font-medium">Date</th>
                <th className="text-left py-2 px-2 font-medium">Firm</th>
                <th className="text-left py-2 px-2 font-medium">Action</th>
                <th className="text-left py-2 px-2 font-medium">From</th>
                <th className="text-left py-2 px-2 font-medium">To</th>
              </tr></thead>
              <tbody>
                {recs.map((r, i) => (
                  <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="py-1.5 px-2 text-zinc-500">{r.date}</td>
                    <td className="py-1.5 px-2 text-zinc-600">{r.firm}</td>
                    <td className="py-1.5 px-2 text-zinc-500">{r.action}</td>
                    <td className="py-1.5 px-2 text-zinc-500">{r.from_grade || '—'}</td>
                    <td className="py-1.5 px-2 text-zinc-900 font-medium">{r.to_grade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// FINANCIALS TAB
// ═══════════════════════════════════════════
function FinancialsTab({ data }) {
  const [stmt, setStmt] = useState('income');
  const [period, setPeriod] = useState('annual');

  const stmtMap = {
    income: { annual: data.financials_annual, quarterly: data.financials_quarterly },
    balance: { annual: data.balance_sheet_annual, quarterly: data.balance_sheet_quarterly },
    cashflow: { annual: data.cashflow_annual, quarterly: data.cashflow_quarterly },
  };
  const items = stmtMap[stmt]?.[period] || [];

  const fieldMap = {
    income: ['Total Revenue', 'Cost Of Revenue', 'Gross Profit', 'Operating Income', 'Net Income', 'EBITDA', 'Operating Expense', 'Research And Development', 'Interest Expense', 'Tax Provision', 'Diluted EPS', 'Basic EPS'],
    balance: ['Total Assets', 'Total Liabilities Net Minority Interest', 'Total Equity Gross Minority Interest', 'Cash And Cash Equivalents', 'Current Assets', 'Current Liabilities', 'Total Debt', 'Net Debt', 'Stockholders Equity', 'Working Capital', 'Invested Capital'],
    cashflow: ['Operating Cash Flow', 'Capital Expenditure', 'Free Cash Flow', 'Investing Cash Flow', 'Financing Cash Flow', 'Repurchase Of Capital Stock', 'Issuance Of Debt', 'Repayment Of Debt', 'Cash Dividends Paid'],
  };

  const fields = fieldMap[stmt] || [];
  const available = fields.filter(f => items.some(row => row[f] != null));

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-center">
        <div className="flex gap-1">
          {[{ id: 'income', label: 'Income' }, { id: 'balance', label: 'Balance Sheet' }, { id: 'cashflow', label: 'Cash Flow' }].map(s => (
            <button key={s.id} onClick={() => setStmt(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${stmt === s.id ? 'bg-indigo-500/20 text-indigo-700' : 'text-zinc-500 hover:text-zinc-600'}`}>{s.label}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {['annual', 'quarterly'].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${period === p ? 'bg-indigo-100 text-indigo-900' : 'text-zinc-500 hover:text-zinc-600'}`}>{p === 'annual' ? 'Annual' : 'Quarterly'}</button>
          ))}
        </div>
      </div>
      {items.length === 0 ? <div className="text-zinc-600 text-sm py-8 text-center">No data available</div> : (
        <div className="bg-zinc-50/90 shadow-sm ring-1 ring-zinc-200/70 rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-200/80">
              <th className="text-left py-2.5 px-3 text-zinc-500 font-medium sticky left-0 bg-zinc-100 z-10">Metric</th>
              {items.map((r, i) => <th key={i} className="text-right py-2.5 px-3 text-zinc-500 font-medium whitespace-nowrap">{r.period?.slice(0, 7)}</th>)}
            </tr></thead>
            <tbody>
              {available.map(f => (
                <tr key={f} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="py-2 px-3 text-zinc-500 sticky left-0 bg-white z-10 font-medium whitespace-nowrap">{f}</td>
                  {items.map((r, i) => <td key={i} className="py-2 px-3 text-right text-zinc-600 font-mono whitespace-nowrap">{r[f] != null ? fmtLarge(r[f]) : '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <EarningsTab data={data} />
      <DividendsTab data={data} />
    </div>
  );
}

// ═══════════════════════════════════════════
// EARNINGS TAB
// ═══════════════════════════════════════════
function EarningsTab({ data }) {
  const items = data.earnings_history || [];
  const rc = data.revenue_chart || [];
  return (
    <div className="space-y-5">
      {rc.length > 0 && (
        <Card title="Revenue & Net Income Trend">
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={rc}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" />
              <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#444' }} />
              <YAxis tick={{ fontSize: 9, fill: '#444' }} tickFormatter={v => fmtLarge(v)} width={60} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="revenue" fill="#6366f140" name="Revenue" radius={[3, 3, 0, 0]} />
              <Line type="monotone" dataKey="net_income" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} name="Net Income" />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      )}
      {items.length === 0 ? <div className="text-zinc-600 text-sm py-8 text-center">No earnings data</div> : (
        <Card title="Earnings History">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-200/80 text-zinc-500">
              <th className="text-left py-2 px-2 font-medium">Date</th>
              <th className="text-right py-2 px-2 font-medium">EPS Est</th>
              <th className="text-right py-2 px-2 font-medium">EPS Actual</th>
              <th className="text-right py-2 px-2 font-medium">Surprise</th>
            </tr></thead>
            <tbody>
              {items.map((e, i) => {
                const est = e['EPS Estimate'], actual = e['Reported EPS'], surp = e['Surprise(%)'];
                return (
                  <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="py-2 px-2 text-zinc-600">{e.date}</td>
                    <td className="py-2 px-2 text-right text-zinc-500">{est != null ? `$${fmtNum(est)}` : '—'}</td>
                    <td className="py-2 px-2 text-right text-zinc-700 font-medium">{actual != null ? `$${fmtNum(actual)}` : '—'}</td>
                    <td className="py-2 px-2 text-right">{surp != null ? <span className={surp >= 0 ? 'text-emerald-600' : 'text-red-600'}>{surp > 0 ? '+' : ''}{fmtNum(surp, 1)}%</span> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// DIVIDENDS TAB
// ═══════════════════════════════════════════
function DividendsTab({ data }) {
  const s = data.summary;
  const dg = data.dividend_growth || {};
  const divs = data.dividends || [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Annual Dividend', value: s.dividend_rate ? `$${fmtNum(s.dividend_rate)}` : '—' },
          { label: 'Yield', value: s.dividend_yield_pct ? `${s.dividend_yield_pct}%` : '—' },
          { label: 'Payout Ratio', value: s.payout_ratio ? `${(s.payout_ratio * 100).toFixed(1)}%` : '—' },
          { label: 'YoY Growth', value: dg.yoy != null ? `${dg.yoy > 0 ? '+' : ''}${dg.yoy.toFixed(1)}%` : '—' },
          { label: 'Consec. Years', value: dg.consecutive_years ?? '—' },
        ].map((item, i) => (
          <div key={i} className="bg-zinc-50/90 shadow-sm ring-1 ring-zinc-200/70 rounded-xl p-3 text-center">
            <div className="text-[9px] text-zinc-500 uppercase tracking-wider">{item.label}</div>
            <div className="text-sm font-bold text-zinc-900 mt-1">{item.value}</div>
          </div>
        ))}
      </div>
      {(dg.cagr_3y != null || dg.cagr_5y != null) && (
        <Card title="Dividend Growth Rates">
          <Stat label="3-Year CAGR" value={dg.cagr_3y != null ? `${dg.cagr_3y.toFixed(1)}%` : '—'} />
          <Stat label="5-Year CAGR" value={dg.cagr_5y != null ? `${dg.cagr_5y.toFixed(1)}%` : '—'} />
        </Card>
      )}
      {divs.length > 0 && (
        <Card title="Dividend History">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={divs}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" />
              <XAxis dataKey="date" tick={{ fontSize: 8, fill: '#444' }} interval={Math.max(0, Math.floor(divs.length / 8))} />
              <YAxis tick={{ fontSize: 9, fill: '#444' }} tickFormatter={v => `$${v}`} width={40} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="amount" fill="#6366f1" radius={[3, 3, 0, 0]} name="Dividend" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// RISK TAB
// ═══════════════════════════════════════════
function RiskTab({ data }) {
  const rm = data.risk_metrics || {};
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Sharpe Ratio', value: rm.sharpe_ratio, good: rm.sharpe_ratio >= 1 },
          { label: 'Sortino Ratio', value: rm.sortino_ratio, good: rm.sortino_ratio >= 1 },
          { label: 'Max Drawdown', value: rm.max_drawdown != null ? `${rm.max_drawdown.toFixed(1)}%` : '—', good: false },
          { label: 'Volatility (Ann)', value: rm.volatility_annual != null ? `${rm.volatility_annual}%` : '—' },
          { label: 'VaR (95%)', value: rm.var_95 != null ? `${rm.var_95.toFixed(2)}%` : '—' },
        ].map((item, i) => (
          <div key={i} className="bg-zinc-50/90 shadow-sm ring-1 ring-zinc-200/70 rounded-xl p-3 text-center">
            <div className="text-[9px] text-zinc-500 uppercase tracking-wider">{item.label}</div>
            <div className={`text-sm font-bold mt-1 ${item.good === true ? 'text-emerald-600' : item.good === false ? 'text-red-600' : 'text-zinc-900'}`}>
              {typeof item.value === 'number' ? fmtNum(item.value, 3) : item.value}
            </div>
          </div>
        ))}
      </div>
      <Card title="Performance">
        {rm.performance && Object.entries(rm.performance).map(([k, v]) => (
          <Stat key={k} label={k} value={fmtPct(v)} color={v >= 0 ? 'text-emerald-600' : 'text-red-600'} />
        ))}
        <Stat label="Beta" value={fmtNum(rm.beta)} />
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════
// OWNERSHIP TAB
// ═══════════════════════════════════════════
function OwnershipTab({ data }) {
  const o = data.ownership || {};
  const ins = data.insider_transactions || [];
  const inst = data.institutional_holders || [];
  const funds = data.fund_holders || [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Insider Ownership', value: o.insider_pct != null ? `${o.insider_pct}%` : '—' },
          { label: 'Institutional', value: o.institution_pct != null ? `${o.institution_pct}%` : '—' },
          { label: 'Short % Float', value: o.short_pct_float != null ? `${o.short_pct_float}%` : '—' },
          { label: 'Short Ratio', value: o.short_ratio ? fmtNum(o.short_ratio, 1) : '—' },
        ].map((item, i) => (
          <div key={i} className="bg-zinc-50/90 shadow-sm ring-1 ring-zinc-200/70 rounded-xl p-3 text-center">
            <div className="text-[9px] text-zinc-500 uppercase tracking-wider">{item.label}</div>
            <div className="text-sm font-bold text-zinc-900 mt-1">{item.value}</div>
          </div>
        ))}
      </div>

      {inst.length > 0 && (
        <Card title="Top Institutional Holders">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-200/80 text-zinc-500">
              <th className="text-left py-2 px-2 font-medium">Holder</th>
              <th className="text-right py-2 px-2 font-medium">Shares</th>
              <th className="text-right py-2 px-2 font-medium">% Out</th>
              <th className="text-right py-2 px-2 font-medium">Value</th>
            </tr></thead>
            <tbody>
              {inst.map((h, i) => (
                <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="py-1.5 px-2 text-zinc-600 max-w-[200px] truncate">{h.holder}</td>
                  <td className="py-1.5 px-2 text-right text-zinc-500">{h.shares ? Number(h.shares).toLocaleString() : '—'}</td>
                  <td className="py-1.5 px-2 text-right text-zinc-500">{h.pct_out != null ? `${(h.pct_out * 100).toFixed(2)}%` : '—'}</td>
                  <td className="py-1.5 px-2 text-right text-zinc-600">{h.value ? fmtLarge(h.value) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {funds.length > 0 && (
        <Card title="Top Mutual Fund Holders">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-200/80 text-zinc-500">
              <th className="text-left py-2 px-2 font-medium">Fund</th>
              <th className="text-right py-2 px-2 font-medium">Shares</th>
              <th className="text-right py-2 px-2 font-medium">% Out</th>
            </tr></thead>
            <tbody>
              {funds.map((h, i) => (
                <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="py-1.5 px-2 text-zinc-600 max-w-[200px] truncate">{h.holder}</td>
                  <td className="py-1.5 px-2 text-right text-zinc-500">{h.shares ? Number(h.shares).toLocaleString() : '—'}</td>
                  <td className="py-1.5 px-2 text-right text-zinc-500">{h.pct_out != null ? `${(h.pct_out * 100).toFixed(2)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {ins.length > 0 && (
        <Card title="Insider Transactions">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-200/80 text-zinc-500">
              <th className="text-left py-2 px-2 font-medium">Date</th>
              <th className="text-left py-2 px-2 font-medium">Insider</th>
              <th className="text-left py-2 px-2 font-medium">Transaction</th>
              <th className="text-right py-2 px-2 font-medium">Shares</th>
              <th className="text-right py-2 px-2 font-medium">Value</th>
            </tr></thead>
            <tbody>
              {ins.map((t, i) => (
                <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="py-1.5 px-2 text-zinc-500">{t.date?.slice(0, 10)}</td>
                  <td className="py-1.5 px-2 text-zinc-600 max-w-[140px] truncate">{t.insider}</td>
                  <td className="py-1.5 px-2">
                    <span className={`text-[10px] font-medium ${t.transaction?.toLowerCase().includes('sale') ? 'text-red-600' : 'text-emerald-600'}`}>{t.transaction}</span>
                  </td>
                  <td className="py-1.5 px-2 text-right text-zinc-500">{t.shares ? Number(t.shares).toLocaleString() : '—'}</td>
                  <td className="py-1.5 px-2 text-right text-zinc-600">{t.value ? fmtLarge(t.value) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// PEERS TAB
// ═══════════════════════════════════════════
function PeersTab({ data }) {
  const peers = data.peers || [];
  if (peers.length === 0) return <div className="text-zinc-600 text-sm py-8 text-center">No peer data</div>;
  return (
    <Card title="Peer Comparison">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-zinc-200/80 text-zinc-500">
            <th className="text-left py-2 px-3 font-medium">Company</th>
            <th className="text-right py-2 px-3 font-medium">Market Cap</th>
            <th className="text-right py-2 px-3 font-medium">P/E</th>
            <th className="text-right py-2 px-3 font-medium">Div %</th>
            <th className="text-right py-2 px-3 font-medium">Margin</th>
            <th className="text-right py-2 px-3 font-medium">Rev Growth</th>
            <th className="text-right py-2 px-3 font-medium">Beta</th>
          </tr></thead>
          <tbody>
            {peers.map((p, i) => (
              <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                <td className="py-2 px-3"><span className="font-semibold text-zinc-900">{p.symbol}</span> <span className="text-[9px] text-zinc-600 truncate">{p.name}</span></td>
                <td className="py-2 px-3 text-right text-zinc-600">{p.market_cap_fmt || '—'}</td>
                <td className="py-2 px-3 text-right text-zinc-600">{p.pe_ratio ? fmtNum(p.pe_ratio, 1) : '—'}</td>
                <td className="py-2 px-3 text-right text-zinc-600">{p.dividend_yield != null ? `${p.dividend_yield}%` : '—'}</td>
                <td className="py-2 px-3 text-right text-zinc-600">{p.profit_margin != null ? `${p.profit_margin}%` : '—'}</td>
                <td className="py-2 px-3 text-right"><PctSpan value={p.revenue_growth} /></td>
                <td className="py-2 px-3 text-right text-zinc-600">{p.beta ? fmtNum(p.beta) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RatingsPeersSection({ data }) {
  const peers = data.peers || [];
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <RatingsTab data={data} />
      <div className="min-w-0">
        {peers.length > 0 ? <PeersTab data={data} /> : (
          <Card title="Peer Comparison">
            <div className="py-8 text-center text-sm text-zinc-600">No peer data</div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// NEWS TAB
// ═══════════════════════════════════════════
function NewsTab({ data }) {
  const news = data.news || [];
  if (news.length === 0) return <div className="text-zinc-600 text-sm py-8 text-center">No news</div>;
  return (
    <div className="space-y-2">
      {news.map((a, i) => (
        <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
          className="flex gap-3 bg-zinc-50/90 shadow-sm ring-1 ring-zinc-200/70 rounded-xl p-3 hover:bg-zinc-100 hover:ring-zinc-300/80 transition-all group">
          {a.thumbnail && <div className="w-20 h-14 rounded-lg overflow-hidden shrink-0 bg-zinc-100"><img src={a.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" /></div>}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-zinc-700 group-hover:text-zinc-900 line-clamp-2">{a.title}</div>
            <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
              {a.source && <span>{a.source}</span>}
              {a.date && <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{new Date(a.date).toLocaleDateString()}</span>}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

function mergeResearchMacroSeries(chart) {
  const byDate = new Map();
  for (const series of chart?.series || []) {
    for (const point of series.data || []) {
      if (!point?.date) continue;
      const row = byDate.get(point.date) || { date: point.date };
      row[series.key] = point.value;
      byDate.set(point.date, row);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function ResearchMacroChart({ chart }) {
  if (chart?.type === 'bar') {
    const rows = (chart.bars || []).filter((row) => row.value != null);
    if (!rows.length) return null;
    return (
      <Card title={chart.title}>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-zinc-200" />
              <XAxis dataKey="label" interval={0} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-zinc-500" />
              <YAxis width={42} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-zinc-500" />
              <Tooltip formatter={(value) => [`${Number(value).toFixed(2)}%`, chart.subtitle || 'Value']} />
              <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                {rows.map((entry) => <Cell key={entry.label} fill={entry.value >= 0 ? (entry.color || '#34d399') : '#fb7185'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    );
  }

  const rows = mergeResearchMacroSeries(chart);
  if (!rows.length) return null;
  return (
    <Card title={chart.title}>
      <div className="mb-2 flex flex-wrap gap-3">
        {(chart.series || []).map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-[10px] text-zinc-500">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-zinc-200" />
            <XAxis dataKey="date" minTickGap={32} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-zinc-500" />
            <YAxis width={42} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-zinc-500" />
            <Tooltip formatter={(value, name) => [fmtNum(value, 2), (chart.series || []).find((s) => s.key === name)?.label || name]} />
            {(chart.series || []).map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function relatedMacroCharts(asset, macroData) {
  const charts = macroData?.charts || [];
  const ids = new Set(asset?.chartIds || []);
  const text = `${asset?.name || ''} ${asset?.symbol || ''} ${asset?.type || ''}`.toLowerCase();
  return charts
    .filter((chart) => {
      if (ids.has(chart.id)) return true;
      const title = `${chart.title || ''} ${chart.id || ''}`.toLowerCase();
      if (/bitcoin|ethereum|crypto|btc|eth/.test(text)) return /crypto|risk/.test(title);
      if (/gold|silver|copper|oil|commodity/.test(text)) return /commodity|gold|metal|oil|hard asset/.test(title);
      if (/yield|treasury|bond|rate|fed/.test(text)) return /rate|yield|bond|fed|curve/.test(title);
      if (/unemployment|job|labor/.test(text)) return /labor|job|rate/.test(title);
      if (/gdp/.test(text)) return /gdp|global|world/.test(title);
      if (/index|s&p|nasdaq|dow|russell|spy|qqq|iwm|dia/.test(text)) return /risk|global equity|volatility/.test(title);
      return false;
    })
    .slice(0, 4);
}

function AssetOverviewTab({ asset, macroData, macroLoading, onOpenTab }) {
  const macroCharts = relatedMacroCharts(asset, macroData);
  const matchedSignal = (macroData?.signals || []).find((item) => {
    const hay = `${item.asset || ''} ${item.symbol || ''}`.toLowerCase();
    return hay.includes(String(asset?.name || '').split(' ')[0]?.toLowerCase()) || hay.includes(String(asset?.symbol || '').toLowerCase());
  });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card title="Asset">
          <div className="text-lg font-bold text-zinc-900">{asset.name}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-zinc-500">{asset.type} · {asset.symbol}</div>
        </Card>
        <Card title="Research Mode">
          <div className="text-sm font-semibold text-zinc-900">{asset.chartable === false ? 'Macro series' : 'Market-traded asset'}</div>
          <div className="mt-1 text-xs text-zinc-500">
            {asset.chartable === false ? 'Uses macro charts and related economic context.' : 'Uses live chart data plus related macro context.'}
          </div>
        </Card>
        <Card title="Signal">
          {matchedSignal ? (
            <>
              <div className="text-sm font-semibold text-zinc-900">Short: {matchedSignal.short_term} · Long: {matchedSignal.long_term}</div>
              <div className="mt-1 text-xs text-zinc-500">{matchedSignal.rationale}</div>
            </>
          ) : (
            <div className="text-xs text-zinc-500">Use Macro for the closest economic drivers.</div>
          )}
        </Card>
      </div>
      <div className="flex flex-wrap gap-2">
        {asset.chartable !== false && (
          <button type="button" onClick={() => onOpenTab('terminal')} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
            Open chart
          </button>
        )}
        <button type="button" onClick={() => onOpenTab('macro')} className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200">
          Macro drivers
        </button>
        <button type="button" onClick={() => onOpenTab('asset_news')} className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200">
          Related news
        </button>
      </div>
      {macroLoading ? (
        <div className="flex h-32 items-center justify-center text-sm text-zinc-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading macro context...</div>
      ) : macroCharts.length ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {macroCharts.slice(0, 2).map((chart) => <ResearchMacroChart key={chart.id} chart={chart} />)}
        </div>
      ) : null}
    </div>
  );
}

function AssetMacroTab({ asset, macroData, macroLoading, macroError }) {
  if (macroLoading) return <div className="flex h-48 items-center justify-center text-sm text-zinc-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading macro context...</div>;
  if (macroError) return <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200/80">{macroError}</div>;
  const charts = relatedMacroCharts(asset, macroData);
  if (!charts.length) return <div className="py-8 text-center text-sm text-zinc-500">No related macro charts for {asset.name}.</div>;
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {charts.map((chart) => <ResearchMacroChart key={chart.id} chart={chart} />)}
    </div>
  );
}

function AssetNewsTab({ asset, macroData, macroLoading }) {
  if (macroLoading) return <div className="flex h-48 items-center justify-center text-sm text-zinc-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading news...</div>;
  const key = String(asset?.symbol || '').toLowerCase();
  const firstWord = String(asset?.name || '').split(' ')[0]?.toLowerCase();
  const news = (macroData?.news || []).filter((n) => {
    const hay = `${n.symbol || ''} ${n.title || ''}`.toLowerCase();
    return hay.includes(key) || (firstWord && hay.includes(firstWord));
  });
  const rows = news.length ? news : (macroData?.news || []).slice(0, 8);
  if (!rows.length) return <div className="py-8 text-center text-sm text-zinc-500">No related macro news.</div>;
  return (
    <div className="space-y-2">
      {rows.map((n, idx) => (
        <a key={`${n.symbol}-${idx}`} href={n.url || undefined} target="_blank" rel="noopener noreferrer"
          className="block rounded-xl bg-zinc-50/90 p-3 text-sm ring-1 ring-zinc-200/70 hover:bg-zinc-100">
          <div className="text-[11px] font-semibold text-zinc-500">{n.symbol} {n.publisher ? `/ ${n.publisher}` : ''}</div>
          <div className="mt-1 leading-snug text-zinc-800">{n.title}</div>
        </a>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// FUNDAMENTALS (symbol lookup + tabs)
// ═══════════════════════════════════════════
function ResearchFundamentals({
  view = 'research',
  strategies = [],
  onCompare,
  compareResults = null,
  compareLoading = false,
}) {
  const [symbol, setSymbol] = useState('AAPL');
  const [symbolInput, setSymbolInput] = useState('AAPL');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(view === 'backtest' ? 'backtest' : 'summary');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [recentSymbols, setRecentSymbols] = useState(getResearchRecents);
  const [assistantSymbols, setAssistantSymbols] = useState([]);
  const [assetContext, setAssetContext] = useState({ symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', stock: true });
  const [macroData, setMacroData] = useState(null);
  const [macroLoading, setMacroLoading] = useState(false);
  const [macroError, setMacroError] = useState('');
  const [liveResults, setLiveResults] = useState([]);
  const [agentIntent, setAgentIntent] = useState(''); // agent query/subtab -> card ordering
  const symbolRef = useRef(symbol);

  useEffect(() => {
    symbolRef.current = symbol;
  }, [symbol]);

  const loadSymbol = useCallback((sym) => {
    const s = String(sym).trim().toUpperCase();
    setSymbolInput(s);
    setLoading(true);
    setError(null);
    fetchResearch(s)
      .then(d => {
        const ac = d?.asset_class || 'stock';
        const isStock = ac === 'stock';
        const idx = RESEARCH_ASSET_INDEX.find((a) => a.symbol === s);
        setSymbol(s);
        setSymbolInput(s);
        setData(d);
        setAssetContext({
          symbol: s,
          name: d?.summary?.name || s,
          type: ac,
          stock: isStock,
          chartable: true,
          chartIds: idx?.chartIds || [],
        });
        setTab(view === 'backtest' ? 'backtest' : (isStock ? 'summary' : 'overview'));
        setRecentSymbols(prev => {
          const next = [s, ...prev.filter(item => item !== s)].slice(0, 12);
          saveResearchRecents(next);
          return next;
        });
      })
      .catch(e => setError(`No research found for "${s}". Keeping ${symbolRef.current || 'the previous ticker'}. ${e.message || ''}`.trim()))
      .finally(() => setLoading(false));
  }, [view]);

  const openChartAsset = useCallback((target) => {
    const asset = target || {};
    const s = String(asset.symbol || '').trim().toUpperCase();
    if (!s) return;
    setSymbol(s);
    setSymbolInput(s);
    setData(null);
    setError(null);
    setLoading(false);
    setTab(asset.chartable === false ? 'macro' : 'overview');
    setAssetContext({
      ...asset,
      symbol: s,
      name: asset.name || s,
      type: asset.type || 'asset',
      stock: false,
    });
    setAssistantSymbols(prev => [s, ...prev.filter(item => item !== s)].slice(0, 12));
    setRecentSymbols(prev => {
      const next = [s, ...prev.filter(item => item !== s)].slice(0, 12);
      saveResearchRecents(next);
      return next;
    });
  }, []);

  useEffect(() => {
    setTab(view === 'backtest' ? 'backtest' : 'summary');
  }, [view]);

  useEffect(() => {
    if (assetContext?.stock !== false) return;
    if (macroData || macroLoading) return;
    setMacroLoading(true);
    setMacroError('');
    fetchMacroOverview()
      .then(setMacroData)
      .catch((e) => setMacroError(e.message || 'Failed to load macro context'))
      .finally(() => setMacroLoading(false));
  }, [assetContext?.stock, macroData, macroLoading]);

  useEffect(() => { loadSymbol('AAPL'); }, [loadSymbol]);

  useEffect(() => {
    const onAgentTicker = (e) => {
      const { tab, ticker } = e.detail || {};
      if (tab !== 'research' || !ticker) return;
      const target = resolveResearchTargetFromText(ticker, [ticker]);
      if (target && target.stock === false && target.chartable === false) openChartAsset(target);
      else loadSymbol(target?.symbol || ticker);
    };
    window.addEventListener('eq-agent-open-ticker', onAgentTicker);
    return () => window.removeEventListener('eq-agent-open-ticker', onAgentTicker);
  }, [loadSymbol, openChartAsset]);

  useEffect(() => {
    const onAssistantQuery = (e) => {
      const detail = e.detail || {};
      if (detail.userMessage || detail.message) setAgentIntent(String(detail.userMessage || detail.message));
      const target = resolveResearchTargetFromAssistant(detail);
      if (!target) return;
      if (target.stock === false && target.chartable === false) openChartAsset(target);
      else loadSymbol(target.symbol);
    };
    window.addEventListener('eq-research-assistant-result', onAssistantQuery);
    return () => window.removeEventListener('eq-research-assistant-result', onAssistantQuery);
  }, [loadSymbol, openChartAsset]);

  useEffect(() => {
    const onAssistantTickers = (e) => {
      const next = [...new Set((e.detail?.tickers || [])
        .map((s) => String(s || '').trim().toUpperCase())
        .filter(Boolean))]
        .slice(0, 12);
      if (next.length) setAssistantSymbols(next);
    };
    window.addEventListener('eq-research-assistant-tickers', onAssistantTickers);
    return () => window.removeEventListener('eq-research-assistant-tickers', onAssistantTickers);
  }, []);

  useEffect(() => {
    const onSub = (e) => {
      const sub = e.detail?.sub;
      if (sub) setAgentIntent(sub === 'fundamentals' ? 'financials' : sub);
      if (sub === 'terminal' || sub === 'chart') setTab('terminal');
      else if (sub === 'backtest') setTab('backtest');
      else if (sub === 'fundamentals') setTab('summary');
    };
    window.addEventListener('eq-research-subtab', onSub);
    return () => window.removeEventListener('eq-research-subtab', onSub);
  }, []);

  const localSuggestions = useMemo(() => {
    const raw = symbolInput.trim();
    const q = normalizeResearchSearch(raw);
    if (!q) return [];
    const compact = q.replace(/\s+/g, '');
    const stockMatches = RESEARCH_SEARCH_INDEX
      .map(item => {
        const symbolNorm = item.symbol.toLowerCase();
        const nameNorm = normalizeResearchSearch(item.name);
        const nameCompact = nameNorm.replace(/\s+/g, '');
        let score = 0;
        if (symbolNorm === compact) score = 100;
        else if (nameNorm === q) score = 96;
        else if (symbolNorm.startsWith(compact)) score = 90 - symbolNorm.length / 10;
        else if (nameNorm.startsWith(q)) score = 82 - nameNorm.length / 100;
        else if (nameCompact.startsWith(compact)) score = 78 - nameCompact.length / 100;
        else if (symbolNorm.includes(compact)) score = 70 - symbolNorm.indexOf(compact);
        else if (nameNorm.includes(q)) score = 62 - nameNorm.indexOf(q) / 10;
        else if (nameCompact.includes(compact)) score = 58 - nameCompact.indexOf(compact) / 10;
        return { ...item, score };
      })
      .filter(item => item.score > 0)
      .map(item => ({ ...item, type: 'stock', stock: true }));
    const assetMatches = RESEARCH_ASSET_INDEX
      .map(item => {
        const symbolNorm = item.symbol.toLowerCase();
        const nameNorm = normalizeResearchSearch(item.name);
        const aliasNorms = item.aliases.map((alias) => normalizeResearchSearch(alias));
        let score = 0;
        if (symbolNorm === raw.toLowerCase()) score = 100;
        else if (symbolNorm.startsWith(raw.toLowerCase())) score = 92;
        else if (nameNorm.includes(q)) score = 82;
        else if (aliasNorms.some((alias) => alias === q || alias.replace(/\s+/g, '') === compact)) score = 96;
        else if (aliasNorms.some((alias) => alias.includes(q) || alias.replace(/\s+/g, '').includes(compact))) score = 78;
        return { ...item, score, stock: false };
      })
      .filter(item => item.score > 0);
    const bySymbol = new Map();
    for (const item of [...assetMatches, ...stockMatches].sort((a, b) => b.score - a.score)) {
      if (!bySymbol.has(item.symbol)) bySymbol.set(item.symbol, item);
    }
    return [...bySymbol.values()]
      .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))
      .slice(0, 8);
  }, [symbolInput]);

  // Live Yahoo lookup so ANY global ticker/crypto/commodity is reachable.
  useEffect(() => {
    const raw = symbolInput.trim();
    if (raw.length < 2) { setLiveResults([]); return; }
    let cancelled = false;
    const id = window.setTimeout(() => {
      searchSymbols(raw).then((rows) => {
        if (cancelled) return;
        setLiveResults(rows.map((r) => ({ symbol: r.symbol, name: r.name, type: r.type, stock: r.type === 'stock' })));
      });
    }, 220);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [symbolInput]);

  // Local matches first (instant), then live results not already present.
  const searchSuggestions = useMemo(() => {
    const seen = new Set(localSuggestions.map((i) => i.symbol));
    const merged = [...localSuggestions];
    for (const r of liveResults) {
      if (!seen.has(r.symbol)) { merged.push(r); seen.add(r.symbol); }
    }
    return merged.slice(0, 10);
  }, [localSuggestions, liveResults]);

  const resolveSearchSymbol = useCallback(() => {
    const raw = symbolInput.trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();
    const normalized = normalizeResearchSearch(raw).replace(/\s+/g, '');
    const asset = findResearchAsset(raw);
    if (asset) return asset;
    const exact = RESEARCH_SEARCH_INDEX.find(item => item.symbol === upper || normalizeResearchSearch(item.name).replace(/\s+/g, '') === normalized);
    if (exact) return { symbol: exact.symbol, name: exact.name, type: 'stock', stock: true };
    if (searchSuggestions.length) return searchSuggestions[0];
    if (/^[A-Z0-9][A-Z0-9.-]{0,11}$/.test(upper)) return { symbol: upper, name: upper, type: 'stock', stock: true };
    return null;
  }, [searchSuggestions, symbolInput]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const resolved = resolveSearchSymbol();
    if (!resolved) {
      setError(`No matching company or ticker for "${symbolInput.trim()}". Keeping ${symbol}.`);
      return;
    }
    setSuggestionsOpen(false);
    if (resolved.stock === false) openChartAsset(resolved);
    else loadSymbol(resolved.symbol || resolved);
  };

  const shortcutSymbols = assistantSymbols.length ? assistantSymbols : (recentSymbols.length ? recentSymbols : DEFAULT_RESEARCH_SHORTCUTS);
  const activeShortcutIndex = Math.max(0, shortcutSymbols.indexOf(symbol));
  const openShortcutOffset = (delta) => {
    if (!shortcutSymbols.length) return;
    const base = shortcutSymbols.includes(symbol) ? shortcutSymbols.indexOf(symbol) : activeShortcutIndex;
    const next = shortcutSymbols[(base + delta + shortcutSymbols.length) % shortcutSymbols.length];
    if (next) {
      setSymbolInput(next);
      const target = resolveResearchTargetFromText(next, [next]);
      if (target && target.stock === false && target.chartable === false) openChartAsset(target);
      else loadSymbol(target?.symbol || next);
    }
  };
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <form onSubmit={handleSubmit} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={symbolInput}
            onFocus={() => setSuggestionsOpen(true)}
            onChange={e => { setSymbolInput(e.target.value); setSuggestionsOpen(true); setError(null); }}
            onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
            placeholder="Search stocks, crypto, commodities, indexes, macro..."
            className="w-full bg-white rounded-xl pl-10 pr-4 py-2.5 text-zinc-900 text-sm shadow-sm ring-1 ring-zinc-200/70 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          {suggestionsOpen && symbolInput.trim() && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-zinc-200/80">
              {searchSuggestions.length ? searchSuggestions.map(item => (
                <button
                  key={item.symbol}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    setSuggestionsOpen(false);
                    if (item.stock === false && item.chartable === false) openChartAsset(item);
                    else loadSymbol(item.symbol);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-zinc-50"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-zinc-900">{item.symbol}</span>
                    <span className="block truncate text-[11px] text-zinc-500">{item.name}{item.type && item.type !== 'stock' ? ` · ${item.type}` : ''}</span>
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
                </button>
              )) : (
                <div className="px-3 py-2 text-xs text-zinc-500">No matching company or ticker. Current research stays unchanged.</div>
              )}
            </div>
          )}
        </form>
        <div className="flex items-center gap-1">
          {assistantSymbols.length > 1 && (
            <button type="button" onClick={() => openShortcutOffset(-1)} className="shrink-0 p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100" aria-label="Previous assistant ticker">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto no-scrollbar">
            {shortcutSymbols.map(s => (
              <button key={s} onClick={() => {
                setSymbolInput(s);
                const target = resolveResearchTargetFromText(s, [s]);
                if (target && target.stock === false && target.chartable === false) openChartAsset(target);
                else loadSymbol(target?.symbol || s);
              }}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium whitespace-nowrap transition-all ${
                  symbol === s ? 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200' : 'bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200/60 hover:text-zinc-900'
                }`}>{s}</button>
            ))}
          </div>
          {assistantSymbols.length > 1 && (
            <button type="button" onClick={() => openShortcutOffset(1)} className="shrink-0 p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100" aria-label="Next assistant ticker">
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {loading && <div className="flex items-center justify-center h-48 text-zinc-500 dark:text-zinc-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...</div>}
      {error && <div className="p-4 rounded-xl bg-red-50 text-red-800 text-sm ring-1 ring-red-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900">{error}</div>}

      {!loading && (
        <>
          {/* Backtest tool */}
          {view === 'backtest' || tab === 'backtest' ? (
            <ComparePanel strategies={strategies} onCompare={onCompare} results={compareResults} loading={compareLoading} />
          ) : tab === 'terminal' ? (
            <div className="overflow-hidden rounded-xl ring-1 ring-zinc-200/70 dark:ring-zinc-800">
              <TerminalPanel embedded symbol={symbol} />
            </div>
          ) : data ? (
            /* Adaptive, card-based research dashboard (all asset classes) */
            <ResearchDashboard symbol={symbol} data={data} intent={agentIntent} onNavigate={onNavigate} />
          ) : assetContext?.stock === false ? (
            /* Macro-only FRED-style series (not a tradable yfinance symbol) */
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
                <div>
                  <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{assetContext.name}</div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">{assetContext.type} · {assetContext.symbol}</div>
                </div>
                <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300">Macro research</span>
              </div>
              <AssetMacroTab asset={assetContext} macroData={macroData} macroLoading={macroLoading} macroError={macroError} />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function ResearchPanel(props) {
  return <ResearchFundamentals {...props} />;
}

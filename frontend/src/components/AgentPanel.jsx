import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Send,
  Loader2,
  Bot,
  User,
  TrendingUp,
  Zap,
  BarChart3,
  Search,
  FileText,
  SquarePen,
  PanelLeft,
  MessageSquare,
  X,
  Trash2,
  Activity,
  Brain,
  Newspaper,
  LayoutDashboard,
  SlidersHorizontal,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  YAxis,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
  ComposedChart,
} from 'recharts';
import { fetchTerminalChart, fetchResearch, fetchAgentHistory, putAgentHistory, agentRoute } from '../api';
import SnowflakeChart from './SnowflakeChart';
import MacroPanel from './MacroPanel';
import ResearchPanel from './ResearchPanel';
import { decryptWithDek, encryptWithDek } from '../e2ee';

const CHAT_STORAGE_KEY = 'eq_agent_chat_sessions_v1';
const AGENT_ASSISTANT_STRATEGIES = ['sma_crossover', 'ema_crossover', 'rsi', 'macd', 'bollinger_bands', 'mean_reversion', 'momentum'];
const WORKSPACE_TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'research', label: 'Research', icon: FileText },
  { id: 'screener', label: 'Screener', icon: SlidersHorizontal },
  { id: 'macro', label: 'Macro', icon: Activity },
  { id: 'news', label: 'News', icon: Newspaper },
];

/** Signed-in but no in-memory DEK (e.g. page refresh): keep chat usable via local plaintext until next password unlock. */
function chatPlainStorageKey(userId) {
  return `eq_agent_chat_sessions_plain_v1:${userId}`;
}

// ─── Known tickers for detection ───
const KNOWN_TICKERS = new Set(['AAPL','MSFT','GOOGL','GOOG','AMZN','NVDA','TSLA','META','JPM','V','WMT','UNH','JNJ','XOM','PG','MA','HD','CVX','MRK','ABBV','LLY','PEP','KO','COST','AVGO','MCD','CSCO','TMO','ABT','ACN','AMD','INTC','QCOM','CRM','ADBE','NFLX','DIS','BA','GE','CAT','GS','BLK','PYPL','SQ','COIN','SHOP','SNAP','UBER','ABNB','RIVN','PLTR','SOFI','NET','CRWD','DDOG','ZS','ORCL','IBM','NOW','PANW','MU','TXN','ARM','SMCI','DELL','HPE','TSM','ASML','NVO','PFE','T','TMUS','NFLX','NKE','SBUX','TGT','LOW','BAC','C','WFC','MS','SCHW','BX','WBA','SPY','QQQ','IWM','DIA','TLT','GLD','SLV','USO','BTC','ETH','SOL']);
const COMPANY_TICKER_ALIASES = [
  ['apple', 'AAPL'], ['microsoft', 'MSFT'], ['alphabet', 'GOOGL'], ['google', 'GOOGL'], ['amazon', 'AMZN'],
  ['nvidia', 'NVDA'], ['tesla', 'TSLA'], ['meta', 'META'], ['facebook', 'META'], ['jpmorgan', 'JPM'],
  ['jp morgan', 'JPM'], ['visa', 'V'], ['walmart', 'WMT'], ['costco', 'COST'], ['broadcom', 'AVGO'],
  ['netflix', 'NFLX'], ['disney', 'DIS'], ['boeing', 'BA'], ['amd', 'AMD'], ['intel', 'INTC'],
  ['qualcomm', 'QCOM'], ['salesforce', 'CRM'], ['adobe', 'ADBE'], ['palantir', 'PLTR'], ['coinbase', 'COIN'],
  ['shopify', 'SHOP'], ['uber', 'UBER'], ['airbnb', 'ABNB'], ['rivian', 'RIVN'], ['sofi', 'SOFI'],
  ['crowdstrike', 'CRWD'], ['datadog', 'DDOG'], ['oracle', 'ORCL'], ['micron', 'MU'], ['texas instruments', 'TXN'],
  ['arm holdings', 'ARM'], ['super micro', 'SMCI'], ['dell', 'DELL'], ['taiwan semiconductor', 'TSM'],
  ['novo nordisk', 'NVO'], ['pfizer', 'PFE'], ['bank of america', 'BAC'], ['wells fargo', 'WFC'],
  ['walgreens', 'WBA'], ['walgreens boots alliance', 'WBA'],
];

function fmtCompact(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function fmtPctValue(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function toneClass(value) {
  const n = Number(value || 0);
  if (n > 0) return 'text-[var(--eq-gain)]';
  if (n < 0) return 'text-[var(--eq-loss)]';
  return 'text-[var(--eq-text3)]';
}

function numValue(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function medianValue(values) {
  const nums = values.map((v) => numValue(v)).filter((v) => v != null).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function avgValue(values) {
  const nums = values.map((v) => numValue(v)).filter((v) => v != null);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function screenerOpportunityScore(row) {
  const signalScore = (numValue(row?.buy_count, 0) / Math.max(1, numValue(row?.total_strategies, 7))) * 42;
  const momentumScore = Math.max(-12, Math.min(22, numValue(row?.change_20d, 0))) * 0.9;
  const rsi = numValue(row?.rsi, 50);
  const rsiScore = rsi >= 35 && rsi <= 68 ? 14 : rsi < 35 ? 8 : -8;
  const pe = numValue(row?.pe_ratio);
  const valuationScore = pe == null ? 0 : pe <= 18 ? 14 : pe <= 30 ? 7 : pe <= 55 ? -2 : -8;
  const riskPenalty = Math.min(18, Math.max(0, numValue(row?.volatility, 0) - 35) * 0.22);
  return Math.round((signalScore + momentumScore + rsiScore + valuationScore - riskPenalty) * 10) / 10;
}

function formatPlainNumber(value, digits = 1) {
  const n = numValue(value);
  if (n == null) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function extractSessionTickers(messages) {
  const found = new Set();
  for (const msg of messages || []) {
    extractTickers(msg?.content || '').forEach((ticker) => found.add(ticker));
    if (Array.isArray(msg?.tickers)) msg.tickers.forEach((ticker) => found.add(String(ticker).trim().toUpperCase()));
    if (msg?.ticker) found.add(String(msg.ticker).trim().toUpperCase());
  }
  return [...found].filter(Boolean).slice(-10).reverse();
}

function useDesktopAssistantAvailable() {
  const [available, setAvailable] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  });
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setAvailable(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);
  return available;
}

async function silentApiJson(path, options = {}) {
  const token = localStorage.getItem('eq_token');
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) return null;
  return res.json();
}

function assistantFetchMacroOverview() {
  return silentApiJson('/api/macro', { cache: 'no-store' });
}

function assistantFetchResearch(symbol) {
  return silentApiJson(`/api/research/${encodeURIComponent(symbol)}`);
}

function assistantFetchNews(symbols) {
  return silentApiJson(`/api/news?symbols=${encodeURIComponent(symbols || '')}`);
}

function assistantRunScreener(body) {
  return silentApiJson('/api/screener', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function extractTickers(text) {
  if (!text) return [];
  const found = new Set();
  // Match $TICKER or standalone uppercase 2-5 letter words
  const matches = text.match(/\$([A-Z]{2,5})\b|(?<![a-z])([A-Z]{2,5})(?![a-z])/g) || [];
  for (const m of matches) {
    const clean = m.replace('$', '');
    if (KNOWN_TICKERS.has(clean) && !['AI','US','CEO','ETF','IPO','GDP','PE','EPS','YTD','QOQ','YOY','ROE','ROA','RSI','SMA','EMA','BB','MACD','DCF','FCF'].includes(clean)) {
      found.add(clean);
    }
  }
  const lower = text.toLowerCase();
  for (const [name, ticker] of COMPANY_TICKER_ALIASES) {
    if (lower.includes(name)) found.add(ticker);
  }
  return [...found].slice(0, 12);
}

function latestMessageByRole(messages, role) {
  return [...(messages || [])].reverse().find((m) => m?.role === role && String(m?.content || '').trim())?.content || '';
}

function sectorListFromText(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(tech|technology|software|semiconductor|chip|ai)\b/.test(t)) return { id: 'sector_technology', label: 'Technology' };
  if (/\b(health|healthcare|biotech|pharma|medical)\b/.test(t)) return { id: 'sector_healthcare', label: 'Healthcare' };
  if (/\b(financial|bank|banks|insurance|broker)\b/.test(t)) return { id: 'sector_financials', label: 'Financials' };
  if (/\b(energy|oil|gas|crude)\b/.test(t)) return { id: 'sector_energy', label: 'Energy' };
  if (/\b(industrial|industrials|defense|aerospace|machinery)\b/.test(t)) return { id: 'sector_industrials', label: 'Industrials' };
  if (/\b(utility|utilities|power|electric)\b/.test(t)) return { id: 'sector_utilities', label: 'Utilities' };
  if (/\b(real estate|reit|reits|property)\b/.test(t)) return { id: 'sector_real_estate', label: 'Real Estate' };
  if (/\b(material|materials|mining|copper|gold miner|steel)\b/.test(t)) return { id: 'sector_materials', label: 'Materials' };
  if (/\b(staples|consumer defensive|food|beverage)\b/.test(t)) return { id: 'sector_consumer_staples', label: 'Consumer Staples' };
  if (/\b(discretionary|retail|consumer|restaurant|auto)\b/.test(t)) return { id: 'sector_consumer_disc', label: 'Consumer Discretionary' };
  if (/\b(communication|media|telecom|streaming)\b/.test(t)) return { id: 'sector_comm_services', label: 'Communication Services' };
  return null;
}

function buildScreenerIntent(text) {
  const t = String(text || '').toLowerCase();
  const sector = sectorListFromText(t);
  const filters = {};
  const chips = [];
  let listId = sector?.id || 'sp500';
  let listLabel = sector?.label || 'S&P 500';
  let sortKey = 'buy_count';
  let sortAsc = false;

  if (/\b(small cap|smallcap|low cap|low-cap)\b/.test(t)) {
    listId = 'smallcap';
    listLabel = 'Small Caps';
    filters.market_cap_max = 2;
    chips.push('Small cap');
  } else if (/\b(mid cap|midcap)\b/.test(t)) {
    listId = 'midcap';
    listLabel = 'Mid Caps';
    chips.push('Mid cap');
  } else if (/\b(canada|canadian|tsx)\b/.test(t)) {
    listId = 'tsx60';
    listLabel = 'TSX 60';
    chips.push('Canada');
  } else if (/\b(all market|wide list|full market|all stocks)\b/.test(t)) {
    listId = 'all';
    listLabel = 'All US Stocks';
    chips.push('Wide market');
  }

  if (sector) chips.push(sector.label);

  if (/\b(oversold|washed out|pullback|dip)\b/.test(t)) {
    filters.rsi_max = 35;
    filters.pct_from_52w_high_max = -5;
    sortKey = 'rsi';
    sortAsc = true;
    chips.push('Oversold');
  }
  if (/\b(overbought|extended|too hot)\b/.test(t)) {
    filters.rsi_min = 70;
    sortKey = 'rsi';
    sortAsc = false;
    chips.push('Overbought');
  }
  if (/\b(momentum|breakout|strong trend|trending|relative strength|swing)\b/.test(t)) {
    filters.above_sma20 = 'yes';
    filters.above_sma50 = 'yes';
    filters.change_20d_min = 3;
    filters.min_buy_signals = Math.max(filters.min_buy_signals || 0, 3);
    sortKey = 'change_20d';
    chips.push('Momentum');
  }
  if (/\b(bullish|buy signal|best buys|top buys)\b/.test(t)) {
    filters.min_buy_signals = Math.max(filters.min_buy_signals || 0, 3);
    filters.above_sma50 = 'yes';
    sortKey = 'buy_count';
    chips.push('Bullish signals');
  }
  if (/\b(value|cheap|undervalued|low pe|low p\/e)\b/.test(t)) {
    filters.pe_max = Math.min(filters.pe_max || 999, 22);
    sortKey = 'pe_ratio';
    sortAsc = true;
    chips.push('Value');
  }
  if (/\b(dividend|income|yield)\b/.test(t)) {
    filters.dividend_yield_min = Math.max(filters.dividend_yield_min || 0, 2.5);
    sortKey = 'dividend_yield';
    sortAsc = false;
    chips.push('Income');
  }
  if (/\b(short squeeze|high short|short interest)\b/.test(t)) {
    filters.short_pct_min = Math.max(filters.short_pct_min || 0, 10);
    sortKey = 'short_pct_float';
    sortAsc = false;
    chips.push('High short interest');
  }
  if (/\b(low risk|defensive|stable|low beta)\b/.test(t)) {
    filters.beta_max = Math.min(filters.beta_max || 10, 1.1);
    filters.volatility_max = Math.min(filters.volatility_max || 200, 45);
    chips.push('Lower risk');
  }
  if (/\b(profitable|margin|quality)\b/.test(t)) {
    filters.profit_margin_min = Math.max(filters.profit_margin_min || -100, 10);
    chips.push('Quality');
  }

  return { listId, listLabel, filters, sortKey, sortAsc, chips: [...new Set(chips)] };
}

function classifyWorkspaceIntent({ latestUser, latestAssistant, tickers, focusTicker }) {
  const user = String(latestUser || '').trim();
  const combined = `${user}\n${latestAssistant || ''}`;
  const t = user.toLowerCase();
  const latestTickers = extractTickers(user);
  const primaryTicker = latestTickers[0] || tickers?.[0] || focusTicker || '';
  const hasFreshTicker = latestTickers.length > 0;
  const isScreener = /\b(screen|screener|scan|find stocks|which stocks|show stocks|shortlist|oversold|overbought|breakout|small cap|mid cap|high dividend|short squeeze|low pe|undervalued)\b/.test(t);
  const isMacro = /\b(macro|fed|rate|rates|inflation|cpi|jobs|unemployment|payroll|yield|deficit|debt|oil|gold|usd|dollar|crypto|bitcoin|china|canada|real estate|housing|recession)\b/.test(t);
  const isNews = /\b(news|headline|headlines|catalyst|catalysts|latest|today|why.*move|what happened|earnings today)\b/.test(t);
  const isChart = /\b(chart|price history|technical|trend|support|resistance|backtest)\b/.test(t);
  const isResearch = hasFreshTicker || /\b(analyze|research|compare|valuation|fundamental|financials|earnings|revenue|margin|risk|buy now|price target)\b/.test(t);

  let tab = 'overview';
  let label = 'Overview';
  let reason = 'Overview of the latest agent context.';
  let researchSubtab = 'fundamentals';
  if (isScreener) {
    tab = 'screener';
    label = 'Screen stocks';
    reason = 'The request is asking for a filtered stock list.';
  } else if (isMacro && !hasFreshTicker) {
    tab = 'macro';
    label = 'Macro read';
    reason = 'The request is focused on macro assets, rates, jobs, commodities, or global risk.';
  } else if (isNews) {
    tab = 'news';
    label = 'News check';
    reason = 'The request is asking for catalysts and current headlines.';
  } else if (isResearch) {
    tab = 'research';
    label = isChart ? 'Chart and research' : 'Ticker research';
    reason = hasFreshTicker ? `The request mentions ${primaryTicker}.` : 'The request asks for company-level research.';
    researchSubtab = isChart ? 'chart' : 'fundamentals';
  } else if (isMacro) {
    tab = 'macro';
    label = 'Macro read';
    reason = 'The request includes macro language.';
  } else if (isNews) {
    tab = 'news';
    label = 'News check';
    reason = 'The request includes news language.';
  }

  return {
    tab,
    label,
    reason,
    request: user,
    primaryTicker,
    tickers: tickers || [],
    researchSubtab,
    screener: buildScreenerIntent(combined),
  };
}

function rowPassesWorkspaceFilters(row, filters = {}) {
  if (!row) return false;
  const checks = [
    ['rsi_min', 'rsi', (a, b) => a >= b],
    ['rsi_max', 'rsi', (a, b) => a <= b],
    ['change_20d_min', 'change_20d', (a, b) => a >= b],
    ['pct_from_52w_high_max', 'pct_from_52w_high', (a, b) => a <= b],
    ['market_cap_max', 'market_cap', (a, b) => (a / 1e9) <= b],
    ['pe_max', 'pe_ratio', (a, b) => a <= b],
    ['dividend_yield_min', 'dividend_yield', (a, b) => a >= b],
    ['short_pct_min', 'short_pct_float', (a, b) => a >= b],
    ['beta_max', 'beta', (a, b) => a <= b],
    ['volatility_max', 'volatility', (a, b) => a <= b],
    ['profit_margin_min', 'profit_margin', (a, b) => a >= b],
    ['min_buy_signals', 'buy_count', (a, b) => a >= b],
  ];
  for (const [filterKey, rowKey, pass] of checks) {
    if (filters[filterKey] == null || row[rowKey] == null) continue;
    if (!pass(Number(row[rowKey]), Number(filters[filterKey]))) return false;
  }
  if (filters.above_sma20 === 'yes' && !row.above_sma20) return false;
  if (filters.above_sma50 === 'yes' && !row.above_sma50) return false;
  if (filters.above_sma200 === 'yes' && !row.above_sma200) return false;
  return true;
}

function applyWorkspaceScreenIntent(rows, screener) {
  const filters = screener?.filters || {};
  const sortKey = screener?.sortKey || 'buy_count';
  const sortAsc = Boolean(screener?.sortAsc);
  return [...(rows || [])]
    .filter((row) => rowPassesWorkspaceFilters(row, filters))
    .sort((a, b) => {
      const av = a?.[sortKey] ?? -Infinity;
      const bv = b?.[sortKey] ?? -Infinity;
      return sortAsc ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
}

// ─── Markdown renderer ───
function inlineFormat(text) {
  if (!text) return '';
  return text
    .replace(/`([^`]+)`/g, '<code class="bg-[var(--eq-card2)] px-1 rounded text-[var(--eq-accent)] text-[12px]">$1</code>')
    .replace(/\*{3}([^*]+)\*{3}/g, '<strong class="text-[var(--eq-text)] font-semibold"><em>$1</em></strong>')
    .replace(/\*{2}([^*]+)\*{2}/g, '<strong class="text-[var(--eq-text)] font-semibold">$1</strong>')
    .replace(/__([^_]+)__/g, '<strong class="text-[var(--eq-text)] font-semibold">$1</strong>')
    .replace(/(?<![<\w])\*([^*]+)\*(?![>\w])/g, '<em class="text-[var(--eq-text2)]">$1</em>')
    .replace(/(?<![<\w])_([^_]+)_(?![>\w])/g, '<em class="text-[var(--eq-text2)]">$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="break-all text-[var(--eq-accent)] hover:underline">$1</a>');
}

function parseTable(lines, startIdx) {
  // Collect consecutive table rows starting from startIdx
  const rows = [];
  let i = startIdx;
  while (i < lines.length && lines[i].trimStart().startsWith('|')) {
    rows.push(lines[i].trimStart());
    i++;
  }
  if (rows.length < 2) return null; // need at least header + separator

  const parseRow = (row) => row.split('|').slice(1, -1).map(c => c.trim());

  const headers = parseRow(rows[0]);
  // Skip separator row (|---|---|)
  const dataStart = rows[1].includes('---') ? 2 : 1;
  const body = rows.slice(dataStart).map(parseRow);

  return { headers, body, endIdx: i };
}

function RenderMarkdown({ text }) {
  if (!text) return null;
  let clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const lines = clean.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Table detection
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const table = parseTable(lines, i);
      if (table && table.headers.length > 0) {
        elements.push(
          <div key={i} className="my-3 overflow-x-auto rounded-xl bg-[var(--eq-card2)] ring-1 ring-[var(--eq-border)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--eq-border)] bg-[var(--eq-card)]">
                  {table.headers.map((h, j) => (
                    <th key={j} className="text-left py-2 px-3 text-[var(--eq-text3)] font-semibold whitespace-nowrap"
                      dangerouslySetInnerHTML={{ __html: inlineFormat(h) }} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.body.map((row, ri) => (
                  <tr key={ri} className="border-b border-[var(--eq-grid)] hover:bg-[var(--eq-card)]">
                    {row.map((cell, ci) => {
                      const numMatch = cell.match(/^([+-]?\d+\.?\d*)\s*%?$/);
                      const isPositive = numMatch && parseFloat(numMatch[1]) > 0;
                      const isNegative = numMatch && parseFloat(numMatch[1]) < 0;
                      const color = isPositive ? 'text-[var(--eq-gain)]' : isNegative ? 'text-[var(--eq-loss)]' : 'text-[var(--eq-text2)]';
                      return (
                        <td key={ci} className={`py-1.5 px-3 whitespace-nowrap ${ci === 0 ? 'text-[var(--eq-text)] font-medium' : color}`}
                          dangerouslySetInnerHTML={{ __html: inlineFormat(cell) }} />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        i = table.endIdx;
        continue;
      }
    }

    // Headings
    if (trimmed.startsWith('#### ')) { elements.push(<h4 key={i} className="text-sm font-bold text-[var(--eq-text)] mt-2 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(5)) }} />); i++; continue; }
    if (trimmed.startsWith('### ')) { elements.push(<h3 key={i} className="text-base font-bold text-[var(--eq-text)] mt-3 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(4)) }} />); i++; continue; }
    if (trimmed.startsWith('## ')) { elements.push(<h2 key={i} className="text-lg font-bold text-[var(--eq-text)] mt-3 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(3)) }} />); i++; continue; }
    if (trimmed.startsWith('# ')) { elements.push(<h1 key={i} className="text-xl font-bold text-[var(--eq-text)] mt-3 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(2)) }} />); i++; continue; }
    if (/^([-]{3,}|[*]{3,}|[_]{3,})\s*$/.test(trimmed) && !/[a-zA-Z]/.test(trimmed)) { elements.push(<hr key={i} className="border-[var(--eq-border)] my-2" />); i++; continue; }
    // Unordered list
    if (/^[-*+]\s/.test(trimmed)) {
      elements.push(
          <div key={i} className="ml-2 my-1 flex min-w-0 gap-2 text-sm leading-relaxed text-[var(--eq-text2)]">
          <span className="text-[var(--eq-accent)] mt-0.5 shrink-0">•</span>
          <span className="min-w-0 break-words" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.replace(/^[-*+]\s/, '')) }} />
        </div>
      );
      i++; continue;
    }
    // Numbered list
    if (/^\d+\.\s/.test(trimmed)) {
      const num = trimmed.match(/^(\d+)\./)[1];
      elements.push(
        <div key={i} className="ml-2 my-1 flex min-w-0 gap-2 text-sm leading-relaxed text-[var(--eq-text2)]">
          <span className="text-[var(--eq-accent)] mt-0.5 shrink-0 w-4 text-right">{num}.</span>
          <span className="min-w-0 break-words" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.replace(/^\d+\.\s/, '')) }} />
        </div>
      );
      i++; continue;
    }
    // Blockquote
    if (trimmed.startsWith('> ')) {
      elements.push(<div key={i} className="border-l-2 border-[var(--eq-accent-ring)] pl-3 my-1 text-sm text-[var(--eq-text3)] italic leading-relaxed" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(2)) }} />);
      i++; continue;
    }
    // Empty line
    if (trimmed === '') { elements.push(<div key={i} className="h-2" />); i++; continue; }
    // Regular paragraph
    elements.push(<p key={i} className="my-1.5 min-w-0 break-words text-sm leading-relaxed text-[var(--eq-text2)]" dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />);
    i++;
  }

  return <div className="min-w-0 break-words" style={{ overflowWrap: 'anywhere' }}>{elements}</div>;
}

// ─── Ticker insight card with charts ───
function TickerInsightCard({ ticker, onNavigate }) {
  const [chart, setChart] = useState(null);
  const [research, setResearch] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    fetchTerminalChart(ticker, '6mo', '1d').then(d => setChart(d.data)).catch(() => {});
    fetchResearch(ticker).then(d => setResearch(d)).catch(() => {});
  }, [ticker]);

  if (!chart || chart.length < 5) return null;

  const first = chart[0].close, last = chart[chart.length - 1].close;
  const up = last >= first;
  const changePct = ((last / first - 1) * 100).toFixed(2);

  const s = research?.summary || {};
  const sf = research?.snowflake;
  const perf = research?.risk_metrics?.performance || {};

  // Monthly returns for mini bar chart
  const monthlyData = [];
  if (chart.length > 21) {
    for (let i = Math.max(0, chart.length - 126); i < chart.length; i += 21) {
      const end = Math.min(i + 21, chart.length - 1);
      const ret = ((chart[end].close / chart[i].close - 1) * 100);
      monthlyData.push({ m: chart[i].time?.slice(5, 7) || '', ret: parseFloat(ret.toFixed(1)) });
    }
  }

  return (
    <div className="bg-[var(--eq-card2)] rounded-xl p-3 mt-3 ring-1 ring-[var(--eq-border)] shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-sm font-bold text-[var(--eq-text)]">{ticker}</span>
          {s.name && <span className="text-[10px] text-[var(--eq-text3)] ml-2">{s.name}</span>}
        </div>
        <div className="text-right">
          <span className="text-sm font-bold text-[var(--eq-text)]">${last.toFixed(2)}</span>
          <span className={`text-[10px] ml-1 ${up ? 'text-[var(--eq-gain)]' : 'text-[var(--eq-loss)]'}`}>{up ? '+' : ''}{changePct}%</span>
        </div>
      </div>

      {s.pe_trailing && (
        <div className="flex gap-3 mb-2 text-[10px] flex-wrap">
          {s.market_cap_fmt && <span className="text-[var(--eq-text3)]">MCap <span className="text-[var(--eq-text)]">{s.market_cap_fmt}</span></span>}
          {s.pe_trailing && <span className="text-[var(--eq-text3)]">P/E <span className="text-[var(--eq-text)]">{s.pe_trailing.toFixed(1)}</span></span>}
          {s.dividend_yield_pct && <span className="text-[var(--eq-text3)]">Div <span className="text-[var(--eq-text)]">{s.dividend_yield_pct}%</span></span>}
          {s.eps_trailing && <span className="text-[var(--eq-text3)]">EPS <span className="text-[var(--eq-text)]">${s.eps_trailing.toFixed(2)}</span></span>}
        </div>
      )}

      {/* Charts row */}
      <div className="flex gap-3">
        {/* Price chart */}
        <div className="flex-1 min-w-0">
          <div className="text-[9px] text-[var(--eq-text3)] mb-1">6M Price</div>
          <ResponsiveContainer width="100%" height={60}>
            <AreaChart data={chart.slice(-126)}>
              <defs><linearGradient id={`ag_${ticker}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={up ? '#22c55e' : '#ef4444'} stopOpacity={0.15} />
                <stop offset="100%" stopColor={up ? '#22c55e' : '#ef4444'} stopOpacity={0} />
              </linearGradient></defs>
              <YAxis domain={['auto', 'auto']} hide />
              <Area type="monotone" dataKey="close" stroke={up ? '#22c55e' : '#ef4444'} fill={`url(#ag_${ticker})`} strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly returns bar */}
        {monthlyData.length > 2 && (
          <div style={{ width: 100 }}>
            <div className="text-[9px] text-[var(--eq-text3)] mb-1">Monthly</div>
            <ResponsiveContainer width="100%" height={60}>
              <BarChart data={monthlyData}>
                <Bar dataKey="ret" radius={[2, 2, 0, 0]}>
                  {monthlyData.map((d, i) => <Cell key={i} fill={d.ret >= 0 ? '#22c55e40' : '#ef444440'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Mini snowflake */}
        {sf && (
          <div style={{ width: 65 }}>
            <div className="text-[9px] text-[var(--eq-text3)] mb-1 text-center">Quality</div>
            <SnowflakeChart data={sf} size={55} mini />
          </div>
        )}
      </div>

      {/* Performance badges */}
      {Object.keys(perf).length > 0 && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {Object.entries(perf).map(([k, v]) => (
            <span key={k} className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${v >= 0 ? 'bg-[var(--eq-gain-soft)] text-[var(--eq-gain)]' : 'bg-[var(--eq-loss-soft)] text-[var(--eq-loss)]'}`}>
              {k}: {v > 0 ? '+' : ''}{v}%
            </span>
          ))}
        </div>
      )}

      {/* Navigation links */}
      <div className="flex gap-2 mt-2 pt-2 border-t border-[var(--eq-border)]">
        <button onClick={() => onNavigate('research', ticker)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-[var(--eq-accent)] hover:bg-[var(--eq-accent-soft)] transition-colors">
          <FileText className="w-3 h-3" /> Full Research
        </button>
        <button onClick={() => onNavigate('terminal', ticker)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-[var(--eq-accent)] hover:bg-[var(--eq-accent-soft)] transition-colors">
          <BarChart3 className="w-3 h-3" /> Chart
        </button>
        <button onClick={() => onNavigate('screener', ticker)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-[var(--eq-accent)] hover:bg-[var(--eq-accent-soft)] transition-colors">
          <Search className="w-3 h-3" /> Screener
        </button>
      </div>
    </div>
  );
}

// ─── Chat message ───
function Message({ msg, onNavigate, tickerDisplay = 'cards' }) {
  const isUser = msg.role === 'user';
  const tickers = !isUser
    ? [...new Set([
        ...extractTickers(msg.content),
        ...(Array.isArray(msg.tickers) ? msg.tickers.map(t => String(t).trim().toUpperCase()) : []),
        ...(msg.ticker ? [String(msg.ticker).trim().toUpperCase()] : []),
      ])].filter(Boolean).slice(0, 12)
    : [];

  const tickerLinks = tickers.length > 0 && tickerDisplay === 'links' && (
    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--eq-border)] pt-2">
      {tickers.map((ticker) => (
        <span key={ticker} className="inline-flex overflow-hidden rounded-full ring-1 ring-[var(--eq-accent-ring)]">
          <button
            type="button"
            onClick={() => onNavigate?.('research', ticker)}
            className="bg-[var(--eq-accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--eq-accent)] hover:bg-[var(--eq-accent-soft)]"
          >
            {ticker} research
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.('terminal', ticker)}
            className="border-l border-[var(--eq-accent-ring)] bg-[var(--eq-card)] px-2 py-1 text-[10px] font-semibold text-[var(--eq-text3)] hover:text-[var(--eq-accent)]"
          >
            chart
          </button>
        </span>
      ))}
    </div>
  );

  return (
    <div className={`flex min-w-0 gap-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-[var(--eq-accent-soft)] flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-[var(--eq-accent)]" />
        </div>
      )}
      <div
        className={`min-w-0 max-w-[92%] overflow-hidden rounded-2xl px-4 py-3 sm:max-w-[88%] ${isUser ? 'bg-[var(--eq-accent)] text-[var(--eq-bg)]' : 'bg-[var(--eq-card)] shadow-sm ring-1 ring-[var(--eq-border)]'}`}
        style={{ overflowWrap: 'anywhere' }}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{msg.content}</p>
        ) : (
          <>
            <RenderMarkdown text={msg.content} />
            {tickerDisplay === 'cards'
              ? tickers.map(t => <TickerInsightCard key={t} ticker={t} onNavigate={onNavigate} />)
              : tickerLinks}
          </>
        )}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-lg bg-[var(--eq-border)] flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-4 h-4 text-[var(--eq-text2)]" />
        </div>
      )}
    </div>
  );
}

function AssistantLayoutSwitch({ layoutMode, setLayoutMode, assistantAvailable }) {
  if (!setLayoutMode) return null;
  const active = assistantAvailable && layoutMode !== 'chat' ? 'assistant' : 'chat';
  return (
    <div className="flex items-center gap-0.5 rounded-xl bg-[var(--eq-card2)] p-1">
      <button
        type="button"
        onClick={() => assistantAvailable && setLayoutMode('assistant')}
        disabled={!assistantAvailable}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
          active === 'assistant'
            ? 'bg-[var(--eq-card)] text-[var(--eq-text)] shadow-sm ring-1 ring-[var(--eq-border)]'
            : 'text-[var(--eq-text3)] hover:text-[var(--eq-text)] disabled:opacity-40'
        }`}
      >
        <LayoutDashboard className="h-3.5 w-3.5" /> Assistant
      </button>
      <button
        type="button"
        onClick={() => setLayoutMode('chat')}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
          active === 'chat'
            ? 'bg-[var(--eq-card)] text-[var(--eq-text)] shadow-sm ring-1 ring-[var(--eq-border)]'
            : 'text-[var(--eq-text3)] hover:text-[var(--eq-text)]'
        }`}
      >
        <MessageSquare className="h-3.5 w-3.5" /> Chat
      </button>
    </div>
  );
}

function AssistantChatColumn({
  activeSession,
  messages,
  loading,
  streamingText,
  input,
  setInput,
  handleSend,
  mode,
  layoutMode,
  setLayoutMode,
  assistantAvailable,
  onNavigate,
  scrollRef,
  suggestions,
  historyList,
  createNewChat,
}) {
  const hasThread = messages.length > 0 || loading;
  const [historyExpanded, setHistoryExpanded] = useState(false);
  return (
    <section className="flex h-full min-h-0 w-[410px] min-w-[370px] max-w-[480px] shrink-0 flex-col overflow-hidden border-r border-[var(--eq-border)] bg-[var(--eq-card)]">
      <div className="shrink-0 border-b border-[var(--eq-border)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <AssistantLayoutSwitch
            layoutMode={layoutMode}
            setLayoutMode={setLayoutMode}
            assistantAvailable={assistantAvailable}
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={createNewChat}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--eq-card2)] text-[var(--eq-text3)] hover:bg-[var(--eq-border)] hover:text-[var(--eq-text)]"
              title="New chat"
              aria-label="New chat"
            >
              <SquarePen className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setHistoryExpanded((v) => !v)}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--eq-card2)] px-2 text-[11px] font-semibold text-[var(--eq-text3)] hover:bg-[var(--eq-border)] hover:text-[var(--eq-text)]"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${historyExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      </div>
      <div className="shrink-0 border-b border-[var(--eq-border)] bg-[var(--eq-card2)] px-4 py-3">
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask the agent..."
            disabled={loading}
            className="min-w-0 flex-1 rounded-xl bg-[var(--eq-card)] px-3.5 py-2.5 text-sm text-[var(--eq-text)] shadow-sm ring-1 ring-[var(--eq-border)] placeholder:text-[var(--eq-text3)] focus:outline-none focus:ring-2 focus:ring-[var(--eq-border2)] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="shrink-0 px-2.5 text-[var(--eq-text3)] transition hover:text-[var(--eq-text)] disabled:opacity-30"
            title="Send"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
      {historyExpanded && (
        <div className="flex max-h-52 shrink-0 overflow-hidden border-b border-[var(--eq-border)] bg-[var(--eq-card2)]">
          {historyList}
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-10 bg-gradient-to-b from-[var(--eq-card)] to-transparent" />
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-14 bg-gradient-to-t from-[var(--eq-card)] to-transparent" />
        <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-4">
          {!hasThread && (
            <div className="flex min-h-full flex-col justify-center">
              <h2 className="text-xl font-semibold tracking-tight text-[var(--eq-text)]">Ask, then work the data.</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--eq-text3)]">Mention a ticker or market theme and the workspace updates beside the chat.</p>
              <div className="mt-5 grid gap-2">
                {suggestions.slice(0, 3).map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setInput(s)}
                    className="rounded-xl bg-[var(--eq-card)] px-3 py-2.5 text-left text-xs text-[var(--eq-text2)] ring-1 ring-[var(--eq-border)] hover:bg-[var(--eq-card2)] hover:text-[var(--eq-text)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasThread && (
            <div className="space-y-4 pb-4">
              {messages.map((msg, i) => (
                <Message key={i} msg={msg} onNavigate={onNavigate} tickerDisplay="links" />
              ))}
              {loading && streamingText && (
                <div className="flex gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--eq-border)]">
                    <Bot className="h-4 w-4 text-[var(--eq-text2)]" />
                  </div>
                  <div className="min-w-0 max-w-[92%] overflow-hidden rounded-2xl bg-[var(--eq-card)] px-4 py-3 shadow-sm ring-1 ring-[var(--eq-border)]" style={{ overflowWrap: 'anywhere' }}>
                    <RenderMarkdown text={streamingText} />
                    <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-[var(--eq-text3)]" />
                  </div>
                </div>
              )}
              {loading && !streamingText && (
                <div className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--eq-border)]">
                    <Bot className="h-4 w-4 text-[var(--eq-text2)]" />
                  </div>
                  <div className="rounded-2xl bg-[var(--eq-card)] px-4 py-3 shadow-sm ring-1 ring-[var(--eq-border)]">
                    <div className="flex items-center gap-2 text-xs text-[var(--eq-text3)]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {mode === 'full' ? 'Running multi-agent analysis...' : 'Thinking...'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function mergeMacroSeries(chart) {
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

function ResearchSnapshot({ ticker, research, chart, loading, onNavigate }) {
  if (!ticker) {
    return (
      <div className="rounded-xl bg-[var(--eq-card)] p-4 shadow-sm ring-1 ring-[var(--eq-border)]">
        <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl bg-[var(--eq-card2)] px-6 text-center ring-1 ring-[var(--eq-border)]">
          <FileText className="mb-3 h-6 w-6 text-[var(--eq-text3)]" />
          <h3 className="text-sm font-semibold text-[var(--eq-text)]">Research context</h3>
          <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--eq-text3)]">
            Mention a ticker in the chat, or choose one from the screener shortlist, and the workspace will load the matching research view.
          </p>
        </div>
      </div>
    );
  }

  const summary = research?.summary || {};
  const first = chart?.[0]?.close;
  const last = chart?.[chart.length - 1]?.close;
  const change = first && last ? (last / first - 1) * 100 : null;
  const up = Number(change || 0) >= 0;
  const chartDateKey = chart?.[0]?.time ? 'time' : 'date';

  return (
    <div className="rounded-xl bg-[var(--eq-card)] p-4 shadow-sm ring-1 ring-[var(--eq-border)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--eq-text3)]">Research context</div>
          <h3 className="mt-0.5 text-xl font-semibold text-[var(--eq-text)]">{ticker}</h3>
          <p className="mt-0.5 max-w-md truncate text-xs text-[var(--eq-text3)]">{summary.name || 'Research snapshot'}</p>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold text-[var(--eq-text)]">{summary.price != null ? `$${summary.price}` : (last ? `$${last.toFixed(2)}` : '—')}</div>
          <div className={`text-xs font-semibold ${toneClass(summary.change_pct ?? change)}`}>{summary.change_pct != null ? fmtPctValue(summary.change_pct) : fmtPctValue(change)}</div>
        </div>
      </div>

      <div className="mt-4 h-56">
        {chart?.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart.slice(-260)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`assistant_focus_${ticker}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={up ? '#10b981' : '#f43f5e'} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={up ? '#10b981' : '#f43f5e'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-[var(--eq-grid)]" />
              <XAxis dataKey={chartDateKey} minTickGap={28} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-[var(--eq-text3)]" />
              <YAxis domain={['auto', 'auto']} width={48} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-[var(--eq-text3)]" />
              <Tooltip />
              <Area type="monotone" dataKey="close" stroke={up ? '#10b981' : '#f43f5e'} fill={`url(#assistant_focus_${ticker})`} strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : loading ? (
          <div className="flex h-full items-center justify-center rounded-xl bg-[var(--eq-card2)] text-xs text-[var(--eq-text3)]">Loading chart…</div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl bg-[var(--eq-card2)] text-xs text-[var(--eq-text3)]">No chart data</div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ['Market cap', summary.market_cap_fmt || fmtCompact(summary.market_cap)],
          ['P/E', summary.pe_trailing != null ? Number(summary.pe_trailing).toFixed(1) : '—'],
          ['Forward P/E', summary.pe_forward != null ? Number(summary.pe_forward).toFixed(1) : '—'],
          ['Consensus', summary.recommendation || '—'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-[var(--eq-card2)] px-3 py-2 ring-1 ring-[var(--eq-border)]">
            <div className="text-[10px] text-[var(--eq-text3)]">{label}</div>
            <div className="mt-0.5 truncate text-sm font-semibold text-[var(--eq-text)]">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => onNavigate?.('research', ticker)} className="rounded-lg bg-[var(--eq-accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--eq-accent)] hover:bg-[var(--eq-accent-soft)]">
          Full research
        </button>
        <button type="button" onClick={() => onNavigate?.('terminal', ticker)} className="rounded-lg bg-[var(--eq-card2)] px-3 py-1.5 text-xs font-semibold text-[var(--eq-text2)] hover:bg-[var(--eq-border)]">
          Full chart
        </button>
      </div>
    </div>
  );
}

function ScreenerMiniTable({ rows, onTickerSelect, onNavigate }) {
  if (!rows?.length) return <div className="rounded-xl bg-[var(--eq-card2)] p-4 text-sm text-[var(--eq-text3)]">No screener rows match.</div>;
  return (
    <div className="overflow-hidden rounded-xl bg-[var(--eq-card)] shadow-sm ring-1 ring-[var(--eq-border)]">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[var(--eq-card2)] text-[10px] uppercase tracking-wide text-[var(--eq-text3)]">
            <tr>
              <th className="px-3 py-2 text-left">Ticker</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2 text-right">1M</th>
              <th className="px-3 py-2 text-right">RSI</th>
              <th className="px-3 py-2 text-right">P/E</th>
              <th className="px-3 py-2 text-right">MCap</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((row) => (
              <tr key={row.symbol} className="border-t border-[var(--eq-grid)] hover:bg-[var(--eq-card2)]">
                <td className="px-3 py-2">
                  <button type="button" onClick={() => onTickerSelect?.(row.symbol)} className="font-semibold text-[var(--eq-accent)] hover:underline">{row.symbol}</button>
                  <div className="max-w-[180px] truncate text-[10px] text-[var(--eq-text3)]">{row.name}</div>
                </td>
                <td className="px-3 py-2 text-right font-semibold text-[var(--eq-text)]">{row.buy_count}/{row.total_strategies}</td>
                <td className={`px-3 py-2 text-right font-mono ${toneClass(row.change_20d)}`}>{fmtPctValue(row.change_20d)}</td>
                <td className="px-3 py-2 text-right font-mono text-[var(--eq-text2)]">{row.rsi ?? '—'}</td>
                <td className="px-3 py-2 text-right font-mono text-[var(--eq-text2)]">{row.pe_ratio != null ? Number(row.pe_ratio).toFixed(1) : '—'}</td>
                <td className="px-3 py-2 text-right text-[var(--eq-text3)]">{fmtCompact(row.market_cap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-[var(--eq-grid)] px-3 py-2">
        <button type="button" onClick={() => onNavigate?.('screener')} className="text-[11px] font-semibold text-[var(--eq-accent)] hover:underline">Open full screener</button>
      </div>
    </div>
  );
}

function compactAgentBullets(text) {
  const clean = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/\*\*/g, '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .trim();
  if (!clean) return [];
  const reject = (line) => {
    const lower = line.toLowerCase();
    return (
      /^okay[, ]/.test(lower) ||
      /^sure[, ]/.test(lower) ||
      /^here('| i)s\b/.test(lower) ||
      /^let('|’)s\b/.test(lower) ||
      /^as equilima ai\b/.test(lower) ||
      /^methodology\b/.test(lower) ||
      /^criteria\b/.test(lower) ||
      /^the following\b/.test(lower) ||
      /^this analysis\b/.test(lower) ||
      /^i do not\b/.test(lower) ||
      /^i don('|’)t\b/.test(lower) ||
      /do not have access to live/i.test(line) ||
      /real[- ]time data feeds/i.test(line) ||
      /historical data/i.test(line) ||
      /not financial advice/i.test(line) ||
      /investment decisions should/i.test(line) ||
      /consult (a )?financial/i.test(line) ||
      /used? to identify/i.test(line) ||
      /criteria are applied/i.test(line)
    );
  };
  const highSignal = (line) => {
    const tickerHit = extractTickers(line).length > 0;
    const numberHit = /[$+−-]?\d+(\.\d+)?\s?%|\$\d|\b\d+(\.\d+)?x\b|\b\d+(\.\d+)?\b/.test(line);
    const actionHit = /\b(buy|sell|hold|avoid|watch|rank|target|upside|downside|risk|catalyst|support|resistance|breakout|oversold|overbought|valuation|margin|revenue|earnings|cash flow|debt|rsi|p\/e|pe|score)\b/i.test(line);
    return (tickerHit && (numberHit || actionHit)) || (numberHit && actionHit);
  };
  const candidates = clean
    .split('\n')
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z$])/))
    .map((line) => line.replace(/^\s*[-*+•]\s*/, '').replace(/^\s*\d+\.\s*/, '').trim())
    .map((line) => line.replace(/^([^:]{1,28}):\s+/, (m, label) => (/methodology|criteria|growth potential|valuation|forward guidance/i.test(label) ? '' : m)).trim())
    .filter(Boolean)
    .filter((line) => !reject(line));
  const signal = candidates.filter(highSignal);
  const source = signal.length ? signal : candidates;
  return source
    .map((line) => line.replace(/\s+/g, ' ').replace(/^[-:]\s*/, '').slice(0, 180))
    .filter(Boolean)
    .slice(0, 4);
}

function AgentBriefCard({ text }) {
  const bullets = useMemo(() => compactAgentBullets(text), [text]);
  return (
    <div className="rounded-xl bg-[var(--eq-card)] p-4 ring-1 ring-[var(--eq-border)]">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--eq-text)]">
        <Bot className="h-4 w-4 text-[var(--eq-accent)]" /> Agent take
      </div>
      {bullets.length ? (
        <div className="grid gap-1.5">
          {bullets.map((item, idx) => (
            <div key={`${item}-${idx}`} className="flex min-w-0 gap-2 text-xs leading-5 text-[var(--eq-text2)]">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--eq-accent)]" />
              <span className="min-w-0 break-words">{item}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--eq-text3)]">Ask the agent. Tickers and themes will populate this workspace.</p>
      )}
    </div>
  );
}

function WorkspaceChatContext({ text }) {
  const hasContext = Boolean(String(text || '').trim());
  if (!hasContext) return null;
  return (
    <div className="mb-3">
      <AgentBriefCard text={text} />
    </div>
  );
}

function AssistantMiniVisuals({ chart, macro, rows, ticker }) {
  const macroChart = (macro?.charts || []).find((c) => c.id === 'rates_jobs') || (macro?.charts || [])[0];
  const macroRows = mergeMacroSeries(macroChart).slice(-80);
  const topRows = (rows || []).slice(0, 5);
  const chartDateKey = chart?.[0]?.time ? 'time' : 'date';
  const up = chart?.length ? Number(chart[chart.length - 1]?.close || 0) >= Number(chart[0]?.close || 0) : true;
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="rounded-xl bg-[var(--eq-card)] p-3 ring-1 ring-[var(--eq-border)]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="truncate text-xs font-semibold text-[var(--eq-text)]">{ticker || 'Focus chart'}</div>
          <BarChart3 className="h-3.5 w-3.5 text-[var(--eq-text3)]" />
        </div>
        <div className="h-24">
          {chart?.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart.slice(-90)} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
                <YAxis domain={['auto', 'auto']} hide />
                <XAxis dataKey={chartDateKey} hide />
                <Area type="monotone" dataKey="close" stroke={up ? '#10b981' : '#f43f5e'} fill={up ? '#10b98122' : '#f43f5e22'} strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg bg-[var(--eq-card2)] text-[11px] text-[var(--eq-text3)]">No ticker yet</div>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-[var(--eq-card)] p-3 ring-1 ring-[var(--eq-border)]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="truncate text-xs font-semibold text-[var(--eq-text)]">Macro pulse</div>
          <Activity className="h-3.5 w-3.5 text-[var(--eq-text3)]" />
        </div>
        <div className="h-24">
          {macroRows.length && macroChart ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={macroRows} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
                <YAxis hide />
                <XAxis dataKey="date" hide />
                {(macroChart.series || []).slice(0, 2).map((s) => (
                  <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg bg-[var(--eq-card2)] text-[11px] text-[var(--eq-text3)]">Loading macro</div>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-[var(--eq-card)] p-3 ring-1 ring-[var(--eq-border)]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="truncate text-xs font-semibold text-[var(--eq-text)]">Top screen</div>
          <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--eq-text3)]" />
        </div>
        <div className="h-24">
          {topRows.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topRows} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
                <XAxis dataKey="symbol" tick={{ fontSize: 9, fill: 'currentColor' }} className="text-[var(--eq-text3)]" />
                <YAxis hide domain={[0, 'dataMax']} />
                <Bar dataKey="buy_count" radius={[3, 3, 0, 0]}>
                  {topRows.map((row) => <Cell key={row.symbol} fill={(row.change_20d || 0) >= 0 ? '#10b981' : '#f43f5e'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg bg-[var(--eq-card2)] text-[11px] text-[var(--eq-text3)]">Scanning</div>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkspaceSparkline({ data }) {
  const values = (data || []).map((v) => numValue(v)).filter((v) => v != null).slice(-60);
  if (values.length < 2) {
    return <div className="h-9 rounded-lg bg-[var(--eq-card2)]" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 120},${34 - ((v - min) / range) * 30 - 2}`)
    .join(' ');
  const up = values[values.length - 1] >= values[0];
  return (
    <svg viewBox="0 0 120 36" className="h-9 w-full">
      <polyline fill="none" stroke={up ? '#10b981' : '#f43f5e'} strokeWidth="2" points={points} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function WorkspaceMetric({ label, value, tone = 'neutral' }) {
  const toneCls = tone === 'good'
    ? 'text-[var(--eq-gain)] bg-[var(--eq-gain-soft)] ring-[var(--eq-gain)]/25'
    : tone === 'bad'
      ? 'text-[var(--eq-loss)] bg-[var(--eq-loss-soft)] ring-[var(--eq-loss)]/25'
      : 'text-[var(--eq-text)] bg-[var(--eq-card)] ring-[var(--eq-border)]';
  return (
    <div className={`rounded-xl px-3 py-2.5 ring-1 ${toneCls}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-55">{label}</div>
      <div className="mt-1 text-lg font-semibold leading-none">{value}</div>
    </div>
  );
}

function WorkspaceScreenerDashboard({ intent, rows, allRows, onTickerSelect, onNavigate }) {
  const strictRows = useMemo(() => applyWorkspaceScreenIntent(allRows || [], intent), [allRows, intent]);
  const isFallback = strictRows.length === 0 && (allRows?.length || 0) > 0 && (rows?.length || 0) > 0 && (intent?.chips?.length || 0) > 0;
  const rankedRows = useMemo(() => {
    return [...(rows || [])]
      .map((row) => ({ ...row, opportunity_score: screenerOpportunityScore(row) }))
      .sort((a, b) => (b.opportunity_score || 0) - (a.opportunity_score || 0));
  }, [rows]);
  const topRows = rankedRows.slice(0, 8);
  const chartRows = topRows.map((row) => ({
    symbol: row.symbol,
    scorePct: Math.round((numValue(row.buy_count, 0) / Math.max(1, numValue(row.total_strategies, 7))) * 100),
    momentum: numValue(row.change_20d, 0),
    rsi: numValue(row.rsi, 50),
    pe: numValue(row.pe_ratio),
    risk: numValue(row.volatility, 0),
    opportunity: numValue(row.opportunity_score, 0),
    marketCapB: row.market_cap ? row.market_cap / 1e9 : null,
  }));
  const scatterRows = rankedRows
    .map((row) => ({
      symbol: row.symbol,
      pe: numValue(row.pe_ratio) == null ? null : Math.max(0, Math.min(80, numValue(row.pe_ratio))),
      momentum: numValue(row.change_20d),
      rsi: numValue(row.rsi, 50),
      opportunity: numValue(row.opportunity_score, 0),
      marketCapB: row.market_cap ? row.market_cap / 1e9 : 1,
    }))
    .filter((row) => row.pe != null && row.momentum != null)
    .slice(0, 24);
  const universe = intent?.listLabel || 'Market';
  const matchCount = isFallback ? strictRows.length : (rows?.length || 0);
  const totalCount = allRows?.length || 0;
  const medianPe = medianValue(rankedRows.map((r) => r.pe_ratio));
  const avgMomentum = avgValue(rankedRows.map((r) => r.change_20d));
  const medianRsi = medianValue(rankedRows.map((r) => r.rsi));
  const chips = intent?.chips || [];

  if (!totalCount) {
    return (
      <div className="rounded-xl bg-[var(--eq-card)] p-5 ring-1 ring-[var(--eq-border)]">
        <div className="flex min-h-56 items-center justify-center rounded-xl bg-[var(--eq-card2)] text-sm text-[var(--eq-text3)]">
          Loading the screen for this chat...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[var(--eq-card)] p-4 ring-1 ring-[var(--eq-border)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--eq-text3)]">Chat-driven screener</div>
            <h3 className="mt-1 text-lg font-semibold text-[var(--eq-text)]">{universe}</h3>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-[var(--eq-text3)]">
              {isFallback
                ? 'No strict match passed every chat filter, so this shows the closest ranked candidates instead of an empty screen.'
                : 'Ranked by signal count, momentum, valuation, RSI quality, and volatility penalty from the latest chat request.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate?.('screener')}
            className="rounded-full bg-[var(--eq-card2)] px-3 py-1.5 text-[11px] font-semibold text-[var(--eq-text2)] ring-1 ring-[var(--eq-border)] hover:bg-[var(--eq-card2)] hover:text-[var(--eq-text)]"
          >
            Full screener
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.length ? chips.map((chip) => (
            <span key={chip} className="rounded-full bg-[var(--eq-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--eq-accent)] ring-1 ring-[var(--eq-accent-ring)]">
              {chip}
            </span>
          )) : (
            <span className="rounded-full bg-[var(--eq-card2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--eq-text3)] ring-1 ring-[var(--eq-border)]">
              Agent default screen
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <WorkspaceMetric label={isFallback ? 'Strict Matches' : 'Matches'} value={`${matchCount}/${totalCount}`} tone={matchCount ? 'good' : 'bad'} />
        <WorkspaceMetric label="Median P/E" value={formatPlainNumber(medianPe)} />
        <WorkspaceMetric label="Avg 1M" value={fmtPctValue(avgMomentum)} tone={numValue(avgMomentum, 0) >= 0 ? 'good' : 'bad'} />
        <WorkspaceMetric label="Median RSI" value={formatPlainNumber(medianRsi)} />
      </div>

      {!rankedRows.length ? (
        <div className="rounded-xl bg-[var(--eq-card)] p-5 text-sm text-[var(--eq-text3)] ring-1 ring-[var(--eq-border)]">
          No names passed the chat filters. Try asking for a wider universe or fewer constraints.
        </div>
      ) : (
        <>
          <div className="grid gap-3 xl:grid-cols-4">
            {rankedRows.slice(0, 4).map((row) => (
              <button
                key={row.symbol}
                type="button"
                onClick={() => onTickerSelect?.(row.symbol)}
                className="rounded-xl bg-[var(--eq-card)] p-3 text-left ring-1 ring-[var(--eq-border)] transition hover:-translate-y-0.5 hover:ring-[var(--eq-accent-ring)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-[var(--eq-text)]">{row.symbol}</div>
                    <div className="truncate text-[11px] text-[var(--eq-text3)]">{row.name || row.sector || 'Candidate'}</div>
                  </div>
                  <div className="rounded-lg bg-[var(--eq-accent-soft)] px-2 py-1 text-xs font-bold text-[var(--eq-accent)]">
                    {formatPlainNumber(row.opportunity_score, 0)}
                  </div>
                </div>
                <div className="mt-2"><WorkspaceSparkline data={row.sparkline} /></div>
                <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
                  <div className="rounded-lg bg-[var(--eq-card2)] px-2 py-1">
                    <div className="text-[var(--eq-text3)]">1M</div>
                    <div className={`font-semibold ${toneClass(row.change_20d)}`}>{fmtPctValue(row.change_20d)}</div>
                  </div>
                  <div className="rounded-lg bg-[var(--eq-card2)] px-2 py-1">
                    <div className="text-[var(--eq-text3)]">P/E</div>
                    <div className="font-semibold text-[var(--eq-text)]">{formatPlainNumber(row.pe_ratio)}</div>
                  </div>
                  <div className="rounded-lg bg-[var(--eq-card2)] px-2 py-1">
                    <div className="text-[var(--eq-text3)]">RSI</div>
                    <div className="font-semibold text-[var(--eq-text)]">{formatPlainNumber(row.rsi)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="rounded-xl bg-[var(--eq-card)] p-4 ring-1 ring-[var(--eq-border)]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--eq-text)]">Candidate Score</h3>
                <span className="text-[11px] text-[var(--eq-text3)]">Agent rank</span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartRows} layout="vertical" margin={{ top: 8, right: 18, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-[var(--eq-grid)]" />
                    <XAxis type="number" hide domain={[0, 'dataMax']} />
                    <YAxis type="category" dataKey="symbol" width={42} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-[var(--eq-text3)]" />
                    <Tooltip />
                    <Bar dataKey="opportunity" name="Agent score" radius={[0, 5, 5, 0]}>
                      {chartRows.map((row) => <Cell key={row.symbol} fill={row.opportunity >= 45 ? '#10b981' : row.opportunity >= 25 ? '#6366f1' : '#f59e0b'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl bg-[var(--eq-card)] p-4 ring-1 ring-[var(--eq-border)]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--eq-text)]">Momentum vs Value</h3>
                <span className="text-[11px] text-[var(--eq-text3)]">P/E x 1M</span>
              </div>
              <div className="h-64">
                {scatterRows.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 12, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-[var(--eq-grid)]" />
                      <XAxis type="number" dataKey="pe" name="P/E" domain={[0, 80]} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-[var(--eq-text3)]" />
                      <YAxis type="number" dataKey="momentum" name="1M %" width={42} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-[var(--eq-text3)]" />
                      <ZAxis type="number" dataKey="opportunity" range={[45, 280]} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                      <ReferenceLine y={0} stroke="#a1a1aa" strokeDasharray="4 4" />
                      <Scatter data={scatterRows} name="Candidates" fill="#6366f1">
                        {scatterRows.map((row) => <Cell key={row.symbol} fill={row.opportunity >= 45 ? '#10b981' : row.opportunity >= 25 ? '#6366f1' : '#f59e0b'} />)}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl bg-[var(--eq-card2)] text-xs text-[var(--eq-text3)]">Need P/E and price data for map.</div>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-[var(--eq-card)] p-4 ring-1 ring-[var(--eq-border)]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--eq-text)]">Risk and Timing</h3>
                <span className="text-[11px] text-[var(--eq-text3)]">RSI + vol</span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartRows} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-[var(--eq-grid)]" />
                    <XAxis dataKey="symbol" tick={{ fontSize: 10, fill: 'currentColor' }} className="text-[var(--eq-text3)]" />
                    <YAxis yAxisId="left" width={38} domain={[0, 100]} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-[var(--eq-text3)]" />
                    <YAxis yAxisId="right" orientation="right" width={42} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-[var(--eq-text3)]" />
                    <Tooltip />
                    <ReferenceLine yAxisId="left" y={70} stroke="#f59e0b" strokeDasharray="4 4" />
                    <ReferenceLine yAxisId="left" y={30} stroke="#10b981" strokeDasharray="4 4" />
                    <Bar yAxisId="left" dataKey="rsi" name="RSI" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="risk" name="Volatility" stroke="#f43f5e" strokeWidth={2.2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="overflow-hidden rounded-xl bg-[var(--eq-card)] ring-1 ring-[var(--eq-border)]">
              <div className="flex items-center justify-between px-4 py-3">
                <h3 className="text-sm font-semibold text-[var(--eq-text)]">Ranked Candidates</h3>
                <span className="text-[11px] text-[var(--eq-text3)]">Click ticker for research</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--eq-card2)] text-[10px] uppercase tracking-wide text-[var(--eq-text3)]">
                    <tr>
                      <th className="px-4 py-2">Ticker</th>
                      <th className="px-3 py-2 text-right">Agent</th>
                      <th className="px-3 py-2 text-right">Signals</th>
                      <th className="px-3 py-2 text-right">1M</th>
                      <th className="px-3 py-2 text-right">P/E</th>
                      <th className="px-3 py-2 text-right">RSI</th>
                      <th className="px-3 py-2 text-right">MCap</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--eq-grid)]">
                    {rankedRows.slice(0, 12).map((row) => (
                      <tr key={row.symbol} className="hover:bg-[var(--eq-card2)]/80">
                        <td className="px-4 py-2">
                          <button type="button" onClick={() => onTickerSelect?.(row.symbol)} className="font-semibold text-[var(--eq-accent)] hover:underline">{row.symbol}</button>
                          <div className="max-w-40 truncate text-[10px] text-[var(--eq-text3)]">{row.name || row.sector}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-[var(--eq-text)]">{formatPlainNumber(row.opportunity_score, 0)}</td>
                        <td className="px-3 py-2 text-right">{row.buy_count}/{row.total_strategies || 7}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${toneClass(row.change_20d)}`}>{fmtPctValue(row.change_20d)}</td>
                        <td className="px-3 py-2 text-right">{formatPlainNumber(row.pe_ratio)}</td>
                        <td className="px-3 py-2 text-right">{formatPlainNumber(row.rsi)}</td>
                        <td className="px-3 py-2 text-right">{fmtCompact(row.market_cap)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MacroMiniPanel({ macro }) {
  const chart = (macro?.charts || []).find((c) => c.id === 'rates_jobs') || (macro?.charts || [])[0];
  const rows = mergeMacroSeries(chart).slice(-180);
  return (
    <div className="rounded-xl bg-[var(--eq-card)] p-4 shadow-sm ring-1 ring-[var(--eq-border)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--eq-text)]">Macro regime</h3>
          <p className="mt-0.5 text-xs text-[var(--eq-text3)]">{macro?.analysis?.cached ? "Today's cached agent view" : 'Fresh macro view'}</p>
        </div>
        <Brain className="h-4 w-4 text-[var(--eq-accent)]" />
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {(macro?.signals || []).slice(0, 4).map((item) => {
          const short = String(item.short_term || 'Hold').toLowerCase();
          return (
            <div key={item.asset} className={`rounded-lg px-3 py-2 ring-1 ${
              short === 'buy' ? 'bg-[var(--eq-gain-soft)] text-[var(--eq-gain)] ring-[var(--eq-gain)]/25'
              : short === 'sell' ? 'bg-[var(--eq-loss-soft)] text-[var(--eq-loss)] ring-[var(--eq-loss)]/25'
              : 'bg-[var(--eq-warn)]/10 text-amber-900 ring-[var(--eq-warn)]/25'
            }`}>
              <div className="text-[10px] opacity-70">{item.symbol}</div>
              <div className="truncate text-xs font-semibold">{item.asset}</div>
              <div className="mt-1 text-[11px] font-bold">{item.short_term || 'Hold'}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 h-52">
        {rows.length && chart ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-[var(--eq-grid)]" />
              <XAxis dataKey="date" minTickGap={28} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-[var(--eq-text3)]" />
              <YAxis width={42} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-[var(--eq-text3)]" />
              <Tooltip />
              {(chart.series || []).slice(0, 3).map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl bg-[var(--eq-card2)] text-xs text-[var(--eq-text3)]">Loading macro chart…</div>
        )}
      </div>
    </div>
  );
}

function AssistantWorkbench({
  messages,
  streamingText,
  liveRoute,
  focusTicker,
  setFocusTicker,
  onNavigate,
  strategies,
  onCompare,
  compareResults,
  compareLoading,
}) {
  const discussedTickers = useMemo(() => extractSessionTickers(messages), [messages]);
  const tickerKey = discussedTickers.join('|');
  const latestUser = useMemo(() => latestMessageByRole(messages, 'user'), [messages]);
  const latestAssistant = useMemo(() => {
    const found = [...(messages || [])].reverse().find((m) => m.role === 'assistant' && String(m.content || '').trim());
    return streamingText || found?.content || '';
  }, [messages, streamingText]);
  const regexIntent = useMemo(() => classifyWorkspaceIntent({
    latestUser,
    latestAssistant,
    tickers: discussedTickers,
    focusTicker,
  }), [latestAssistant, latestUser, tickerKey, focusTicker]);
  // The LLM agent's routing decision is authoritative; the regex is the fallback
  // that covers the brief gap before the model responds (and offline degradation).
  const workspaceIntent = useMemo(() => {
    if (!liveRoute?.tab) return regexIntent;
    const llmTicker = String(liveRoute.ticker || '').toUpperCase();
    return {
      ...regexIntent,
      tab: liveRoute.tab,
      primaryTicker: llmTicker || regexIntent.primaryTicker,
      researchSubtab: liveRoute.researchSubtab || regexIntent.researchSubtab,
      reason: liveRoute.reason || regexIntent.reason,
    };
  }, [regexIntent, liveRoute]);

  const [tab, setTab] = useState('overview');
  const [research, setResearch] = useState(null);
  const [chart, setChart] = useState([]);
  const [researchLoading, setResearchLoading] = useState(false);
  const [news, setNews] = useState(null);
  const [macro, setMacro] = useState(null);
  const [screenRows, setScreenRows] = useState([]);
  const [workspaceNav, setWorkspaceNav] = useState({
    entries: [{ tab: 'overview', ticker: focusTicker || '' }],
    index: 0,
  });
  const lastAutoRouteRef = useRef('');

  useEffect(() => {
    if (!focusTicker) return;
    let cancelled = false;
    setResearchLoading(true);
    assistantFetchResearch(focusTicker).then((r) => {
      if (cancelled) return;
      setResearch(r);
      setChart(Array.isArray(r?.chart) ? r.chart : []);
    }).finally(() => {
      if (!cancelled) setResearchLoading(false);
    });
    return () => { cancelled = true; };
  }, [focusTicker]);

  const newsSymbols = useMemo(() => {
    if (discussedTickers.length) return discussedTickers.join(',');
    if (focusTicker) return focusTicker;
    if (workspaceIntent.tab === 'macro' || workspaceIntent.tab === 'news') return '^GSPC,^IXIC,GC=F,CL=F,BTC-USD,DX-Y.NYB';
    return '';
  }, [focusTicker, tickerKey, workspaceIntent.tab]);

  useEffect(() => {
    if (!newsSymbols) return;
    let cancelled = false;
    assistantFetchNews(newsSymbols)
      .then((n) => { if (!cancelled) setNews(n); })
      .catch(() => { if (!cancelled) setNews(null); });
    return () => { cancelled = true; };
  }, [newsSymbols]);

  useEffect(() => {
    assistantFetchMacroOverview().then(setMacro).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    assistantRunScreener({ list_id: workspaceIntent.screener?.listId || 'sp500', strategies: AGENT_ASSISTANT_STRATEGIES })
      .then((d) => {
        if (!cancelled) setScreenRows(d?.results || []);
      })
      .catch(() => {
        if (!cancelled) setScreenRows([]);
      });
    return () => { cancelled = true; };
  }, [workspaceIntent.screener?.listId]);

  useEffect(() => {
    if (!discussedTickers.length) return;
    const next = discussedTickers[0];
    if (next && next !== focusTicker) setFocusTicker(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discussedTickers.join('|')]);

  useEffect(() => {
    if (tab !== 'research' || !focusTicker) return;
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('eq-agent-open-ticker', {
        detail: { tab: 'research', ticker: focusTicker },
      }));
      window.dispatchEvent(new CustomEvent('eq-research-subtab', { detail: { sub: workspaceIntent.researchSubtab || 'fundamentals' } }));
    }, 0);
  }, [tab, focusTicker, workspaceIntent.researchSubtab]);

  useEffect(() => {
    if (tab !== 'screener' || !focusTicker) return;
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('eq-agent-open-ticker', {
        detail: { tab: 'screener', ticker: focusTicker },
      }));
    }, 0);
  }, [tab, focusTicker]);

  const visibleScreenRows = useMemo(() => {
    const intentRows = applyWorkspaceScreenIntent(screenRows, workspaceIntent.screener);
    const hasSpecificScreen = Boolean(workspaceIntent.request && workspaceIntent.tab === 'screener');
    const sourceRows = (hasSpecificScreen && !intentRows.length && screenRows?.length)
      ? [...screenRows].sort((a, b) => screenerOpportunityScore(b) - screenerOpportunityScore(a))
      : intentRows;
    return (sourceRows || [])
      .filter((row) => hasSpecificScreen || (row.buy_count || 0) >= 3)
      .slice(0, 25);
  }, [screenRows, workspaceIntent.request, workspaceIntent.screener, workspaceIntent.tab]);

  const pushWorkspaceState = useCallback((next) => {
    const entry = {
      tab: next.tab || tab,
      ticker: Object.prototype.hasOwnProperty.call(next, 'ticker') ? next.ticker : (focusTicker || ''),
    };
    setTab(entry.tab);
    if (Object.prototype.hasOwnProperty.call(next, 'ticker')) setFocusTicker(entry.ticker || '');
    setWorkspaceNav((prev) => {
      const current = prev.entries[prev.index] || {};
      if (current.tab === entry.tab && (current.ticker || '') === (entry.ticker || '')) return prev;
      const entries = [...prev.entries.slice(0, prev.index + 1), entry].slice(-40);
      return { entries, index: entries.length - 1 };
    });
  }, [focusTicker, setFocusTicker, tab]);

  const goWorkspaceHistory = useCallback((delta) => {
    const nextIndex = workspaceNav.index + delta;
    const entry = workspaceNav.entries[nextIndex];
    if (!entry) return;
    setTab(entry.tab || 'overview');
    setFocusTicker(entry.ticker || '');
    setWorkspaceNav((prev) => ({ ...prev, index: nextIndex }));
  }, [setFocusTicker, workspaceNav]);

  const openWorkspaceResearch = (ticker) => {
    const symbol = ticker ? String(ticker).trim().toUpperCase() : '';
    if (!symbol) return;
    pushWorkspaceState({ tab: 'research', ticker: symbol });
  };

  const openWorkspaceTab = (nextTab) => {
    pushWorkspaceState({
      tab: nextTab || workspaceIntent.tab || 'overview',
      ...(nextTab === 'research' && (workspaceIntent.primaryTicker || focusTicker) ? { ticker: workspaceIntent.primaryTicker || focusTicker } : {}),
    });
  };

  useEffect(() => {
    if (!workspaceIntent.request) return;
    const routeKey = `${workspaceIntent.request}|${workspaceIntent.tab}|${workspaceIntent.primaryTicker || ''}`;
    if (lastAutoRouteRef.current === routeKey) return;
    lastAutoRouteRef.current = routeKey;
    pushWorkspaceState({
      tab: workspaceIntent.tab || 'overview',
      ...(workspaceIntent.tab === 'research' && (workspaceIntent.primaryTicker || focusTicker) ? { ticker: workspaceIntent.primaryTicker || focusTicker } : {}),
    });
  }, [focusTicker, pushWorkspaceState, workspaceIntent.primaryTicker, workspaceIntent.request, workspaceIntent.tab]);

  return (
    <section className="min-w-0 flex-1 overflow-y-auto bg-[var(--eq-card2)] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--eq-text)]">Workspace</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => goWorkspaceHistory(-1)}
            disabled={workspaceNav.index <= 0}
            className="inline-flex h-8 w-7 items-center justify-center text-[var(--eq-text3)] transition hover:text-[var(--eq-text)] disabled:cursor-default disabled:opacity-30 disabled:hover:text-[var(--eq-text3)]"
            title="Previous workspace view"
            aria-label="Previous workspace view"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => goWorkspaceHistory(1)}
            disabled={workspaceNav.index >= workspaceNav.entries.length - 1}
            className="inline-flex h-8 w-7 items-center justify-center text-[var(--eq-text3)] transition hover:text-[var(--eq-text)] disabled:cursor-default disabled:opacity-30 disabled:hover:text-[var(--eq-text3)]"
            title="Next workspace view"
            aria-label="Next workspace view"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-[var(--eq-card)] p-1 ring-1 ring-[var(--eq-border)]">
        {WORKSPACE_TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => openWorkspaceTab(item.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                tab === item.id
                  ? 'bg-[var(--eq-text)] text-[var(--eq-bg)] shadow-sm'
                  : 'text-[var(--eq-text3)] hover:bg-[var(--eq-card2)] hover:text-[var(--eq-text)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {item.label}
              {workspaceIntent.request && workspaceIntent.tab === item.id && (
                <span className={`ml-0.5 h-1.5 w-1.5 rounded-full ${tab === item.id ? 'bg-[var(--eq-card)]/75' : 'bg-[var(--eq-accent)]'}`} />
              )}
            </button>
          );
        })}
      </div>

      {discussedTickers.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {discussedTickers.map((ticker) => (
            <button
              type="button"
              key={ticker}
              onClick={() => openWorkspaceResearch(ticker)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ring-1 ${
                focusTicker === ticker
                  ? 'bg-[var(--eq-accent-soft)] text-[var(--eq-accent)] ring-[var(--eq-accent-ring)]'
                  : 'bg-[var(--eq-card)] text-[var(--eq-text3)] ring-[var(--eq-border)] hover:text-[var(--eq-text)]'
              }`}
            >
              {ticker}
            </button>
          ))}
        </div>
      )}

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-3">
          {workspaceIntent.tab === 'screener' && (
            <WorkspaceScreenerDashboard
              intent={workspaceIntent.screener}
              rows={visibleScreenRows}
              allRows={screenRows}
              onTickerSelect={openWorkspaceResearch}
              onNavigate={onNavigate}
            />
          )}
          <div className="grid gap-3 xl:grid-cols-[.95fr_1.05fr]">
            <AgentBriefCard text={latestAssistant} />
            <AssistantMiniVisuals chart={chart} macro={macro} rows={visibleScreenRows} ticker={focusTicker} />
          </div>
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1.1fr_.9fr]">
          <ResearchSnapshot ticker={focusTicker} research={research} chart={chart} loading={researchLoading} onNavigate={onNavigate} />
          <div className="space-y-4">
            <MacroMiniPanel macro={macro} />
          </div>
          <div className="2xl:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--eq-text)]">Screener shortlist</h3>
              <span className="text-[11px] text-[var(--eq-text3)]">{visibleScreenRows.length} matches</span>
            </div>
            <ScreenerMiniTable rows={visibleScreenRows.slice(0, 8)} onTickerSelect={openWorkspaceResearch} onNavigate={onNavigate} />
          </div>
          </div>
        </div>
      )}

      {tab === 'research' && (
        <div>
          <WorkspaceChatContext text={latestAssistant} tickers={discussedTickers} intent={workspaceIntent} onTickerSelect={openWorkspaceResearch} onTabSelect={openWorkspaceTab} />
          <div className="mb-4">
            <ResearchSnapshot ticker={focusTicker} research={research} chart={chart} loading={researchLoading} onNavigate={onNavigate} />
          </div>
          <div className="rounded-xl bg-[var(--eq-card)] p-4 shadow-sm ring-1 ring-[var(--eq-border)]">
            <ResearchPanel
              strategies={strategies}
              onCompare={onCompare}
              compareResults={compareResults}
              compareLoading={compareLoading}
            />
          </div>
        </div>
      )}

      {tab === 'screener' && (
        <div>
          <WorkspaceChatContext text={latestAssistant} tickers={discussedTickers} intent={workspaceIntent} onTickerSelect={openWorkspaceResearch} onTabSelect={openWorkspaceTab} />
          <WorkspaceScreenerDashboard
            intent={workspaceIntent.screener}
            rows={visibleScreenRows}
            allRows={screenRows}
            onTickerSelect={openWorkspaceResearch}
            onNavigate={onNavigate}
          />
        </div>
      )}

      {tab === 'macro' && (
        <div>
          <WorkspaceChatContext text={latestAssistant} tickers={discussedTickers} intent={workspaceIntent} onTickerSelect={openWorkspaceResearch} onTabSelect={openWorkspaceTab} />
          <div className="mb-4">
            <MacroMiniPanel macro={macro} />
          </div>
          <div className="rounded-xl bg-[var(--eq-card)] p-4 shadow-sm ring-1 ring-[var(--eq-border)]">
            <MacroPanel />
          </div>
        </div>
      )}

      {tab === 'news' && (
        <div>
          <WorkspaceChatContext text={latestAssistant} tickers={discussedTickers} intent={workspaceIntent} onTickerSelect={openWorkspaceResearch} onTabSelect={openWorkspaceTab} />
          <div className="rounded-xl bg-[var(--eq-card)] p-4 shadow-sm ring-1 ring-[var(--eq-border)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[var(--eq-text)]">
                News for {discussedTickers.length ? discussedTickers.slice(0, 4).join(', ') : (focusTicker || 'chat context')}
              </h3>
              {focusTicker && (
                <button type="button" onClick={() => onNavigate?.('research', focusTicker)} className="text-[11px] font-semibold text-[var(--eq-accent)] hover:underline">Research page</button>
              )}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {((news?.articles || news?.news || news || [])).slice?.(0, 12)?.map((item, idx) => (
                <a
                  key={`${item.title}-${idx}`}
                  href={item.url || undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-[var(--eq-card2)] p-3 ring-1 ring-[var(--eq-border)] hover:bg-[var(--eq-card2)]"
                >
                  <div className="text-[11px] font-semibold text-[var(--eq-text3)]">{item.source || item.publisher || item.symbol || focusTicker}</div>
                  <div className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-[var(--eq-text)]">{item.title}</div>
                </a>
              )) || <p className="text-sm text-[var(--eq-text3)]">No news loaded.</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function AssistantMode({
  activeSession,
  messages,
  loading,
  streamingText,
  liveRoute,
  input,
  setInput,
  handleSend,
  mode,
  layoutMode,
  setLayoutMode,
  assistantAvailable,
  onNavigate,
  scrollRef,
  suggestions,
  historyList,
  createNewChat,
  strategies,
  onCompare,
  compareResults,
  compareLoading,
}) {
  const discussedTickers = useMemo(() => extractSessionTickers(messages), [messages]);
  const [focusTicker, setFocusTicker] = useState(discussedTickers[0] || '');

  useEffect(() => {
    if (discussedTickers[0]) setFocusTicker(discussedTickers[0]);
  }, [discussedTickers.join('|')]);

  return (
    <div className="grid h-[calc(100dvh-57px)] max-h-[calc(100dvh-57px)] min-h-0 w-full grid-cols-[410px_minmax(0,1fr)] overflow-hidden bg-[var(--eq-card2)]">
      <AssistantChatColumn
        activeSession={activeSession}
        messages={messages}
        loading={loading}
        streamingText={streamingText}
        input={input}
        setInput={setInput}
        handleSend={handleSend}
        mode={mode}
        layoutMode={layoutMode}
        setLayoutMode={setLayoutMode}
        assistantAvailable={assistantAvailable}
        onNavigate={onNavigate}
        scrollRef={scrollRef}
        suggestions={suggestions}
        historyList={historyList}
        createNewChat={createNewChat}
      />
      <AssistantWorkbench
        messages={messages}
        streamingText={streamingText}
        liveRoute={liveRoute}
        focusTicker={focusTicker}
        setFocusTicker={setFocusTicker}
        onNavigate={onNavigate}
        strategies={strategies}
        onCompare={onCompare}
        compareResults={compareResults}
        compareLoading={compareLoading}
      />
    </div>
  );
}

// ─── Agent request body (conversation memory for the model) ───
const MAX_AGENT_HISTORY_MESSAGES = 14;
const MAX_AGENT_PACKED_CHARS = 12000;

/**
 * The UI keeps full threads locally, but the agent HTTP API historically received only the
 * latest user string — so follow-ups like "why was it down?" looked disconnected. We send
 * (1) structured `history` for services that support multi-turn JSON, and (2) a single `message`
 * that embeds recent turns so stateless backends still see context.
 */
function packAgentRequestBody(priorMessages, newUserMsg, mode) {
  const prior = (priorMessages || []).filter(
    (m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim(),
  );
  if (!prior.length) {
    return { message: newUserMsg, history: [], _client_mode: mode };
  }

  const tail = prior.slice(-MAX_AGENT_HISTORY_MESSAGES);
  const history = tail.map((m) => ({
    role: m.role,
    content: String(m.content).slice(0, 8000),
  }));

  let convo = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');
  if (convo.length > MAX_AGENT_PACKED_CHARS) {
    convo = convo.slice(-MAX_AGENT_PACKED_CHARS);
    const firstBreak = convo.indexOf('\n\n');
    if (firstBreak > 0) convo = convo.slice(firstBreak + 2);
  }

  const message = [
    'Earlier messages in this same chat (use for continuity — tickers, numbers, and what was already said):',
    '',
    convo,
    '',
    '---',
    '',
    'Current user message:',
    newUserMsg,
  ].join('\n');

  return { message, history, _client_mode: mode };
}

// ─── Streaming fetch ───
async function streamAgent(url, body, onToken) {
  const started = performance.now();
  const controller = new AbortController();
  const timeoutMs = url.includes('/chat') ? 185000 : 110000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(localStorage.getItem('eq_token') ? { Authorization: `Bearer ${localStorage.getItem('eq_token')}` } : {}),
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).catch((err) => {
    if (err?.name === 'AbortError') {
      throw new Error(url.includes('/chat')
        ? 'Full analysis is taking too long. Try Quick mode or ask a narrower question.'
        : 'The agent is taking too long to respond. Try again in a moment.');
    }
    throw err;
  }).finally(() => clearTimeout(timeout));
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Agent unavailable' }));
    if (err?.detail && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('eq-usage-gate', { detail: err.detail }));
    }
    const msg = typeof err.detail === 'string' ? err.detail : err.detail?.message || JSON.stringify(err.detail);
    throw new Error(msg);
  }
  const data = await res.json();
  const text = data.response || '';
  const words = text.split(' ');
  let revealed = '';
  for (let i = 0; i < words.length; i++) {
    revealed += (i > 0 ? ' ' : '') + words[i];
    onToken(revealed, data.ticker || '');
    await new Promise(r => setTimeout(r, 12));
  }
  return { data, elapsedMs: Math.round(performance.now() - started) };
}

function newSession(title = 'New chat') {
  return {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    title,
    updatedAt: Date.now(),
    mode: 'quick',
    messages: [],
    lastRun: null,
  };
}

// ─── Main ───
export default function AgentPanel({
  onNavigate,
  user,
  dek,
  embedded = false,
  context = 'research',
  contextTitle = 'Assistant',
  contextInstruction = '',
  onUserMessage,
  onAssistantResult,
  panelWidth = 390,
  onPanelWidthChange,
  onPanelCollapse,
  layoutMode = 'assistant',
  setLayoutMode,
  strategies = [],
  onCompare,
  compareResults = null,
  compareLoading = false,
}) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('quick');
  const assistantAvailable = useDesktopAssistantAvailable();
  const [streamingText, setStreamingText] = useState('');
  const [liveRoute, setLiveRoute] = useState(null); // LLM workspace routing decision
  const [lastRun, setLastRun] = useState(null); // { mode, url, elapsedMs }
  const lastNavRouteRef = useRef('');
  const scrollRef = useRef(null);
  const streamTextRef = useRef('');
  const streamTickerRef = useRef('');
  const [hydrated, setHydrated] = useState(false);

  // Drive the host tabs from the agent's routing decision so asking a question
  // takes the user to the relevant page (research / chart / screener / backtest).
  useEffect(() => {
    if (!embedded || !onNavigate || !liveRoute?.tab) return;
    const ticker = (liveRoute.ticker || '').toUpperCase();
    let dest = null;
    if (liveRoute.tab === 'screener') dest = 'screener';
    else if (liveRoute.tab === 'backtest') dest = 'backtest';
    else if (liveRoute.tab === 'research') dest = liveRoute.researchSubtab === 'chart' ? 'terminal' : 'research';
    else if (ticker) dest = 'research'; // macro/news/overview that names a concrete asset
    if (!dest) return;
    const key = `${dest}|${ticker}`;
    if (lastNavRouteRef.current === key) return;
    lastNavRouteRef.current = key;
    onNavigate(dest, ticker);
  }, [embedded, onNavigate, liveRoute]);
  const resizeRef = useRef({ startX: 0, startWidth: panelWidth });
  const [resultCursor, setResultCursor] = useState(-1);

  /** Chat history drawer — default closed for a minimal, Google-like landing. */
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState([newSession('New chat')]);
  const [activeSessionId, setActiveSessionId] = useState(null);

  const activeSession = useMemo(() => {
    const s = sessions.find((x) => x.id === activeSessionId) || sessions[0];
    return s || newSession('New chat');
  }, [sessions, activeSessionId]);

  const messages = activeSession?.messages || [];
  const activeLayoutMode = embedded ? 'chat' : (assistantAvailable ? layoutMode : 'chat');

  // Load: guest = localStorage; signed-in + dek = server E2EE; signed-in + no dek = user-scoped local plaintext (still usable)
  useEffect(() => {
    let cancelled = false;
    setHydrated(false);

    const load = async () => {
      if (!user?.id) {
        try {
          const raw = localStorage.getItem(CHAT_STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          if (!cancelled && Array.isArray(parsed) && parsed.length) {
            setSessions(parsed);
            setActiveSessionId(parsed[0]?.id || null);
          } else if (!cancelled) {
            const s = newSession('New chat');
            setSessions([s]);
            setActiveSessionId(s.id);
          }
        } catch {
          if (!cancelled) {
            const s = newSession('New chat');
            setSessions([s]);
            setActiveSessionId(s.id);
          }
        }
        if (!cancelled) setHydrated(true);
        return;
      }

      if (!dek) {
        try {
          const raw = localStorage.getItem(chatPlainStorageKey(user.id));
          const parsed = raw ? JSON.parse(raw) : null;
          if (!cancelled && Array.isArray(parsed) && parsed.length) {
            setSessions(parsed.slice(0, 50));
            setActiveSessionId(parsed[0]?.id || null);
          } else {
            const guestRaw = localStorage.getItem(CHAT_STORAGE_KEY);
            const guestParsed = guestRaw ? JSON.parse(guestRaw) : null;
            if (!cancelled && Array.isArray(guestParsed) && guestParsed.length) {
              setSessions(guestParsed.slice(0, 50));
              setActiveSessionId(guestParsed[0]?.id || null);
              localStorage.removeItem(CHAT_STORAGE_KEY);
            } else if (!cancelled) {
              const s = newSession('New chat');
              setSessions([s]);
              setActiveSessionId(s.id);
            }
          }
        } catch {
          if (!cancelled) {
            const s = newSession('New chat');
            setSessions([s]);
            setActiveSessionId(s.id);
          }
        }
        if (!cancelled) setHydrated(true);
        return;
      }

      try {
        const data = await fetchAgentHistory();
        if (cancelled) return;

        let loaded = false;
        if (data?.blob) {
          try {
            const value = await decryptWithDek(dek, data.blob);
            if (Array.isArray(value) && value.length) {
              setSessions(value.slice(0, 50));
              setActiveSessionId(value[0]?.id || null);
              loaded = true;
            }
          } catch {}
        }

        if (!loaded) {
          try {
            const raw = localStorage.getItem(chatPlainStorageKey(user.id));
            const parsed = raw ? JSON.parse(raw) : null;
            if (Array.isArray(parsed) && parsed.length) {
              setSessions(parsed.slice(0, 50));
              setActiveSessionId(parsed[0]?.id || null);
              loaded = true;
            }
          } catch {}
        }

        if (!loaded) {
          try {
            const rawPlain = localStorage.getItem(CHAT_STORAGE_KEY);
            const parsedPlain = rawPlain ? JSON.parse(rawPlain) : null;
            if (Array.isArray(parsedPlain) && parsedPlain.length) {
              setSessions(parsedPlain.slice(0, 50));
              setActiveSessionId(parsedPlain[0]?.id || null);
              localStorage.removeItem(CHAT_STORAGE_KEY);
              loaded = true;
            }
          } catch {}
        }

        if (!loaded && !cancelled) {
          const s = newSession('New chat');
          setSessions([s]);
          setActiveSessionId(s.id);
        }

        try {
          localStorage.removeItem(`eq_agent_chat_sessions_enc_v1:${user.id}`);
        } catch {}
      } catch {
        if (!cancelled) {
          const s = newSession('New chat');
          setSessions([s]);
          setActiveSessionId(s.id);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [user?.id, dek]);

  // Persist: guest = localStorage; signed-in + no dek = user plain local; signed-in + dek = encrypted server
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const persist = async () => {
      const payload = sessions.slice(0, 50);
      if (!user?.id) {
        try {
          localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(payload));
        } catch {}
        return;
      }
      if (!dek) {
        try {
          localStorage.setItem(chatPlainStorageKey(user.id), JSON.stringify(payload));
        } catch {}
        return;
      }
      try {
        const blob = await encryptWithDek(dek, payload);
        if (!cancelled) await putAgentHistory(blob);
        try {
          localStorage.removeItem(chatPlainStorageKey(user.id));
        } catch {}
      } catch {}
    };
    const t = setTimeout(persist, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [sessions, user?.id, dek, hydrated]);

  // Ensure active session id
  useEffect(() => {
    if (!sessions.length) {
      const s = newSession('New chat');
      setSessions([s]);
      setActiveSessionId(s.id);
      return;
    }
    if (!activeSessionId || !sessions.some((s) => s.id === activeSessionId)) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  // Keep mode in sync with active session
  useEffect(() => {
    if (activeSession?.mode && activeSession.mode !== mode) setMode(activeSession.mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  const updateActiveSession = (patch) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? { ...s, ...patch, updatedAt: Date.now() }
          : s
      ).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    );
  };

  const createNewChat = () => {
    const s = newSession('New chat');
    setSessions((prev) => [s, ...prev]);
    setActiveSessionId(s.id);
    setInput('');
    setStreamingText('');
    setLastRun(null);
    setLiveRoute(null);
    setResultCursor(-1);
  };

  const removeSession = (sessionId) => {
    setSessions((prev) => prev.filter((x) => x.id !== sessionId));
    if (activeSessionId === sessionId) {
      setStreamingText('');
      setInput('');
      setLastRun(null);
    }
  };

  const startPanelResize = useCallback((event) => {
    if (!embedded || !onPanelWidthChange) return;
    const pointer = event.touches?.[0] || event;
    resizeRef.current = { startX: pointer.clientX, startWidth: Number(panelWidth) || 390, moved: false };

    const onMove = (moveEvent) => {
      const movePointer = moveEvent.touches?.[0] || moveEvent;
      const delta = resizeRef.current.startX - movePointer.clientX;
      if (Math.abs(delta) > 4) resizeRef.current.moved = true;
      onPanelWidthChange(resizeRef.current.startWidth + delta);
    };
    const onEnd = (endEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (!resizeRef.current.moved && onPanelCollapse) {
        onPanelCollapse();
        endEvent?.preventDefault?.();
      }
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    event.preventDefault?.();
  }, [embedded, onPanelCollapse, onPanelWidthChange, panelWidth]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamingText]);

  const discussedTickers = useMemo(() => extractSessionTickers(messages).slice(0, 12), [messages]);
  const assistantResults = useMemo(() => (
    messages
      .map((msg, index) => ({ msg, index, tickers: msg.role === 'assistant' ? [...new Set([
        ...extractTickers(msg.content),
        ...(Array.isArray(msg.tickers) ? msg.tickers.map(t => String(t).trim().toUpperCase()) : []),
        ...(msg.ticker ? [String(msg.ticker).trim().toUpperCase()] : []),
      ])].filter(Boolean) : [] }))
      .filter((item) => item.msg.role === 'assistant' && (item.msg.content || item.tickers.length))
  ), [messages]);

  useEffect(() => {
    if (!embedded || context !== 'research' || !discussedTickers.length) return;
    window.dispatchEvent(new CustomEvent('eq-research-assistant-tickers', { detail: { tickers: discussedTickers } }));
  }, [context, discussedTickers, embedded]);

  useEffect(() => {
    if (!embedded || context !== 'screener' || !discussedTickers.length) return;
    window.dispatchEvent(new CustomEvent('eq-screener-assistant-tickers', { detail: { tickers: discussedTickers } }));
  }, [context, discussedTickers, embedded]);

  useEffect(() => {
    if (!assistantResults.length) {
      setResultCursor(-1);
      return;
    }
    setResultCursor(assistantResults.length - 1);
  }, [assistantResults.length]);

  const openAssistantResult = (delta) => {
    if (!assistantResults.length) return;
    const base = resultCursor >= 0 ? resultCursor : assistantResults.length - 1;
    const nextCursor = (base + delta + assistantResults.length) % assistantResults.length;
    setResultCursor(nextCursor);
    const item = assistantResults[nextCursor];
    const ticker = item?.tickers?.[0];
    if (ticker && context === 'research') onNavigate?.('research', ticker);
    if (ticker && context === 'screener') onNavigate?.('screener', ticker);
    window.setTimeout(() => {
      const node = document.getElementById(`agent-message-${item.index}`);
      node?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }, 0);
  };

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    const effectiveMode = embedded ? 'quick' : mode;
    const agentMsg = embedded && contextInstruction
      ? `${contextInstruction}\n\nCurrent user request: ${msg}`
      : msg;
    setInput('');
    setLoading(true);
    setStreamingText('');
    streamTextRef.current = '';
    streamTickerRef.current = '';
    setLastRun(null);
    updateActiveSession({
      messages: [...messages, { role: 'user', content: msg }],
      title: activeSession.title === 'New chat' ? msg.slice(0, 40) : activeSession.title,
    });
    onUserMessage?.(msg);

    // Instant routing: switch the workspace tab before the full answer returns.
    // Clear the prior turn's route so the regex fallback covers the brief gap.
    setLiveRoute(null);
    const routeHistory = messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));
    agentRoute(msg, routeHistory).then((r) => { if (r?.tab) setLiveRoute(r); });

    try {
      const url = effectiveMode === 'full' ? '/api/agent/chat' : '/api/agent/quick';
      const body = {
        ...packAgentRequestBody(messages, agentMsg, effectiveMode),
        ui_context: context,
        conversation_id: activeSession.id,
        is_new_chat: messages.length === 0,
      };
      const { data, elapsedMs } = await streamAgent(url, body, (text, ticker) => {
        streamTextRef.current = text;
        streamTickerRef.current = ticker;
        setStreamingText(text);
      });
      setLastRun({ mode: effectiveMode, url, elapsedMs });
      // Authoritative route from the agent's full answer (overrides the instant guess).
      if (data.route?.tab) setLiveRoute(data.route);
      const nextMessages = [...messages, { role: 'user', content: msg }, { role: 'assistant', content: streamTextRef.current, ticker: streamTickerRef.current, tickers: data.tickers || [], route: data.route || null }];
      updateActiveSession({ messages: nextMessages, lastRun: { mode: effectiveMode, url, elapsedMs }, mode: effectiveMode });
      onAssistantResult?.({
        userMessage: msg,
        response: streamTextRef.current,
        ticker: streamTickerRef.current,
        tickers: data.tickers || [],
        context,
        mode: effectiveMode,
      });
    } catch (e) {
      const nextMessages = [...messages, { role: 'user', content: msg }, { role: 'assistant', content: `**Error:** ${e.message}` }];
      updateActiveSession({ messages: nextMessages, mode: effectiveMode });
    } finally {
      setLoading(false);
      setStreamingText('');
    }
  };

  const suggestions = [
    "Analyze NVDA — is it a good buy right now?",
    "What's the outlook for the S&P 500 this quarter?",
    "Which tech stocks are oversold right now?",
    "Give me a risk assessment for TSLA",
    "What sectors are showing strength this week?",
  ];

  const embeddedSuggestions = {
    research: [
      'Analyze NVDA valuation, news, and key risks',
      'What macro data matters for banks this week?',
      'Compare AAPL and MSFT for a 12-month hold',
    ],
    screener: [
      'Find profitable small caps with reasonable valuation',
      'Screen dividend stocks with low beta and strong balance sheets',
      'Show oversold tech names with improving momentum',
    ],
    backtest: [
      'Backtest RSI mean reversion on SPY for the last 5 years',
      'Compare MACD and SMA crossover for NVDA',
      'Find a lower drawdown strategy for QQQ',
    ],
  };
  const activeSuggestions = embedded ? (embeddedSuggestions[context] || embeddedSuggestions.research) : suggestions;

  const hasThread = messages.length > 0 || loading;

  const modeToggle = (
    <div className="flex gap-0.5 bg-[var(--eq-card2)] rounded-full p-0.5">
      <button
        type="button"
        onClick={() => {
          setMode('quick');
          updateActiveSession({ mode: 'quick' });
        }}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
          mode === 'quick' ? 'bg-[var(--eq-card)] text-[var(--eq-text)] shadow-sm' : 'text-[var(--eq-text3)]'
        }`}
      >
        <Zap className="w-3 h-3" /> Quick
      </button>
      <button
        type="button"
        onClick={() => {
          setMode('full');
          updateActiveSession({ mode: 'full' });
        }}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
          mode === 'full' ? 'bg-[var(--eq-card)] text-[var(--eq-text)] shadow-sm' : 'text-[var(--eq-text3)]'
        }`}
      >
        <Bot className="w-3 h-3" /> Full
      </button>
    </div>
  );

  const historyList = (
    <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
      {sessions.map((s) => {
        const active = s.id === activeSession.id;
        return (
          <div
            key={s.id}
            className={`group flex items-stretch rounded-xl transition-colors ${
              active ? 'bg-[var(--eq-card2)] ring-1 ring-[var(--eq-border)]' : 'hover:bg-[var(--eq-card2)]'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                if (loading) return;
                setActiveSessionId(s.id);
                setLastRun(s.lastRun || null);
                setStreamingText('');
                setInput('');
                setHistoryOpen(false);
              }}
              className="flex-1 min-w-0 text-left px-2.5 py-2 rounded-l-xl"
            >
              <div className="flex items-start gap-2">
                <MessageSquare className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${active ? 'text-[var(--eq-text2)]' : 'text-[var(--eq-text3)]'}`} />
                <div className="min-w-0 flex-1">
                  <div className={`text-[11px] font-medium truncate ${active ? 'text-[var(--eq-text)]' : 'text-[var(--eq-text2)]'}`}>
                    {s.title || 'New chat'}
                  </div>
                  <div className="text-[10px] text-[var(--eq-text3)] mt-0.5">
                    {(s.messages?.length || 0)} · {s.mode === 'full' ? 'Full' : 'Quick'}
                  </div>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                removeSession(s.id);
              }}
              disabled={loading}
              className="shrink-0 px-1.5 py-2 rounded-r-xl text-[var(--eq-text3)] hover:text-[var(--eq-loss)] hover:bg-[var(--eq-loss-soft)] disabled:opacity-40 disabled:pointer-events-none"
              title="Delete chat"
              aria-label={`Delete chat: ${s.title || 'New chat'}`}
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          </div>
        );
      })}
    </div>
  );

  if (embedded) {
    return (
      <aside className="relative flex flex-col min-h-[520px] xl:sticky xl:top-[74px] xl:h-[calc(100dvh-92px)] rounded-2xl bg-[var(--eq-card)]/95 ring-1 ring-[var(--eq-border)] shadow-sm overflow-hidden">
        {onPanelWidthChange && (
          <button
            type="button"
            onMouseDown={startPanelResize}
            onTouchStart={startPanelResize}
            className="hidden xl:block absolute left-0 top-0 bottom-0 z-20 w-3 cursor-col-resize group"
            aria-label="Resize or collapse assistant panel"
            title="Drag to resize · Click to collapse"
          >
            <span className="absolute left-0 top-1/2 h-16 w-1 -translate-y-1/2 rounded-full bg-[var(--eq-border2)] transition-colors group-hover:bg-[var(--eq-accent)]" />
          </button>
        )}
        {historyOpen && (
          <div className="absolute inset-0 z-30 bg-[var(--eq-card)] flex flex-col">
            <div className="flex items-center justify-between px-3 py-3 border-b border-[var(--eq-grid)]">
              <span className="text-sm font-semibold text-[var(--eq-text)]">Chats</span>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="p-2 rounded-full text-[var(--eq-text3)] hover:text-[var(--eq-text)] hover:bg-[var(--eq-card2)] transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {historyList}
          </div>
        )}

        <div className="shrink-0 px-3.5 py-3 border-b border-[var(--eq-grid)]">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-tight text-[var(--eq-text)]">{contextTitle}</div>
              <div className="text-[10px] text-[var(--eq-text3)] truncate">Context-aware research help</div>
            </div>
            <div className="flex items-center gap-1">
              {assistantResults.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => openAssistantResult(-1)}
                    className="p-2 rounded-full text-[var(--eq-text3)] hover:text-[var(--eq-text)] hover:bg-[var(--eq-card2)] transition-colors"
                    title="Previous result"
                    aria-label="Previous assistant result"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openAssistantResult(1)}
                    className="p-2 rounded-full text-[var(--eq-text3)] hover:text-[var(--eq-text)] hover:bg-[var(--eq-card2)] transition-colors"
                    title="Next result"
                    aria-label="Next assistant result"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="p-2 rounded-full text-[var(--eq-text3)] hover:text-[var(--eq-text)] hover:bg-[var(--eq-card2)] transition-colors"
                title="Chat history"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={createNewChat}
                className="p-2 rounded-full text-[var(--eq-text3)] hover:text-[var(--eq-text)] hover:bg-[var(--eq-card2)] transition-colors"
                title="New chat"
              >
                <SquarePen className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 relative">
          <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-[var(--eq-card)]/95 to-transparent z-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[var(--eq-card)]/95 to-transparent z-10 pointer-events-none" />
          <div ref={scrollRef} className="h-full overflow-y-auto px-3.5 py-3 space-y-3">
            {!hasThread && (
              <div className="pt-2 space-y-3">
                <div className="rounded-xl bg-[var(--eq-card2)] ring-1 ring-[var(--eq-border)] p-3">
                  <div className="flex items-start gap-2">
                    <Bot className="w-4 h-4 mt-0.5 text-[var(--eq-text3)]" />
                    <p className="text-xs leading-relaxed text-[var(--eq-text2)]">
                      Ask for analysis, filters, macro context, or backtest setup. I will keep the answer practical for this tab.
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {activeSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setInput(s)}
                      className="w-full text-left px-3 py-2.5 rounded-xl bg-[var(--eq-card2)] hover:bg-[var(--eq-card2)] text-[11px] leading-snug text-[var(--eq-text2)] transition-colors ring-1 ring-[var(--eq-border)]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} id={`agent-message-${i}`}>
                <Message msg={msg} onNavigate={onNavigate} compact tickerDisplay="links" />
              </div>
            ))}
            {loading && streamingText && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-lg bg-[var(--eq-card2)] flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-[var(--eq-text2)]" />
                </div>
                <div className="min-w-0 max-w-[92%] bg-[var(--eq-card2)] ring-1 ring-[var(--eq-border)] rounded-2xl px-3 py-2.5">
                  <RenderMarkdown text={streamingText} />
                </div>
              </div>
            )}
            {loading && !streamingText && (
              <div className="flex items-center gap-2 text-xs text-[var(--eq-text3)] px-2 py-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Thinking...
              </div>
            )}
            <div className="h-4" />
          </div>
        </div>

        <div className="shrink-0 p-3 border-t border-[var(--eq-grid)] bg-[var(--eq-card)]/95">
          <div className="flex items-end gap-2 rounded-2xl bg-[var(--eq-card2)] ring-1 ring-[var(--eq-border)] p-1.5">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder={`Ask ${contextTitle.toLowerCase()}...`}
              disabled={loading}
              className="flex-1 min-w-0 max-h-28 resize-none bg-transparent px-2 py-2 text-sm leading-5 text-[var(--eq-text)] focus:outline-none disabled:opacity-50 placeholder:text-[var(--eq-text3)]"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="shrink-0 p-2.5 rounded-full bg-[var(--eq-text)] text-[var(--eq-bg)] hover:opacity-85 disabled:opacity-30 transition-colors"
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          {lastRun && !loading && (
            <div className="pt-1.5 text-center text-[9px] text-[var(--eq-text3)]">
              {(lastRun.elapsedMs / 1000).toFixed(1)}s · Not financial advice
            </div>
          )}
        </div>
      </aside>
    );
  }

  if (activeLayoutMode === 'assistant') {
    return (
      <AssistantMode
        activeSession={activeSession}
        messages={messages}
        loading={loading}
        streamingText={streamingText}
        liveRoute={liveRoute}
        input={input}
        setInput={setInput}
        handleSend={handleSend}
        mode={mode}
        layoutMode={activeLayoutMode}
        setLayoutMode={setLayoutMode}
        assistantAvailable={assistantAvailable}
        onNavigate={onNavigate}
        scrollRef={scrollRef}
        suggestions={suggestions}
        historyList={historyList}
        createNewChat={createNewChat}
        strategies={strategies}
        onCompare={onCompare}
        compareResults={compareResults}
        compareLoading={compareLoading}
      />
    );
  }

  return (
    <div className="flex flex-col h-full w-full min-h-0 min-w-0 bg-[var(--eq-card2)] relative">
      {historyOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-[var(--eq-text)]/25"
            aria-label="Close chat history"
            onClick={() => setHistoryOpen(false)}
          />
          <aside className="fixed left-0 top-0 bottom-0 z-50 w-[min(100%,300px)] flex flex-col bg-[var(--eq-card)] shadow-[var(--eq-shadow-pop)] ring-1 ring-[var(--eq-border)]">
            <div className="flex items-center justify-between px-3 py-3 border-b border-[var(--eq-grid)]">
              <span className="text-sm font-semibold text-[var(--eq-text)]">Chats</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    createNewChat();
                    setHistoryOpen(false);
                  }}
                  className="p-2 rounded-full text-[var(--eq-text3)] hover:text-[var(--eq-text)] hover:bg-[var(--eq-card2)] transition-colors"
                  title="New chat"
                >
                  <SquarePen className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="p-2 rounded-full text-[var(--eq-text3)] hover:text-[var(--eq-text)] hover:bg-[var(--eq-card2)] transition-colors"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {historyList}
          </aside>
        </>
      )}

      <div className="shrink-0 flex items-center justify-between px-3 sm:px-5 py-2.5">
        <div className="flex items-center gap-2">
          <AssistantLayoutSwitch
            layoutMode={activeLayoutMode}
            setLayoutMode={setLayoutMode}
            assistantAvailable={assistantAvailable}
          />
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--eq-text2)] hover:text-[var(--eq-text)] hover:bg-[var(--eq-card2)] transition-colors"
            title="Chat history"
          >
            <PanelLeft className="w-4 h-4 text-[var(--eq-text3)]" />
            Chats
          </button>
        </div>
        {hasThread && (
          <button
            type="button"
            onClick={() => createNewChat()}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--eq-text2)] hover:bg-[var(--eq-card2)] transition-colors"
            title="New chat"
          >
            <SquarePen className="w-3.5 h-3.5" />
            New
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {!hasThread && (
          <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8 min-h-0 overflow-y-auto">
            <div className="w-full max-w-2xl mx-auto text-center">
              <h1 className="text-3xl sm:text-4xl font-normal tracking-tight text-[var(--eq-text)] mb-2">Equilima Agent</h1>
              <p className="text-sm text-[var(--eq-text3)] max-w-md mx-auto">Ask about markets, fundamentals, or ideas — research and education only.</p>
              <p className="text-xs text-[var(--eq-text3)] mt-2 max-w-lg mx-auto">Not investment advice. Not personalized financial guidance.</p>

              <div className="mt-10 w-full flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex flex-1 items-center gap-2 rounded-full bg-[var(--eq-card)] pl-5 pr-2 py-2 shadow-[var(--eq-shadow-card)] ring-1 ring-[var(--eq-border)]">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Ask anything…"
                    disabled={loading}
                    className="flex-1 min-w-0 bg-transparent border-0 text-[var(--eq-text)] text-[15px] focus:ring-0 focus:outline-none placeholder:text-[var(--eq-text3)] disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={loading || !input.trim()}
                    className="shrink-0 p-3 rounded-full bg-[var(--eq-text)] text-[var(--eq-bg)] hover:opacity-85 disabled:opacity-30 transition-colors"
                    aria-label="Send"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex justify-center shrink-0">{modeToggle}</div>
              </div>

              <div className="mt-10 w-full text-left">
                <p className="text-[11px] font-medium text-[var(--eq-text3)] mb-2">Suggestions</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setInput(s)}
                      className="text-left px-3 py-2.5 rounded-xl bg-[var(--eq-card2)] hover:bg-[var(--eq-border)] transition-colors group"
                    >
                      <div className="flex items-start gap-2.5">
                        <TrendingUp className="w-3.5 h-3.5 text-[var(--eq-text3)] group-hover:text-[var(--eq-text)] mt-0.5 shrink-0" />
                        <span className="text-[11px] text-[var(--eq-text2)] group-hover:text-[var(--eq-text)] leading-snug">{s}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {hasThread && (
          <div className="flex-1 min-h-0 relative flex flex-col">
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-b from-[var(--eq-bg)] to-transparent z-10 pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[var(--eq-bg)] to-transparent z-10 pointer-events-none" />
            <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
              <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-4 space-y-4">
                {messages.map((msg, i) => (
                  <Message key={i} msg={msg} onNavigate={onNavigate} />
                ))}
                {loading && streamingText && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[var(--eq-border)] flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-4 h-4 text-[var(--eq-text2)]" />
                    </div>
                    <div className="max-w-[92%] sm:max-w-[88%] bg-[var(--eq-card)] ring-1 ring-[var(--eq-border)] rounded-2xl px-4 py-3 shadow-sm">
                      <RenderMarkdown text={streamingText} />
                      <span className="inline-block w-1.5 h-4 bg-[var(--eq-text3)] animate-pulse ml-0.5 rounded-sm" />
                    </div>
                  </div>
                )}
                {loading && !streamingText && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[var(--eq-border)] flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-[var(--eq-text2)]" />
                    </div>
                    <div className="bg-[var(--eq-card)] ring-1 ring-[var(--eq-border)] rounded-2xl px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-2 text-xs text-[var(--eq-text3)]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--eq-text3)]" />
                        {mode === 'full' ? 'Running multi-agent analysis...' : 'Thinking...'}
                      </div>
                    </div>
                  </div>
                )}
                <div className="h-6" />
              </div>
            </div>
          </div>
        )}
      </div>

      {hasThread && (
        <div className="shrink-0 bg-[var(--eq-card2)] backdrop-blur-sm pt-2 pb-4 px-4 sm:px-6">
          <div className="max-w-4xl w-full mx-auto space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {modeToggle}
              <span className="text-[9px] text-[var(--eq-text3)]">{mode === 'quick' ? 'Fast response' : 'Deeper multi-step run'}</span>
              {lastRun && !loading && (
                <span className="text-[9px] text-[var(--eq-text3)]">
                  {lastRun.mode === 'full' ? 'Full' : 'Quick'} · {(lastRun.elapsedMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>
            <div className="flex gap-2 items-stretch">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="Message Equilima Agent…"
                disabled={loading}
                className="flex-1 bg-[var(--eq-card)] rounded-2xl px-4 py-3 text-[var(--eq-text)] text-sm shadow-sm ring-1 ring-[var(--eq-border)] focus:outline-none focus:ring-2 focus:ring-[var(--eq-border2)] disabled:opacity-50 placeholder:text-[var(--eq-text3)]"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="px-4 py-3 bg-[var(--eq-text)] hover:opacity-85 disabled:opacity-30 text-[var(--eq-bg)] rounded-2xl transition-colors shrink-0 shadow-sm"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[9px] text-[var(--eq-text3)] text-center">Powered by Gemma3 · Not financial advice</p>
          </div>
        </div>
      )}
    </div>
  );
}

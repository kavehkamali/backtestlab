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
} from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, YAxis, XAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { fetchTerminalChart, fetchResearch, fetchAgentHistory, putAgentHistory } from '../api';
import SnowflakeChart from './SnowflakeChart';
import MacroPanel from './MacroPanel';
import ScreenerPanel from './ScreenerPanel';
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
  if (n > 0) return 'text-emerald-600 dark:text-emerald-300';
  if (n < 0) return 'text-rose-600 dark:text-rose-300';
  return 'text-zinc-500 dark:text-zinc-400';
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

// ─── Markdown renderer ───
function inlineFormat(text) {
  if (!text) return '';
  return text
    .replace(/`([^`]+)`/g, '<code class="bg-zinc-100 px-1 rounded text-indigo-700 text-[12px]">$1</code>')
    .replace(/\*{3}([^*]+)\*{3}/g, '<strong class="text-zinc-900 font-semibold"><em>$1</em></strong>')
    .replace(/\*{2}([^*]+)\*{2}/g, '<strong class="text-zinc-900 font-semibold">$1</strong>')
    .replace(/__([^_]+)__/g, '<strong class="text-zinc-900 font-semibold">$1</strong>')
    .replace(/(?<![<\w])\*([^*]+)\*(?![>\w])/g, '<em class="text-zinc-600">$1</em>')
    .replace(/(?<![<\w])_([^_]+)_(?![>\w])/g, '<em class="text-zinc-600">$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="break-all text-indigo-600 hover:underline">$1</a>');
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
          <div key={i} className="my-3 overflow-x-auto rounded-xl bg-zinc-50 ring-1 ring-zinc-200/60 dark:bg-zinc-900 dark:ring-zinc-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200/80 bg-white">
                  {table.headers.map((h, j) => (
                    <th key={j} className="text-left py-2 px-3 text-zinc-500 font-semibold whitespace-nowrap"
                      dangerouslySetInnerHTML={{ __html: inlineFormat(h) }} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.body.map((row, ri) => (
                  <tr key={ri} className="border-b border-zinc-100 hover:bg-white">
                    {row.map((cell, ci) => {
                      const numMatch = cell.match(/^([+-]?\d+\.?\d*)\s*%?$/);
                      const isPositive = numMatch && parseFloat(numMatch[1]) > 0;
                      const isNegative = numMatch && parseFloat(numMatch[1]) < 0;
                      const color = isPositive ? 'text-emerald-600' : isNegative ? 'text-red-600' : 'text-zinc-600';
                      return (
                        <td key={ci} className={`py-1.5 px-3 whitespace-nowrap ${ci === 0 ? 'text-zinc-900 font-medium' : color}`}
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
    if (trimmed.startsWith('#### ')) { elements.push(<h4 key={i} className="text-sm font-bold text-zinc-900 mt-2 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(5)) }} />); i++; continue; }
    if (trimmed.startsWith('### ')) { elements.push(<h3 key={i} className="text-base font-bold text-zinc-900 mt-3 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(4)) }} />); i++; continue; }
    if (trimmed.startsWith('## ')) { elements.push(<h2 key={i} className="text-lg font-bold text-zinc-900 mt-3 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(3)) }} />); i++; continue; }
    if (trimmed.startsWith('# ')) { elements.push(<h1 key={i} className="text-xl font-bold text-zinc-900 mt-3 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(2)) }} />); i++; continue; }
    if (/^([-]{3,}|[*]{3,}|[_]{3,})\s*$/.test(trimmed) && !/[a-zA-Z]/.test(trimmed)) { elements.push(<hr key={i} className="border-zinc-200 my-2" />); i++; continue; }
    // Unordered list
    if (/^[-*+]\s/.test(trimmed)) {
      elements.push(
          <div key={i} className="ml-2 my-1 flex min-w-0 gap-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          <span className="text-indigo-500 mt-0.5 shrink-0">•</span>
          <span className="min-w-0 break-words" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.replace(/^[-*+]\s/, '')) }} />
        </div>
      );
      i++; continue;
    }
    // Numbered list
    if (/^\d+\.\s/.test(trimmed)) {
      const num = trimmed.match(/^(\d+)\./)[1];
      elements.push(
        <div key={i} className="ml-2 my-1 flex min-w-0 gap-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          <span className="text-indigo-500 mt-0.5 shrink-0 w-4 text-right">{num}.</span>
          <span className="min-w-0 break-words" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.replace(/^\d+\.\s/, '')) }} />
        </div>
      );
      i++; continue;
    }
    // Blockquote
    if (trimmed.startsWith('> ')) {
      elements.push(<div key={i} className="border-l-2 border-indigo-200 pl-3 my-1 text-sm text-zinc-500 italic leading-relaxed" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(2)) }} />);
      i++; continue;
    }
    // Empty line
    if (trimmed === '') { elements.push(<div key={i} className="h-2" />); i++; continue; }
    // Regular paragraph
    elements.push(<p key={i} className="my-1.5 min-w-0 break-words text-sm leading-relaxed text-zinc-600 dark:text-zinc-300" dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />);
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
    <div className="bg-zinc-50 rounded-xl p-3 mt-3 ring-1 ring-zinc-200/70 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-sm font-bold text-zinc-900">{ticker}</span>
          {s.name && <span className="text-[10px] text-zinc-500 ml-2">{s.name}</span>}
        </div>
        <div className="text-right">
          <span className="text-sm font-bold text-zinc-900">${last.toFixed(2)}</span>
          <span className={`text-[10px] ml-1 ${up ? 'text-emerald-600' : 'text-red-600'}`}>{up ? '+' : ''}{changePct}%</span>
        </div>
      </div>

      {s.pe_trailing && (
        <div className="flex gap-3 mb-2 text-[10px] flex-wrap">
          {s.market_cap_fmt && <span className="text-zinc-500">MCap <span className="text-zinc-800">{s.market_cap_fmt}</span></span>}
          {s.pe_trailing && <span className="text-zinc-500">P/E <span className="text-zinc-800">{s.pe_trailing.toFixed(1)}</span></span>}
          {s.dividend_yield_pct && <span className="text-zinc-500">Div <span className="text-zinc-800">{s.dividend_yield_pct}%</span></span>}
          {s.eps_trailing && <span className="text-zinc-500">EPS <span className="text-zinc-800">${s.eps_trailing.toFixed(2)}</span></span>}
        </div>
      )}

      {/* Charts row */}
      <div className="flex gap-3">
        {/* Price chart */}
        <div className="flex-1 min-w-0">
          <div className="text-[9px] text-zinc-500 mb-1">6M Price</div>
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
            <div className="text-[9px] text-zinc-500 mb-1">Monthly</div>
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
            <div className="text-[9px] text-zinc-500 mb-1 text-center">Quality</div>
            <SnowflakeChart data={sf} size={55} mini />
          </div>
        )}
      </div>

      {/* Performance badges */}
      {Object.keys(perf).length > 0 && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {Object.entries(perf).map(([k, v]) => (
            <span key={k} className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${v >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {k}: {v > 0 ? '+' : ''}{v}%
            </span>
          ))}
        </div>
      )}

      {/* Navigation links */}
      <div className="flex gap-2 mt-2 pt-2 border-t border-zinc-200/80">
        <button onClick={() => onNavigate('research', ticker)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-indigo-600 hover:bg-indigo-50 transition-colors">
          <FileText className="w-3 h-3" /> Full Research
        </button>
        <button onClick={() => onNavigate('terminal', ticker)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-indigo-600 hover:bg-indigo-50 transition-colors">
          <BarChart3 className="w-3 h-3" /> Chart
        </button>
        <button onClick={() => onNavigate('screener', ticker)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-indigo-600 hover:bg-indigo-50 transition-colors">
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
    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-zinc-200/70 pt-2 dark:border-zinc-800">
      {tickers.map((ticker) => (
        <button
          type="button"
          key={ticker}
          onClick={() => onNavigate?.('research', ticker)}
          className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-100 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-200 dark:ring-indigo-900"
        >
          {ticker} research
        </button>
      ))}
    </div>
  );

  return (
    <div className={`flex min-w-0 gap-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-indigo-600" />
        </div>
      )}
      <div
        className={`min-w-0 max-w-[92%] overflow-hidden rounded-2xl px-4 py-3 sm:max-w-[88%] ${isUser ? 'bg-indigo-600 text-white dark:bg-zinc-700 dark:text-zinc-100' : 'bg-white shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-700'}`}
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
        <div className="w-7 h-7 rounded-lg bg-zinc-200 flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-4 h-4 text-zinc-600" />
        </div>
      )}
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
  modeToggle,
  lastRun,
  onNavigate,
  scrollRef,
  suggestions,
  historyList,
  createNewChat,
}) {
  const hasThread = messages.length > 0 || loading;
  const [historyExpanded, setHistoryExpanded] = useState(false);
  return (
    <section className="flex h-full min-h-0 w-[420px] min-w-[380px] max-w-[500px] shrink-0 flex-col overflow-hidden border-r border-zinc-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="shrink-0 border-b border-zinc-200/70 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">AI chat</div>
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
              {mode === 'full' ? 'Deep agent run' : 'Fast agent run'}{lastRun ? ` · ${(lastRun.elapsedMs / 1000).toFixed(1)}s` : ''}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={createNewChat}
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-200 hover:text-zinc-950 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
            >
              <SquarePen className="h-3.5 w-3.5" /> New
            </button>
            <button
              type="button"
              onClick={() => setHistoryExpanded((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-200 hover:text-zinc-950 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
            >
              <MessageSquare className="h-3.5 w-3.5" /> History
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${historyExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 truncate text-[10px] text-zinc-400 dark:text-zinc-500">
            {activeSession?.title && activeSession.title !== 'New chat' ? activeSession.title : 'Current conversation'}
          </div>
          <div className="flex items-center gap-2">
            {modeToggle}
          </div>
        </div>
      </div>
      <div className="shrink-0 border-b border-zinc-200/70 bg-white/95 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask the agent, then adjust charts and screeners…"
            disabled={loading}
            className="min-w-0 flex-1 rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-900 shadow-sm ring-1 ring-zinc-200/70 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300/80 disabled:opacity-50 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="shrink-0 rounded-2xl bg-zinc-900 px-4 py-3 text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-center text-[9px] text-zinc-400 dark:text-zinc-500">Research workspace · Not financial advice</p>
      </div>
      {historyExpanded && (
        <div className="flex max-h-52 shrink-0 overflow-hidden border-b border-zinc-200/70 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/70">
          {historyList}
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-10 bg-gradient-to-b from-white to-transparent dark:from-zinc-950" />
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-14 bg-gradient-to-t from-white to-transparent dark:from-zinc-950" />
        <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-4">
          {!hasThread && (
            <div className="flex min-h-full flex-col justify-center">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">Ask, then work the data.</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">The workspace updates from tickers and themes mentioned by the agent.</p>
              <div className="mt-5 grid gap-2">
                {suggestions.slice(0, 4).map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setInput(s)}
                    className="rounded-xl bg-zinc-50 px-3 py-2.5 text-left text-xs text-zinc-600 ring-1 ring-zinc-200/70 hover:bg-zinc-100 hover:text-zinc-950 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800 dark:hover:bg-zinc-800"
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
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-200 dark:bg-zinc-800">
                    <Bot className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
                  </div>
                  <div className="min-w-0 max-w-[92%] overflow-hidden rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-700" style={{ overflowWrap: 'anywhere' }}>
                    <RenderMarkdown text={streamingText} />
                    <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-zinc-400 dark:bg-zinc-500" />
                  </div>
                </div>
              )}
              {loading && !streamingText && (
                <div className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-200 dark:bg-zinc-800">
                    <Bot className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-700">
                    <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
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
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
        <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl bg-zinc-50 px-6 text-center ring-1 ring-zinc-100 dark:bg-zinc-950 dark:ring-zinc-800">
          <FileText className="mb-3 h-6 w-6 text-zinc-300 dark:text-zinc-600" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Research context</h3>
          <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500 dark:text-zinc-400">
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
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-400">Research context</div>
          <h3 className="mt-0.5 text-xl font-semibold text-zinc-950 dark:text-zinc-100">{ticker}</h3>
          <p className="mt-0.5 max-w-md truncate text-xs text-zinc-500 dark:text-zinc-400">{summary.name || 'Research snapshot'}</p>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold text-zinc-950 dark:text-zinc-100">{summary.price != null ? `$${summary.price}` : (last ? `$${last.toFixed(2)}` : '—')}</div>
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
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-zinc-100 dark:text-zinc-800" />
              <XAxis dataKey={chartDateKey} minTickGap={28} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-zinc-400" />
              <YAxis domain={['auto', 'auto']} width={48} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-zinc-400" />
              <Tooltip />
              <Area type="monotone" dataKey="close" stroke={up ? '#10b981' : '#f43f5e'} fill={`url(#assistant_focus_${ticker})`} strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : loading ? (
          <div className="flex h-full items-center justify-center rounded-xl bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-950">Loading chart…</div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-950">No chart data</div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ['Market cap', summary.market_cap_fmt || fmtCompact(summary.market_cap)],
          ['P/E', summary.pe_trailing != null ? Number(summary.pe_trailing).toFixed(1) : '—'],
          ['Forward P/E', summary.pe_forward != null ? Number(summary.pe_forward).toFixed(1) : '—'],
          ['Consensus', summary.recommendation || '—'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100 dark:bg-zinc-950 dark:ring-zinc-800">
            <div className="text-[10px] text-zinc-400">{label}</div>
            <div className="mt-0.5 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => onNavigate?.('research', ticker)} className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-200">
          Full research
        </button>
        <button type="button" onClick={() => onNavigate?.('terminal', ticker)} className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200">
          Full chart
        </button>
      </div>
    </div>
  );
}

function ScreenerMiniTable({ rows, onTickerSelect, onNavigate }) {
  if (!rows?.length) return <div className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-500 dark:bg-zinc-950">No screener rows match.</div>;
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-400 dark:bg-zinc-950">
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
              <tr key={row.symbol} className="border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/70">
                <td className="px-3 py-2">
                  <button type="button" onClick={() => onTickerSelect?.(row.symbol)} className="font-semibold text-indigo-700 hover:underline dark:text-indigo-300">{row.symbol}</button>
                  <div className="max-w-[180px] truncate text-[10px] text-zinc-400">{row.name}</div>
                </td>
                <td className="px-3 py-2 text-right font-semibold text-zinc-800 dark:text-zinc-100">{row.buy_count}/{row.total_strategies}</td>
                <td className={`px-3 py-2 text-right font-mono ${toneClass(row.change_20d)}`}>{fmtPctValue(row.change_20d)}</td>
                <td className="px-3 py-2 text-right font-mono text-zinc-600 dark:text-zinc-300">{row.rsi ?? '—'}</td>
                <td className="px-3 py-2 text-right font-mono text-zinc-600 dark:text-zinc-300">{row.pe_ratio != null ? Number(row.pe_ratio).toFixed(1) : '—'}</td>
                <td className="px-3 py-2 text-right text-zinc-500">{fmtCompact(row.market_cap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <button type="button" onClick={() => onNavigate?.('screener')} className="text-[11px] font-semibold text-indigo-700 hover:underline dark:text-indigo-300">Open full screener</button>
      </div>
    </div>
  );
}

function MacroMiniPanel({ macro }) {
  const chart = (macro?.charts || []).find((c) => c.id === 'rates_jobs') || (macro?.charts || [])[0];
  const rows = mergeMacroSeries(chart).slice(-180);
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Macro regime</h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{macro?.analysis?.cached ? "Today's cached agent view" : 'Fresh macro view'}</p>
        </div>
        <Brain className="h-4 w-4 text-indigo-500" />
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {(macro?.signals || []).slice(0, 4).map((item) => {
          const short = String(item.short_term || 'Hold').toLowerCase();
          return (
            <div key={item.asset} className={`rounded-lg px-3 py-2 ring-1 ${
              short === 'buy' ? 'bg-emerald-50 text-emerald-900 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-900'
              : short === 'sell' ? 'bg-rose-50 text-rose-900 ring-rose-100 dark:bg-rose-950/40 dark:text-rose-100 dark:ring-rose-900'
              : 'bg-amber-50 text-amber-900 ring-amber-100 dark:bg-amber-950/35 dark:text-amber-100 dark:ring-amber-900'
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
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-zinc-100 dark:text-zinc-800" />
              <XAxis dataKey="date" minTickGap={28} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-zinc-400" />
              <YAxis width={42} tick={{ fontSize: 10, fill: 'currentColor' }} className="text-zinc-400" />
              <Tooltip />
              {(chart.series || []).slice(0, 3).map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-950">Loading macro chart…</div>
        )}
      </div>
    </div>
  );
}

function AssistantWorkbench({
  messages,
  streamingText,
  focusTicker,
  setFocusTicker,
  onNavigate,
  strategies,
  onCompare,
  compareResults,
  compareLoading,
}) {
  const discussedTickers = useMemo(() => extractSessionTickers(messages), [messages]);
  const latestAssistant = useMemo(() => {
    const found = [...(messages || [])].reverse().find((m) => m.role === 'assistant' && String(m.content || '').trim());
    return streamingText || found?.content || '';
  }, [messages, streamingText]);

  const [tab, setTab] = useState('overview');
  const [research, setResearch] = useState(null);
  const [chart, setChart] = useState([]);
  const [researchLoading, setResearchLoading] = useState(false);
  const [news, setNews] = useState(null);
  const [macro, setMacro] = useState(null);
  const [screenRows, setScreenRows] = useState([]);

  useEffect(() => {
    if (!focusTicker) return;
    let cancelled = false;
    setResearchLoading(true);
    Promise.all([
      assistantFetchResearch(focusTicker).catch(() => null),
      assistantFetchNews(focusTicker).catch(() => null),
    ]).then(([r, n]) => {
      if (cancelled) return;
      setResearch(r);
      setChart(Array.isArray(r?.chart) ? r.chart : []);
      setNews(n);
    }).finally(() => {
      if (!cancelled) setResearchLoading(false);
    });
    return () => { cancelled = true; };
  }, [focusTicker]);

  useEffect(() => {
    assistantFetchMacroOverview().then(setMacro).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    assistantRunScreener({ list_id: 'sp500', strategies: AGENT_ASSISTANT_STRATEGIES })
      .then((d) => {
        if (!cancelled) setScreenRows(d?.results || []);
      })
      .catch(() => {
        if (!cancelled) setScreenRows([]);
      });
    return () => { cancelled = true; };
  }, []);

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
      window.dispatchEvent(new CustomEvent('eq-research-subtab', { detail: { sub: 'fundamentals' } }));
    }, 0);
  }, [tab, focusTicker]);

  const visibleScreenRows = useMemo(() => {
    return (screenRows || [])
      .filter((row) => (row.buy_count || 0) >= 3)
      .sort((a, b) => (b.buy_count || 0) - (a.buy_count || 0) || (b.change_20d || 0) - (a.change_20d || 0))
      .slice(0, 25);
  }, [screenRows]);

  const openWorkspaceResearch = (ticker) => {
    const symbol = ticker ? String(ticker).trim().toUpperCase() : '';
    if (!symbol) return;
    setFocusTicker(symbol);
    setTab('research');
  };

  return (
    <section className="min-w-0 flex-1 overflow-y-auto bg-zinc-50 p-4 dark:bg-zinc-950">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">Assistant workspace</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Work with research, screener, macro, and news without leaving the agent.</p>
        </div>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
        {WORKSPACE_TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                tab === item.id
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {item.label}
            </button>
          );
        })}
      </div>

      {discussedTickers.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {discussedTickers.map((ticker) => (
            <button
              type="button"
              key={ticker}
              onClick={() => openWorkspaceResearch(ticker)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ring-1 ${
                focusTicker === ticker
                  ? 'bg-indigo-50 text-indigo-700 ring-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-200 dark:ring-indigo-900'
                  : 'bg-white text-zinc-500 ring-zinc-200 hover:text-zinc-900 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-800 dark:hover:text-zinc-100'
              }`}
            >
              {ticker}
            </button>
          ))}
        </div>
      )}

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1.1fr_.9fr]">
          <ResearchSnapshot ticker={focusTicker} research={research} chart={chart} loading={researchLoading} onNavigate={onNavigate} />
          <div className="space-y-4">
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                <Bot className="h-4 w-4 text-indigo-500" /> Latest agent result
              </div>
              {latestAssistant ? (
                <div className="max-h-72 overflow-y-auto pr-1">
                  <RenderMarkdown text={latestAssistant} />
                </div>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Ask the agent. Tickers and themes will populate this workspace.</p>
              )}
            </div>
            <MacroMiniPanel macro={macro} />
          </div>
          <div className="2xl:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Screener shortlist</h3>
              <span className="text-[11px] text-zinc-400">{visibleScreenRows.length} matches</span>
            </div>
            <ScreenerMiniTable rows={visibleScreenRows.slice(0, 8)} onTickerSelect={openWorkspaceResearch} onNavigate={onNavigate} />
          </div>
        </div>
      )}

      {tab === 'research' && (
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
          <ResearchPanel
            strategies={strategies}
            onCompare={onCompare}
            compareResults={compareResults}
            compareLoading={compareLoading}
          />
        </div>
      )}

      {tab === 'screener' && (
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
          <ScreenerPanel onOpenResearch={openWorkspaceResearch} />
        </div>
      )}

      {tab === 'macro' && (
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
          <MacroPanel />
        </div>
      )}

      {tab === 'news' && (
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">News for {focusTicker}</h3>
            <button type="button" onClick={() => onNavigate?.('research', focusTicker)} className="text-[11px] font-semibold text-indigo-700 hover:underline dark:text-indigo-300">Research page</button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {((news?.articles || news?.news || news || [])).slice?.(0, 12)?.map((item, idx) => (
              <a
                key={`${item.title}-${idx}`}
                href={item.url || undefined}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-100 hover:bg-zinc-100 dark:bg-zinc-950 dark:ring-zinc-800 dark:hover:bg-zinc-800"
              >
                <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{item.source || item.publisher || item.symbol || focusTicker}</div>
                <div className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100">{item.title}</div>
              </a>
            )) || <p className="text-sm text-zinc-500">No news loaded.</p>}
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
  input,
  setInput,
  handleSend,
  mode,
  modeToggle,
  lastRun,
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
    <div className="grid h-[calc(100dvh-57px)] max-h-[calc(100dvh-57px)] min-h-0 w-full grid-cols-[420px_minmax(0,1fr)] overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <AssistantChatColumn
        activeSession={activeSession}
        messages={messages}
        loading={loading}
        streamingText={streamingText}
        input={input}
        setInput={setInput}
        handleSend={handleSend}
        mode={mode}
        modeToggle={modeToggle}
        lastRun={lastRun}
        onNavigate={onNavigate}
        scrollRef={scrollRef}
        suggestions={suggestions}
        historyList={historyList}
        createNewChat={createNewChat}
      />
      <AssistantWorkbench
        messages={messages}
        streamingText={streamingText}
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
  const timeoutMs = url.includes('/chat') ? 185000 : 70000;
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
  layoutMode = 'assistant',
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
  const [lastRun, setLastRun] = useState(null); // { mode, url, elapsedMs }
  const scrollRef = useRef(null);
  const streamTextRef = useRef('');
  const streamTickerRef = useRef('');
  const [hydrated, setHydrated] = useState(false);

  /** Chat history drawer — default closed for a minimal, Google-like landing. */
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState([newSession('New chat')]);
  const [activeSessionId, setActiveSessionId] = useState(null);

  const activeSession = useMemo(() => {
    const s = sessions.find((x) => x.id === activeSessionId) || sessions[0];
    return s || newSession('New chat');
  }, [sessions, activeSessionId]);

  const messages = activeSession?.messages || [];
  const activeLayoutMode = assistantAvailable ? layoutMode : 'chat';

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
  };

  const removeSession = (sessionId) => {
    setSessions((prev) => prev.filter((x) => x.id !== sessionId));
    if (activeSessionId === sessionId) {
      setStreamingText('');
      setInput('');
      setLastRun(null);
    }
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamingText]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
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

    try {
      const url = mode === 'full' ? '/api/agent/chat' : '/api/agent/quick';
      const body = {
        ...packAgentRequestBody(messages, msg, mode),
        conversation_id: activeSession.id,
        is_new_chat: messages.length === 0,
      };
      const { data, elapsedMs } = await streamAgent(url, body, (text, ticker) => {
        streamTextRef.current = text;
        streamTickerRef.current = ticker;
        setStreamingText(text);
      });
      setLastRun({ mode, url, elapsedMs });
      const nextMessages = [...messages, { role: 'user', content: msg }, { role: 'assistant', content: streamTextRef.current, ticker: streamTickerRef.current, tickers: data.tickers || [] }];
      updateActiveSession({ messages: nextMessages, lastRun: { mode, url, elapsedMs }, mode });
    } catch (e) {
      const nextMessages = [...messages, { role: 'user', content: msg }, { role: 'assistant', content: `**Error:** ${e.message}` }];
      updateActiveSession({ messages: nextMessages, mode });
    } finally {
      setLoading(false);
      setStreamingText('');
    }
  };

  const suggestions = [
    "Analyze NVDA — is it a good buy right now?",
    "What's the outlook for the S&P 500 this quarter?",
    "Compare AAPL vs MSFT for long-term investment",
    "Which tech stocks are oversold right now?",
    "Give me a risk assessment for TSLA",
    "What sectors are showing strength this week?",
  ];

  const hasThread = messages.length > 0 || loading;

  const modeToggle = (
    <div className="flex gap-0.5 bg-zinc-100 rounded-full p-0.5 dark:bg-zinc-800/80">
      <button
        type="button"
        onClick={() => {
          setMode('quick');
          updateActiveSession({ mode: 'quick' });
        }}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
          mode === 'quick' ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'
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
          mode === 'full' ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'
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
              active ? 'bg-zinc-100 ring-1 ring-zinc-200/80 dark:bg-zinc-800 dark:ring-zinc-600' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
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
                <MessageSquare className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${active ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-400'}`} />
                <div className="min-w-0 flex-1">
                  <div className={`text-[11px] font-medium truncate ${active ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'}`}>
                    {s.title || 'New chat'}
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5 dark:text-zinc-500">
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
              className="shrink-0 px-1.5 py-2 rounded-r-xl text-zinc-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:pointer-events-none dark:hover:bg-red-950/30"
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

  if (activeLayoutMode === 'assistant') {
    return (
      <AssistantMode
        activeSession={activeSession}
        messages={messages}
        loading={loading}
        streamingText={streamingText}
        input={input}
        setInput={setInput}
        handleSend={handleSend}
        mode={mode}
        modeToggle={modeToggle}
        lastRun={lastRun}
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
    <div className="flex flex-col h-full w-full min-h-0 min-w-0 bg-zinc-50 relative dark:bg-zinc-950">
      {historyOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-zinc-900/25 dark:bg-black/50"
            aria-label="Close chat history"
            onClick={() => setHistoryOpen(false)}
          />
          <aside className="fixed left-0 top-0 bottom-0 z-50 w-[min(100%,300px)] flex flex-col bg-white shadow-xl shadow-zinc-900/10 ring-1 ring-zinc-200/60 dark:bg-zinc-900 dark:ring-zinc-700 dark:shadow-black/30">
            <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Chats</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    createNewChat();
                    setHistoryOpen(false);
                  }}
                  className="p-2 rounded-full text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  title="New chat"
                >
                  <SquarePen className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="p-2 rounded-full text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
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
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/80 transition-colors dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/80"
            title="Chat history"
          >
            <PanelLeft className="w-4 h-4 text-zinc-500" />
            Chats
          </button>
        </div>
        {hasThread && (
          <button
            type="button"
            onClick={() => createNewChat()}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 transition-colors dark:text-zinc-300 dark:hover:bg-zinc-800/80"
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
              <h1 className="text-3xl sm:text-4xl font-normal tracking-tight text-zinc-900 mb-2 dark:text-zinc-100">Equilima Agent</h1>
              <p className="text-sm text-zinc-500 max-w-md mx-auto dark:text-zinc-400">Ask about markets, fundamentals, or ideas — research and education only.</p>
              <p className="text-xs text-zinc-400 mt-2 max-w-lg mx-auto dark:text-zinc-500">Not investment advice. Not personalized financial guidance.</p>

              <div className="mt-10 w-full flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex flex-1 items-center gap-2 rounded-full bg-white pl-5 pr-2 py-2 shadow-md shadow-zinc-900/5 ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-700 dark:shadow-black/20">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Ask anything…"
                    disabled={loading}
                    className="flex-1 min-w-0 bg-transparent border-0 text-zinc-900 text-[15px] focus:ring-0 focus:outline-none placeholder:text-zinc-400 disabled:opacity-50 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={loading || !input.trim()}
                    className="shrink-0 p-3 rounded-full bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-30 transition-colors dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    aria-label="Send"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex justify-center shrink-0">{modeToggle}</div>
              </div>

              <div className="mt-10 w-full text-left">
                <p className="text-[11px] font-medium text-zinc-400 mb-2 dark:text-zinc-500">Suggestions</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setInput(s)}
                      className="text-left px-3 py-2.5 rounded-xl bg-zinc-100/80 hover:bg-zinc-200/80 transition-colors group dark:bg-zinc-900/80 dark:hover:bg-zinc-800"
                    >
                      <div className="flex items-start gap-2.5">
                        <TrendingUp className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-700 mt-0.5 shrink-0 dark:group-hover:text-zinc-200" />
                        <span className="text-[11px] text-zinc-600 group-hover:text-zinc-900 leading-snug dark:text-zinc-400 dark:group-hover:text-zinc-100">{s}</span>
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
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-b from-zinc-50 to-transparent z-10 pointer-events-none dark:from-zinc-950" />
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-zinc-50 to-transparent z-10 pointer-events-none dark:from-zinc-950" />
            <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
              <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-4 space-y-4">
                {messages.map((msg, i) => (
                  <Message key={i} msg={msg} onNavigate={onNavigate} />
                ))}
                {loading && streamingText && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg bg-zinc-200 flex items-center justify-center shrink-0 mt-0.5 dark:bg-zinc-800">
                      <Bot className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
                    </div>
                    <div className="max-w-[92%] sm:max-w-[88%] bg-white ring-1 ring-zinc-200/70 rounded-2xl px-4 py-3 shadow-sm dark:bg-zinc-900 dark:ring-zinc-700">
                      <RenderMarkdown text={streamingText} />
                      <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse ml-0.5 rounded-sm dark:bg-zinc-500" />
                    </div>
                  </div>
                )}
                {loading && !streamingText && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg bg-zinc-200 flex items-center justify-center shrink-0 dark:bg-zinc-800">
                      <Bot className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
                    </div>
                    <div className="bg-white ring-1 ring-zinc-200/70 rounded-2xl px-4 py-3 shadow-sm dark:bg-zinc-900 dark:ring-zinc-700">
                      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500 dark:text-zinc-400" />
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
        <div className="shrink-0 bg-zinc-50/95 backdrop-blur-sm pt-2 pb-4 px-4 sm:px-6 dark:bg-zinc-950/95">
          <div className="max-w-4xl w-full mx-auto space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {modeToggle}
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500">{mode === 'quick' ? 'Fast response' : 'Deeper multi-step run'}</span>
              {lastRun && !loading && (
                <span className="text-[9px] text-zinc-400 dark:text-zinc-500">
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
                className="flex-1 bg-white rounded-2xl px-4 py-3 text-zinc-900 text-sm shadow-sm ring-1 ring-zinc-200/70 focus:outline-none focus:ring-2 focus:ring-zinc-300/80 disabled:opacity-50 placeholder:text-zinc-400 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:focus:ring-zinc-600/80"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="px-4 py-3 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 text-white rounded-2xl transition-colors shrink-0 shadow-sm dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[9px] text-zinc-400 text-center dark:text-zinc-500">Powered by Gemma3 · Not financial advice</p>
          </div>
        </div>
      )}
    </div>
  );
}

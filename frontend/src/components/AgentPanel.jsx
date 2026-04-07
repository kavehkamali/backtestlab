import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
  TrendingUp,
  Zap,
  BarChart3,
  Search,
  FileText,
  Trash2,
  PanelLeft,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Lock,
  LayoutDashboard,
  CandlestickChart,
  Scale,
  Coins,
} from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, YAxis, XAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { agentHealth, fetchTerminalChart, fetchResearch, fetchAgentHistory, putAgentHistory } from '../api';
import SnowflakeChart from './SnowflakeChart';
import { decryptWithDek, encryptWithDek } from '../e2ee';

const CHAT_STORAGE_KEY = 'eq_agent_chat_sessions_v1';

/** Cross-links to other app tabs — minimal cards on the empty state */
const EXPLORE_TABS = [
  { id: 'research', label: 'Research', hint: 'Fundamentals', Icon: FileText },
  { id: 'markets', label: 'Market overview', hint: 'Indices & breadth', Icon: LayoutDashboard },
  { id: 'screener', label: 'Screener', hint: 'Filter & rank', Icon: Search },
  { id: 'crypto', label: 'Crypto', hint: 'Digital assets', Icon: Coins },
  { id: 'terminal', label: 'Terminal', hint: 'Charts & TA', Icon: CandlestickChart },
  { id: 'backtest', label: 'Backtest', hint: 'Test strategies', Icon: Scale },
];

// ─── Known tickers for detection ───
const KNOWN_TICKERS = new Set(['AAPL','MSFT','GOOGL','GOOG','AMZN','NVDA','TSLA','META','JPM','V','WMT','UNH','JNJ','XOM','PG','MA','HD','CVX','MRK','ABBV','LLY','PEP','KO','COST','AVGO','MCD','CSCO','TMO','ABT','ACN','AMD','INTC','QCOM','CRM','ADBE','NFLX','DIS','BA','GE','CAT','GS','BLK','PYPL','SQ','COIN','SHOP','SNAP','UBER','ABNB','RIVN','PLTR','SOFI','NET','CRWD','DDOG','ZS','BTC','ETH','SOL','SPY','QQQ']);

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
  return [...found].slice(0, 3); // max 3 tickers
}

// ─── Markdown renderer ───
function inlineFormat(text) {
  if (!text) return '';
  return text
    // Code first (protect from other replacements)
    .replace(/`([^`]+)`/g, '<code class="bg-white/5 px-1 rounded text-indigo-300 text-[10px]">$1</code>')
    // Bold+italic
    .replace(/\*{3}([^*]+)\*{3}/g, '<strong class="text-white font-semibold"><em>$1</em></strong>')
    // Bold (both ** and __)
    .replace(/\*{2}([^*]+)\*{2}/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/__([^_]+)__/g, '<strong class="text-white font-semibold">$1</strong>')
    // Italic (single * or _) — but not inside URLs or already-processed HTML
    .replace(/(?<![<\w])\*([^*]+)\*(?![>\w])/g, '<em class="text-gray-200">$1</em>')
    .replace(/(?<![<\w])_([^_]+)_(?![>\w])/g, '<em class="text-gray-200">$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-indigo-400 hover:underline">$1</a>');
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
          <div key={i} className="overflow-x-auto my-3 rounded-lg border border-white/5">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.03]">
                  {table.headers.map((h, j) => (
                    <th key={j} className="text-left py-2 px-3 text-gray-400 font-semibold whitespace-nowrap"
                      dangerouslySetInnerHTML={{ __html: inlineFormat(h) }} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.body.map((row, ri) => (
                  <tr key={ri} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    {row.map((cell, ci) => {
                      // Color numbers green/red
                      const numMatch = cell.match(/^([+-]?\d+\.?\d*)\s*%?$/);
                      const isPositive = numMatch && parseFloat(numMatch[1]) > 0;
                      const isNegative = numMatch && parseFloat(numMatch[1]) < 0;
                      const color = isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-gray-300';
                      return (
                        <td key={ci} className={`py-1.5 px-3 whitespace-nowrap ${ci === 0 ? 'text-white font-medium' : color}`}
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
    if (trimmed.startsWith('#### ')) { elements.push(<h4 key={i} className="text-xs font-bold text-white mt-2 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(5)) }} />); i++; continue; }
    if (trimmed.startsWith('### ')) { elements.push(<h3 key={i} className="text-sm font-bold text-white mt-3 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(4)) }} />); i++; continue; }
    if (trimmed.startsWith('## ')) { elements.push(<h2 key={i} className="text-base font-bold text-white mt-3 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(3)) }} />); i++; continue; }
    if (trimmed.startsWith('# ')) { elements.push(<h1 key={i} className="text-lg font-bold text-white mt-3 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(2)) }} />); i++; continue; }
    // Horizontal rule
    if (/^([-]{3,}|[*]{3,}|[_]{3,})\s*$/.test(trimmed) && !/[a-zA-Z]/.test(trimmed)) { elements.push(<hr key={i} className="border-white/5 my-2" />); i++; continue; }
    // Unordered list
    if (/^[-*+]\s/.test(trimmed)) {
      elements.push(
        <div key={i} className="flex gap-2 text-xs text-gray-300 ml-2 my-0.5">
          <span className="text-indigo-400 mt-0.5 shrink-0">•</span>
          <span dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.replace(/^[-*+]\s/, '')) }} />
        </div>
      );
      i++; continue;
    }
    // Numbered list
    if (/^\d+\.\s/.test(trimmed)) {
      const num = trimmed.match(/^(\d+)\./)[1];
      elements.push(
        <div key={i} className="flex gap-2 text-xs text-gray-300 ml-2 my-0.5">
          <span className="text-indigo-400 mt-0.5 shrink-0 w-4 text-right">{num}.</span>
          <span dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.replace(/^\d+\.\s/, '')) }} />
        </div>
      );
      i++; continue;
    }
    // Blockquote
    if (trimmed.startsWith('> ')) {
      elements.push(<div key={i} className="border-l-2 border-indigo-500/30 pl-3 my-1 text-xs text-gray-400 italic" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(2)) }} />);
      i++; continue;
    }
    // Empty line
    if (trimmed === '') { elements.push(<div key={i} className="h-2" />); i++; continue; }
    // Regular paragraph
    elements.push(<p key={i} className="text-xs text-gray-300 leading-relaxed my-1" dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />);
    i++;
  }

  return <div>{elements}</div>;
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
    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 mt-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-sm font-bold text-white">{ticker}</span>
          {s.name && <span className="text-[10px] text-gray-500 ml-2">{s.name}</span>}
        </div>
        <div className="text-right">
          <span className="text-sm font-bold text-white">${last.toFixed(2)}</span>
          <span className={`text-[10px] ml-1 ${up ? 'text-emerald-400' : 'text-red-400'}`}>{up ? '+' : ''}{changePct}%</span>
        </div>
      </div>

      {/* Key stats row */}
      {s.pe_trailing && (
        <div className="flex gap-3 mb-2 text-[10px] flex-wrap">
          {s.market_cap_fmt && <span className="text-gray-500">MCap <span className="text-gray-300">{s.market_cap_fmt}</span></span>}
          {s.pe_trailing && <span className="text-gray-500">P/E <span className="text-gray-300">{s.pe_trailing.toFixed(1)}</span></span>}
          {s.dividend_yield_pct && <span className="text-gray-500">Div <span className="text-gray-300">{s.dividend_yield_pct}%</span></span>}
          {s.eps_trailing && <span className="text-gray-500">EPS <span className="text-gray-300">${s.eps_trailing.toFixed(2)}</span></span>}
        </div>
      )}

      {/* Charts row */}
      <div className="flex gap-3">
        {/* Price chart */}
        <div className="flex-1 min-w-0">
          <div className="text-[9px] text-gray-600 mb-1">6M Price</div>
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
            <div className="text-[9px] text-gray-600 mb-1">Monthly</div>
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
            <div className="text-[9px] text-gray-600 mb-1 text-center">Quality</div>
            <SnowflakeChart data={sf} size={55} mini />
          </div>
        )}
      </div>

      {/* Performance badges */}
      {Object.keys(perf).length > 0 && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {Object.entries(perf).map(([k, v]) => (
            <span key={k} className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${v >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {k}: {v > 0 ? '+' : ''}{v}%
            </span>
          ))}
        </div>
      )}

      {/* Navigation links */}
      <div className="flex gap-2 mt-2 pt-2 border-t border-white/5">
        <button onClick={() => onNavigate('research', ticker)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-indigo-400 hover:bg-indigo-500/10 transition-colors">
          <FileText className="w-3 h-3" /> Full Research
        </button>
        <button onClick={() => onNavigate('terminal', ticker)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-indigo-400 hover:bg-indigo-500/10 transition-colors">
          <BarChart3 className="w-3 h-3" /> Chart
        </button>
        <button onClick={() => onNavigate('screener', ticker)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-indigo-400 hover:bg-indigo-500/10 transition-colors">
          <Search className="w-3 h-3" /> Screener
        </button>
      </div>
    </div>
  );
}

// ─── Chat message ───
function Message({ msg, onNavigate }) {
  const isUser = msg.role === 'user';
  const tickers = !isUser ? extractTickers(msg.content) : [];

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-indigo-400" />
        </div>
      )}
      <div className={`max-w-[85%] ${isUser ? 'bg-indigo-600/20 border-indigo-500/20' : 'bg-white/[0.03] border-white/5'} border rounded-xl px-4 py-3`}>
        {isUser ? (
          <p className="text-sm text-white">{msg.content}</p>
        ) : (
          <>
            <RenderMarkdown text={msg.content} />
            {tickers.map(t => <TickerInsightCard key={t} ticker={t} onNavigate={onNavigate} />)}
          </>
        )}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-4 h-4 text-gray-400" />
        </div>
      )}
    </div>
  );
}

// ─── Streaming fetch ───
async function streamAgent(url, body, onToken) {
  const started = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Agent unavailable' }));
    const msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
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
export default function AgentPanel({ onNavigate, user, dek, onRequireUnlock }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('quick');
  const [agentOnline, setAgentOnline] = useState(null);
  const [streamingText, setStreamingText] = useState('');
  const [lastRun, setLastRun] = useState(null); // { mode, url, elapsedMs }
  const scrollRef = useRef(null);
  const streamTextRef = useRef('');
  const streamTickerRef = useRef('');
  const [hydrated, setHydrated] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessions, setSessions] = useState([newSession('New chat')]);
  const [activeSessionId, setActiveSessionId] = useState(null);

  const locked = !!(user?.id && !dek);

  const activeSession = useMemo(() => {
    const s = sessions.find((x) => x.id === activeSessionId) || sessions[0];
    return s || newSession('New chat');
  }, [sessions, activeSessionId]);

  const messages = activeSession?.messages || [];

  // Load: guest = localStorage plaintext; signed-in + dek = server blob (E2EE); signed-in no dek = locked (empty UI)
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
        if (!cancelled) {
          const s = newSession('New chat');
          setSessions([s]);
          setActiveSessionId(s.id);
          setHydrated(true);
        }
        return;
      }

      try {
        const data = await fetchAgentHistory();
        if (cancelled) return;

        if (!data) {
          const s = newSession('New chat');
          setSessions([s]);
          setActiveSessionId(s.id);
        } else if (data.blob) {
          const value = await decryptWithDek(dek, data.blob);
          if (!cancelled && Array.isArray(value) && value.length) {
            setSessions(value.slice(0, 50));
            setActiveSessionId(value[0]?.id || null);
          } else if (!cancelled) {
            const s = newSession('New chat');
            setSessions([s]);
            setActiveSessionId(s.id);
          }
        } else {
          const s = newSession('New chat');
          setSessions([s]);
          setActiveSessionId(s.id);
        }

        try {
          const rawPlain = localStorage.getItem(CHAT_STORAGE_KEY);
          const parsedPlain = rawPlain ? JSON.parse(rawPlain) : null;
          if (Array.isArray(parsedPlain) && parsedPlain.length) {
            if (!cancelled) {
              setSessions(parsedPlain.slice(0, 50));
              setActiveSessionId(parsedPlain[0]?.id || null);
            }
            localStorage.removeItem(CHAT_STORAGE_KEY);
          }
        } catch {}

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

  // Persist: guest = localStorage; signed-in + dek = encrypted blob to server
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
      if (!dek) return;
      try {
        const blob = await encryptWithDek(dek, payload);
        if (!cancelled) await putAgentHistory(blob);
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

  useEffect(() => { agentHealth().then(d => setAgentOnline(d.status === 'ok')); }, []);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamingText]);

  const handleSend = async () => {
    if (locked) return;
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
      const { data, elapsedMs } = await streamAgent(url, { message: msg, _client_mode: mode }, (text, ticker) => {
        streamTextRef.current = text;
        streamTickerRef.current = ticker;
        setStreamingText(text);
      });
      setLastRun({ mode, url, elapsedMs });
      const nextMessages = [...messages, { role: 'user', content: msg }, { role: 'assistant', content: streamTextRef.current, ticker: streamTickerRef.current }];
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

  return (
    <div className="flex h-full w-full min-h-0 min-w-0">
      {/* Left rail — ChatGPT-style: fixed width, flush to viewport edge, no rounding */}
      <aside
        className={`${
          sidebarCollapsed ? 'w-[52px]' : 'w-[260px]'
        } shrink-0 flex flex-col border-r border-white/[0.08] bg-[#0c0c0f] h-full min-h-0`}
      >
        <div className="h-full flex flex-col min-h-0">
          <div className="px-2.5 py-3 flex items-center justify-between gap-2 border-b border-white/[0.06]">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <PanelLeft className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="text-xs font-semibold text-gray-200 truncate">Chats</span>
              </div>
            )}
            {!sidebarCollapsed && (
              <button
                type="button"
                onClick={createNewChat}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/[0.14] text-xs text-white font-medium border border-white/10"
              >
                New
              </button>
            )}
          </div>

          {!sidebarCollapsed && (
            <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
              {sessions.map((s) => {
                const active = s.id === activeSession.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (loading) return;
                      setActiveSessionId(s.id);
                      setLastRun(s.lastRun || null);
                      setStreamingText('');
                      setInput('');
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${
                      active ? 'bg-white/[0.08] border-white/10' : 'border-transparent hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <MessageSquare className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${active ? 'text-indigo-300' : 'text-gray-600'}`} />
                      <div className="min-w-0">
                        <div className={`text-[11px] font-medium truncate ${active ? 'text-white' : 'text-gray-300'}`}>
                          {s.title || 'New chat'}
                        </div>
                        <div className="text-[10px] text-gray-600 mt-0.5">
                          {(s.messages?.length || 0)} · {s.mode === 'full' ? 'Full' : 'Quick'}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {sidebarCollapsed && (
            <div className="flex-1 flex items-start justify-center pt-3">
              <button
                type="button"
                onClick={createNewChat}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/[0.14] text-white border border-white/10"
                title="New chat"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main — centered thread column (ChatGPT-like max-w-3xl) + composer docked at bottom */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-[#0a0a0f]">
        <div className="flex flex-col flex-1 min-h-0 min-w-0">
          {/* Scrollable thread */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {!hasThread && (
              <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 sm:py-10 min-h-0 overflow-y-auto">
                <div className="relative w-full max-w-3xl mx-auto text-center">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 w-[min(100%,28rem)] h-40 bg-[radial-gradient(ellipse_80%_70%_at_50%_0%,rgba(99,102,241,0.14),transparent)]"
                  />
                  <div className="relative">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-500/25 bg-indigo-500/[0.08] shadow-[0_0_48px_-12px_rgba(99,102,241,0.45)] ring-1 ring-white/5">
                      <Sparkles className="h-8 w-8 text-indigo-300" strokeWidth={1.5} />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-2">Equilima Agent</h1>
                    <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
                      Ask in plain language — then use the rest of Equilima for charts, screeners, and tests.
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-4 mb-8">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${agentOnline ? 'bg-emerald-400' : agentOnline === false ? 'bg-red-400' : 'bg-amber-400'}`} />
                      <span className="text-[11px] text-gray-500 tabular-nums">
                        {agentOnline ? 'Model online' : agentOnline === false ? 'Agent offline' : 'Checking…'}
                      </span>
                    </div>

                    <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-600 mb-3">Explore Equilima</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-8 text-left">
                      {EXPLORE_TABS.map(({ id, label, hint, Icon }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => onNavigate?.(id)}
                          className="group rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 transition hover:border-indigo-500/30 hover:bg-indigo-500/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                        >
                          <Icon className="h-4 w-4 text-indigo-400/90 mb-1.5 opacity-90 group-hover:opacity-100" strokeWidth={1.75} />
                          <div className="text-[11px] font-medium text-white leading-snug">{label}</div>
                          <div className="text-[10px] text-gray-500 group-hover:text-gray-400 leading-snug">{hint}</div>
                        </button>
                      ))}
                    </div>

                    <div className="border-t border-white/[0.06] pt-6">
                      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-600 mb-3">Try asking</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                        {suggestions.map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setInput(s)}
                            className="text-left px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-indigo-500/30 hover:bg-white/[0.05] transition-all group"
                          >
                            <div className="flex items-start gap-2.5">
                              <TrendingUp className="w-3.5 h-3.5 text-gray-500 group-hover:text-indigo-400 mt-0.5 shrink-0 transition-colors" />
                              <span className="text-[11px] text-gray-400 group-hover:text-gray-200 leading-snug">{s}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {hasThread && (
              <div className="flex-1 min-h-0 relative flex flex-col">
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0a0a0f] to-transparent z-10 pointer-events-none" />
                <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
                  <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 space-y-4">
                    {messages.map((msg, i) => (
                      <Message key={i} msg={msg} onNavigate={onNavigate} />
                    ))}
                    {loading && streamingText && (
                      <div className="flex gap-3">
                        <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className="w-4 h-4 text-indigo-400" />
                        </div>
                        <div className="max-w-[85%] bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
                          <RenderMarkdown text={streamingText} />
                          <span className="inline-block w-1.5 h-4 bg-indigo-400 animate-pulse ml-0.5 rounded-sm" />
                        </div>
                      </div>
                    )}
                    {loading && !streamingText && (
                      <div className="flex gap-3">
                        <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0">
                          <Bot className="w-4 h-4 text-indigo-400" />
                        </div>
                        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                            {mode === 'full' ? 'Running multi-agent analysis...' : 'Thinking...'}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="h-8" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom composer — ChatGPT-style dock */}
          <div className="shrink-0 border-t border-white/[0.08] bg-[#0a0a0f] pt-3 pb-4">
            <div className="max-w-3xl w-full mx-auto px-4 sm:px-6">
              {locked && (
                <div className="mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-100/90">
                      Encrypted chat history is locked on this device until you sign in with your password again.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRequireUnlock?.()}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 text-xs font-medium border border-amber-500/30"
                  >
                    Sign in to unlock
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      setMode('quick');
                      updateActiveSession({ mode: 'quick' });
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all disabled:opacity-40 ${
                      mode === 'quick' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-500'
                    }`}
                  >
                    <Zap className="w-3 h-3" /> Quick
                  </button>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      setMode('full');
                      updateActiveSession({ mode: 'full' });
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all disabled:opacity-40 ${
                      mode === 'full' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-500'
                    }`}
                  >
                    <Bot className="w-3 h-3" /> Full Analysis
                  </button>
                </div>
                <span className="text-[9px] text-gray-600">{mode === 'quick' ? 'Fast response' : 'Multi-agent deep analysis'}</span>
                {lastRun && !loading && (
                  <span className="text-[9px] text-gray-700">
                    {lastRun.mode === 'full' ? 'Full' : 'Quick'} via <span className="font-mono">{lastRun.url}</span> · {(lastRun.elapsedMs / 1000).toFixed(1)}s
                  </span>
                )}
                {messages.length > 0 && !loading && (
                  <button
                    type="button"
                    onClick={() => {
                      createNewChat();
                    }}
                    className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
                    title="New chat"
                  >
                    <Trash2 className="w-3 h-3" /> New chat
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder={locked ? 'Sign in to unlock encrypted chats…' : 'Message Equilima Agent…'}
                  disabled={loading || locked}
                  className="flex-1 bg-white/[0.06] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/20 disabled:opacity-50 placeholder-gray-500"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={loading || !input.trim() || locked}
                  className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white rounded-2xl transition-colors shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[9px] text-gray-600 text-center mt-3">Powered by Gemma3 · Not financial advice</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

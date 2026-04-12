import { useState, useEffect, useRef, useMemo } from 'react';
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
} from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, YAxis, XAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { fetchTerminalChart, fetchResearch, fetchAgentHistory, putAgentHistory } from '../api';
import SnowflakeChart from './SnowflakeChart';
import { decryptWithDek, encryptWithDek } from '../e2ee';

const CHAT_STORAGE_KEY = 'eq_agent_chat_sessions_v1';

/** Signed-in but no in-memory DEK (e.g. page refresh): keep chat usable via local plaintext until next password unlock. */
function chatPlainStorageKey(userId) {
  return `eq_agent_chat_sessions_plain_v1:${userId}`;
}

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
    .replace(/`([^`]+)`/g, '<code class="bg-zinc-100 px-1 rounded text-indigo-700 text-[10px]">$1</code>')
    .replace(/\*{3}([^*]+)\*{3}/g, '<strong class="text-zinc-900 font-semibold"><em>$1</em></strong>')
    .replace(/\*{2}([^*]+)\*{2}/g, '<strong class="text-zinc-900 font-semibold">$1</strong>')
    .replace(/__([^_]+)__/g, '<strong class="text-zinc-900 font-semibold">$1</strong>')
    .replace(/(?<![<\w])\*([^*]+)\*(?![>\w])/g, '<em class="text-zinc-600">$1</em>')
    .replace(/(?<![<\w])_([^_]+)_(?![>\w])/g, '<em class="text-zinc-600">$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline">$1</a>');
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
          <div key={i} className="overflow-x-auto my-3 rounded-xl bg-zinc-50 ring-1 ring-zinc-200/60">
            <table className="w-full text-[11px]">
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
    if (trimmed.startsWith('#### ')) { elements.push(<h4 key={i} className="text-xs font-bold text-zinc-900 mt-2 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(5)) }} />); i++; continue; }
    if (trimmed.startsWith('### ')) { elements.push(<h3 key={i} className="text-sm font-bold text-zinc-900 mt-3 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(4)) }} />); i++; continue; }
    if (trimmed.startsWith('## ')) { elements.push(<h2 key={i} className="text-base font-bold text-zinc-900 mt-3 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(3)) }} />); i++; continue; }
    if (trimmed.startsWith('# ')) { elements.push(<h1 key={i} className="text-lg font-bold text-zinc-900 mt-3 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(2)) }} />); i++; continue; }
    if (/^([-]{3,}|[*]{3,}|[_]{3,})\s*$/.test(trimmed) && !/[a-zA-Z]/.test(trimmed)) { elements.push(<hr key={i} className="border-zinc-200 my-2" />); i++; continue; }
    // Unordered list
    if (/^[-*+]\s/.test(trimmed)) {
      elements.push(
        <div key={i} className="flex gap-2 text-xs text-zinc-600 ml-2 my-0.5">
          <span className="text-indigo-500 mt-0.5 shrink-0">•</span>
          <span dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.replace(/^[-*+]\s/, '')) }} />
        </div>
      );
      i++; continue;
    }
    // Numbered list
    if (/^\d+\.\s/.test(trimmed)) {
      const num = trimmed.match(/^(\d+)\./)[1];
      elements.push(
        <div key={i} className="flex gap-2 text-xs text-zinc-600 ml-2 my-0.5">
          <span className="text-indigo-500 mt-0.5 shrink-0 w-4 text-right">{num}.</span>
          <span dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.replace(/^\d+\.\s/, '')) }} />
        </div>
      );
      i++; continue;
    }
    // Blockquote
    if (trimmed.startsWith('> ')) {
      elements.push(<div key={i} className="border-l-2 border-indigo-200 pl-3 my-1 text-xs text-zinc-500 italic" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(2)) }} />);
      i++; continue;
    }
    // Empty line
    if (trimmed === '') { elements.push(<div key={i} className="h-2" />); i++; continue; }
    // Regular paragraph
    elements.push(<p key={i} className="text-xs text-zinc-600 leading-relaxed my-1" dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />);
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
function Message({ msg, onNavigate }) {
  const isUser = msg.role === 'user';
  const tickers = !isUser ? extractTickers(msg.content) : [];

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-indigo-600" />
        </div>
      )}
      <div className={`max-w-[85%] ${isUser ? 'bg-indigo-600 text-white dark:bg-zinc-700 dark:text-zinc-100' : 'bg-white ring-1 ring-zinc-200/70 shadow-sm dark:bg-zinc-900 dark:ring-zinc-700'} rounded-2xl px-4 py-3`}>
        {isUser ? (
          <p className="text-sm">{msg.content}</p>
        ) : (
          <>
            <RenderMarkdown text={msg.content} />
            {tickers.map(t => <TickerInsightCard key={t} ticker={t} onNavigate={onNavigate} />)}
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
export default function AgentPanel({ onNavigate, user, dek }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('quick');
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
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/80 transition-colors dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/80"
          title="Chat history"
        >
          <PanelLeft className="w-4 h-4 text-zinc-500" />
          Chats
        </button>
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
            <div className="w-full max-w-xl mx-auto text-center">
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
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-zinc-50 to-transparent z-10 pointer-events-none dark:from-zinc-950" />
            <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
              <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-4 space-y-4">
                {messages.map((msg, i) => (
                  <Message key={i} msg={msg} onNavigate={onNavigate} />
                ))}
                {loading && streamingText && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg bg-zinc-200 flex items-center justify-center shrink-0 mt-0.5 dark:bg-zinc-800">
                      <Bot className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
                    </div>
                    <div className="max-w-[85%] bg-white ring-1 ring-zinc-200/70 rounded-2xl px-4 py-3 shadow-sm dark:bg-zinc-900 dark:ring-zinc-700">
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
          <div className="max-w-3xl w-full mx-auto space-y-2">
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

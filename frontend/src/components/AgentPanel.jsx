import { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Bot, User, Sparkles, TrendingUp, Zap, ExternalLink, BarChart3, Search, FileText } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, YAxis, XAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { agentHealth, fetchTerminalChart, fetchResearch } from '../api';
import SnowflakeChart from './SnowflakeChart';

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

function RenderMarkdown({ text }) {
  if (!text) return null;
  // Remove <think>...</think> blocks (DeepSeek artifacts)
  let clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  return (
    <div>
      {clean.split('\n').map((line, i) => {
        const trimmed = line.trimStart();
        // Headings
        if (trimmed.startsWith('#### ')) return <h4 key={i} className="text-xs font-bold text-white mt-2 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(5)) }} />;
        if (trimmed.startsWith('### ')) return <h3 key={i} className="text-sm font-bold text-white mt-3 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(4)) }} />;
        if (trimmed.startsWith('## ')) return <h2 key={i} className="text-base font-bold text-white mt-3 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(3)) }} />;
        if (trimmed.startsWith('# ')) return <h1 key={i} className="text-lg font-bold text-white mt-3 mb-1" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(2)) }} />;
        // Horizontal rule
        if (/^([-]{3,}|[*]{3,}|[_]{3,})\s*$/.test(trimmed) && !/[a-zA-Z]/.test(trimmed)) return <hr key={i} className="border-white/5 my-2" />;
        // Unordered list
        if (/^[-*+]\s/.test(trimmed)) return (
          <div key={i} className="flex gap-2 text-xs text-gray-300 ml-2 my-0.5">
            <span className="text-indigo-400 mt-0.5 shrink-0">•</span>
            <span dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.replace(/^[-*+]\s/, '')) }} />
          </div>
        );
        // Numbered list
        if (/^\d+\.\s/.test(trimmed)) {
          const num = trimmed.match(/^(\d+)\./)[1];
          return (
            <div key={i} className="flex gap-2 text-xs text-gray-300 ml-2 my-0.5">
              <span className="text-indigo-400 mt-0.5 shrink-0 w-4 text-right">{num}.</span>
              <span dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.replace(/^\d+\.\s/, '')) }} />
            </div>
          );
        }
        // Blockquote
        if (trimmed.startsWith('> ')) return (
          <div key={i} className="border-l-2 border-indigo-500/30 pl-3 my-1 text-xs text-gray-400 italic" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(2)) }} />
        );
        // Empty line
        if (trimmed === '') return <div key={i} className="h-2" />;
        // Regular paragraph
        return <p key={i} className="text-xs text-gray-300 leading-relaxed my-1" dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />;
      })}
    </div>
  );
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
  return data;
}

// ─── Main ───
export default function AgentPanel({ onNavigate }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('quick');
  const [agentOnline, setAgentOnline] = useState(null);
  const [streamingText, setStreamingText] = useState('');
  const scrollRef = useRef(null);
  const streamTextRef = useRef('');
  const streamTickerRef = useRef('');

  useEffect(() => { agentHealth().then(d => setAgentOnline(d.status === 'ok')); }, []);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamingText]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    setStreamingText('');
    streamTextRef.current = '';
    streamTickerRef.current = '';

    try {
      const url = mode === 'full' ? '/api/agent/chat' : '/api/agent/quick';
      await streamAgent(url, { message: msg }, (text, ticker) => {
        streamTextRef.current = text;
        streamTickerRef.current = ticker;
        setStreamingText(text);
      });
      setMessages(prev => [...prev, { role: 'assistant', content: streamTextRef.current, ticker: streamTickerRef.current }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `**Error:** ${e.message}` }]);
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

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] max-w-4xl mx-auto">
      {/* Input area — top */}
      <div className="shrink-0 px-4 pt-4 pb-2">
        {messages.length === 0 && (
          <div className="text-center mb-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-7 h-7 text-indigo-400" />
            </div>
            <h1 className="text-xl font-bold text-white mb-1">Equilima AI</h1>
            <p className="text-xs text-gray-500 max-w-md mx-auto">AI-powered market research assistant</p>
            <div className="flex items-center gap-2 justify-center mt-2">
              <div className={`w-2 h-2 rounded-full ${agentOnline ? 'bg-emerald-400' : agentOnline === false ? 'bg-red-400' : 'bg-yellow-400'}`} />
              <span className="text-[10px] text-gray-600">{agentOnline ? 'Gemma3-4B online' : agentOnline === false ? 'Agent offline' : 'Checking...'}</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mb-2">
          <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
            <button onClick={() => setMode('quick')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${mode === 'quick' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-500'}`}>
              <Zap className="w-3 h-3" /> Quick
            </button>
            <button onClick={() => setMode('full')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${mode === 'full' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-500'}`}>
              <Bot className="w-3 h-3" /> Full Analysis
            </button>
          </div>
          <span className="text-[9px] text-gray-600">{mode === 'quick' ? 'Fast response' : 'Multi-agent deep analysis'}</span>
        </div>

        <div className="flex gap-2">
          <input type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask about any stock, market trend, or strategy..." disabled={loading}
            className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500/40 disabled:opacity-50 placeholder-gray-600" />
          <button onClick={handleSend} disabled={loading || !input.trim()}
            className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white rounded-xl transition-colors">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Suggestions */}
      {messages.length === 0 && (
        <div className="px-4 pt-2 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => setInput(s)}
                className="text-left px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-indigo-500/30 hover:bg-white/[0.04] transition-all group">
                <div className="flex items-start gap-2">
                  <TrendingUp className="w-3 h-3 text-gray-600 group-hover:text-indigo-400 mt-0.5 shrink-0" />
                  <span className="text-[11px] text-gray-400 group-hover:text-gray-200">{s}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat area with bottom fade */}
      {(messages.length > 0 || loading) && (
        <div className="flex-1 min-h-0 relative">
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0a0a0f] to-transparent z-10 pointer-events-none" />
          <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-4 space-y-4">
            {messages.map((msg, i) => <Message key={i} msg={msg} onNavigate={onNavigate} />)}

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
            <div className="h-12" />
          </div>
        </div>
      )}

      <div className="shrink-0 px-4 pb-2">
        <p className="text-[9px] text-gray-700 text-center">Powered by Gemma3 · Not financial advice</p>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Loader2, ExternalLink, Search, Clock } from 'lucide-react';
import { fetchNews } from '../api';

const PRESET_FEEDS = [
  { label: 'Market', symbols: '^GSPC,^IXIC,^DJI,^VIX,^GSPTSE' },
  { label: 'Big Tech', symbols: 'AAPL,MSFT,GOOGL,AMZN,NVDA,META,TSLA' },
  { label: 'Finance', symbols: 'JPM,GS,BRK-B,V,MA,BAC' },
  { label: 'Energy', symbols: 'XOM,CVX,CL=F,NG=F,SLB' },
  { label: 'Crypto', symbols: 'BTC-USD,ETH-USD,COIN' },
  { label: 'Canada', symbols: '^GSPTSE,RY.TO,TD.TO,SHOP.TO,ENB.TO,CNR.TO' },
];

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function NewsPanel() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeFeed, setActiveFeed] = useState(0);
  const [customSymbols, setCustomSymbols] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const loadFeed = async (symbols) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchNews(symbols);
      setArticles(res.articles || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    loadFeed(PRESET_FEEDS[0].symbols);
  }, []);

  const handlePreset = (idx) => {
    setActiveFeed(idx);
    loadFeed(PRESET_FEEDS[idx].symbols);
  };

  const handleCustom = () => {
    if (!customSymbols.trim()) return;
    setActiveFeed(-1);
    loadFeed(customSymbols);
  };

  const filtered = searchTerm
    ? articles.filter(a => a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.tickers?.some(t => t.toUpperCase().includes(searchTerm.toUpperCase())))
    : articles;

  return (
    <div className="space-y-4">
      {/* Feed selector */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESET_FEEDS.map((feed, i) => (
          <button key={i} onClick={() => handlePreset(i)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeFeed === i ? 'bg-[var(--eq-accent-soft)] text-[var(--eq-accent)] border ring-[var(--eq-accent-ring)]'
                : 'bg-[var(--eq-card)] text-[var(--eq-text3)] ring-1 ring-[var(--eq-border)] hover:text-[var(--eq-text)] hover:ring-[var(--eq-border2)]'
            }`}>
            {feed.label}
          </button>
        ))}

        <div className="w-px h-6 bg-[var(--eq-border)]" />

        {/* Custom ticker search */}
        <div className="flex gap-1">
          <input type="text" value={customSymbols} onChange={e => setCustomSymbols(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCustom()}
            placeholder="AAPL,TSLA,..."
            className="bg-[var(--eq-card2)] ring-1 ring-[var(--eq-border)] rounded-lg px-3 py-1.5 text-[var(--eq-text)] text-xs w-36 focus:outline-none focus:border-[var(--eq-accent-ring)]" />
          <button onClick={handleCustom}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--eq-accent)] text-[var(--eq-bg)] hover:opacity-85">
            Go
          </button>
        </div>

        <div className="flex-1" />

        {/* Filter articles */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--eq-text3)]" />
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Filter headlines..."
            className="bg-[var(--eq-card2)] ring-1 ring-[var(--eq-border)] rounded-lg pl-8 pr-3 py-1.5 text-[var(--eq-text)] text-xs w-40 focus:outline-none focus:border-[var(--eq-accent-ring)]" />
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-[var(--eq-loss)] text-sm">{error}</div>}

      {loading && (
        <div className="flex items-center justify-center h-48 text-[var(--eq-text3)]">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading news...
        </div>
      )}

      {/* Articles */}
      {!loading && (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-[var(--eq-text2)] text-sm">No articles found</div>
          )}
          {filtered.map((a, i) => (
            <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
              className="block bg-[var(--eq-card2)] shadow-sm ring-1 ring-[var(--eq-border)] rounded-xl p-4 hover:bg-[var(--eq-card2)] hover:ring-[var(--eq-border2)] transition-all group">
              <div className="flex gap-4">
                {/* Thumbnail */}
                {a.thumbnail && (
                  <div className="w-24 h-16 rounded-lg overflow-hidden shrink-0 bg-[var(--eq-card2)]">
                    <img src={a.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {/* Title */}
                  <h3 className="text-sm font-medium text-[var(--eq-text2)] group-hover:text-[var(--eq-text)] line-clamp-2 mb-1">
                    {a.title}
                    <ExternalLink className="inline w-3 h-3 ml-1 opacity-0 group-hover:opacity-50" />
                  </h3>
                  {/* Meta */}
                  <div className="flex items-center gap-3 text-[10px] text-[var(--eq-text3)]">
                    {a.source && <span className="text-[var(--eq-text3)]">{a.source}</span>}
                    <span className="flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {formatDate(a.date)}
                    </span>
                    <span className="text-[var(--eq-text2)]">{timeAgo(a.date)}</span>
                  </div>
                  {/* Tickers */}
                  {a.tickers?.length > 0 && (
                    <div className="flex gap-1 mt-1.5">
                      {a.tickers.map((t, j) => (
                        <span key={j} className="px-1.5 py-0.5 rounded bg-[var(--eq-card2)] text-[9px] text-[var(--eq-accent)] font-medium">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

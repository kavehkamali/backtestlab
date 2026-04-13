import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { fetchCrypto, fetchNews } from '../api';

const PERIODS = [
  { id: '1D', label: '1D', key: null },
  { id: '1W', label: '1W', key: '1W' },
  { id: '1M', label: '1M', key: '1M' },
  { id: '3M', label: '3M', key: '3M' },
  { id: '6M', label: '6M', key: '6M' },
  { id: 'YTD', label: 'YTD', key: 'YTD' },
  { id: '1Y', label: '1Y', key: '1Y' },
  { id: '2Y', label: '2Y', key: '2Y' },
  { id: '5Y', label: '5Y', key: '5Y' },
  { id: '10Y', label: '10Y', key: '10Y' },
];

const PERIOD_DAYS = {
  null: 2,
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '6M': 180,
  'YTD': 180,
  '1Y': 365,
  '2Y': 730,
  '5Y': 1825,
  '10Y': 3650,
};

function sliceSparkline(data, periodKey) {
  if (!data?.length) return data;
  const days = PERIOD_DAYS[periodKey] ?? 60;
  const n = Math.min(days, data.length);
  return data.slice(-n);
}

function HeroTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-lg px-3 py-1.5 text-[10px] shadow-md ring-1 ring-zinc-200/80">
      <span className="text-zinc-900 font-medium">${payload[0]?.value?.toLocaleString()}</span>
    </div>
  );
}

function Sparkline({ data, height = 32 }) {
  if (!data?.length) return null;
  const w = 200;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const denom = Math.max(data.length - 1, 1);
  const pts = data.map((v, i) => `${(i / denom) * w},${height - ((v - min) / range) * height}`).join(' ');
  return <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}><polyline fill="none" stroke={data[data.length - 1] >= data[0] ? '#16a34a' : '#dc2626'} strokeWidth="2" points={pts} /></svg>;
}

function Pct({ value }) {
  if (value == null) return <span className="text-zinc-400">—</span>;
  const c = value > 0 ? 'text-emerald-600' : value < 0 ? 'text-red-600' : 'text-zinc-500';
  return <span className={`${c} font-mono text-xs`}>{value > 0 ? '+' : ''}{value}%</span>;
}

function fmtPrice(v) {
  if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 1) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v.toFixed(6);
}

function formatHeroAxisY(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  if (a >= 100) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a >= 1) return n.toFixed(2);
  if (a >= 0.0001) return n.toFixed(4);
  return n.toExponential(1);
}

function fmtCap(v) {
  if (!v) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v}`;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function getCryptoChange(item, period) {
  if (!period) return item.changes?.['1D'] ?? item.change_1d;
  return item.changes?.[period] ?? null;
}

function CryptoCard({ item, period }) {
  const change = getCryptoChange(item, period);
  const up = change != null && change >= 0;
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm ring-1 ring-zinc-200/70 hover:ring-zinc-300/80 transition-all overflow-hidden min-w-0">
      <div className="flex items-start justify-between mb-1.5">
        <div className="text-[10px] text-zinc-500 truncate max-w-[100px]">{item.name}</div>
        <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${change == null ? 'bg-zinc-100 text-zinc-500' : up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {change != null ? `${up ? '+' : ''}${change}%` : '—'}
        </div>
      </div>
      <div className={`text-sm font-bold ${change == null ? 'text-zinc-400' : up ? 'text-emerald-600' : 'text-red-600'}`}>{fmtPrice(item.price)}</div>
      <div className="mt-1.5"><Sparkline data={sliceSparkline(item.sparkline, period)} height={28} /></div>
      <div className="flex gap-2 mt-1.5 flex-wrap">
        {PERIODS.filter(p => p.id !== '1D' && p.key !== period).slice(0, 3).map(p => {
          const val = p.key ? item.changes?.[p.key] : null;
          if (val == null) return null;
          return (
            <div key={p.id} className="text-center">
              <div className="text-[7px] text-zinc-500">{p.label}</div>
              <Pct value={val} />
            </div>
          );
        })}
      </div>
      <div className="text-[9px] text-zinc-500 mt-1">Vol 24h: {item.volume_24h != null ? fmtCap(item.volume_24h) : '—'} · MCap: {fmtCap(item.market_cap)}</div>
    </div>
  );
}

function Section({ title, children, right }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function CryptoPanel({ embedded = false }) {
  const [crypto, setCrypto] = useState(null);
  const [news, setNews] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('1Y');

  useEffect(() => {
    Promise.all([
      fetchCrypto().catch(() => null),
      fetchNews('BTC-USD,ETH-USD,SOL-USD,XRP-USD').catch(() => null),
    ]).then(([c, n]) => {
      setCrypto(c);
      setNews(n);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading crypto overview...
      </div>
    );
  }

  const coins = crypto?.coins || [];
  const articles = (news?.articles || []).slice(0, 8);
  const activePeriodKey = PERIODS.find(p => p.key === period)?.key ?? null;
  const activePeriodLabel = PERIODS.find(p => p.key === period)?.label ?? '1Y';

  const heroSyms = ['BTC', 'ETH'];
  const heroItems = heroSyms.map((sym) => {
    const coin = coins.find((c) => c.symbol === sym);
    return coin ? { coin, gradId: `cg-${sym}` } : null;
  }).filter(Boolean);

  return (
    <div className={`space-y-6 ${embedded ? 'pt-0' : ''}`}>
      <div className={`flex items-center gap-2 ${embedded ? 'justify-end' : 'justify-between'}`}>
        {!embedded && <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Crypto overview</h2>}
        <div className="flex gap-0.5 bg-zinc-100 rounded-lg p-0.5 flex-wrap justify-end dark:bg-zinc-800/80">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                period === p.key ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-zinc-200/60' : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {heroItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {heroItems.map(({ coin, gradId }) => {
            const spark = sliceSparkline(coin.sparkline, activePeriodKey);
            const chartData = spark.map((v, i) => ({ i, price: v }));
            const change = getCryptoChange(coin, activePeriodKey);
            const up = change != null && change >= 0;
            return (
              <div key={coin.symbol} className="bg-white rounded-xl p-4 sm:p-5 shadow-sm ring-1 ring-zinc-200/70 dark:bg-zinc-900/80 dark:ring-zinc-800">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{coin.name}</div>
                    <div className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">{fmtPrice(coin.price)}</div>
                  </div>
                  <div
                    className={`text-sm font-bold px-2.5 py-1 rounded-lg ${
                      change == null ? 'text-zinc-500' : up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {change != null ? `${up ? '+' : ''}${change}%` : '—'}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 2, left: 4, bottom: 4 }}>
                    <defs>
                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={up ? '#22c55e' : '#ef4444'} stopOpacity={0.12} />
                        <stop offset="100%" stopColor={up ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                    <XAxis
                      dataKey="i"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tickCount={4}
                      tick={{ fontSize: 9, fill: '#71717a' }}
                      tickLine={false}
                      axisLine={{ stroke: '#d4d4d8' }}
                      tickFormatter={(x) => Math.round(Number(x))}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tickCount={4}
                      width={40}
                      tick={{ fontSize: 9, fill: '#71717a' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={formatHeroAxisY}
                    />
                    <Tooltip content={<HeroTooltip />} />
                    <Area type="monotone" dataKey="price" stroke={up ? '#16a34a' : '#dc2626'} fill={`url(#${gradId})`} strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            );
          })}
        </div>
      )}

      <Section title={`All coins — ${activePeriodLabel} change`}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {coins.map((item) => (
            <CryptoCard key={item.symbol} item={item} period={activePeriodKey} />
          ))}
        </div>
      </Section>

      {articles.length > 0 && (
        <Section title="Crypto & digital assets news">
          <div className="space-y-2 max-w-2xl">
            {articles.map((a, i) => (
              <a
                key={i}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white rounded-lg p-2.5 shadow-sm ring-1 ring-zinc-200/70 hover:bg-zinc-50 hover:ring-zinc-300/80 transition-all group"
              >
                <div className="text-[11px] font-medium text-zinc-800 group-hover:text-zinc-950 line-clamp-2">{a.title}</div>
                <div className="flex items-center gap-2 mt-1 text-[9px] text-zinc-500">
                  {a.source && <span>{a.source}</span>}
                  <span>{timeAgo(a.date)} ago</span>
                  {a.tickers?.slice(0, 4).map((t, j) => (
                    <span key={j} className="px-1 rounded bg-indigo-50 text-indigo-700 text-[8px] ring-1 ring-indigo-100">
                      {t}
                    </span>
                  ))}
                </div>
              </a>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

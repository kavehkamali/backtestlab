import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { AreaChart, Area, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { fetchMarketOverview, fetchNews } from '../api';

const PERIODS = [
  { id: '1D', label: '1D', key: null },
  { id: '1W', label: '1W', key: '1W' },
  { id: '1M', label: '1M', key: '1M' },
  { id: '3M', label: '3M', key: '3M' },
  { id: '6M', label: '6M', key: '6M' },
  { id: 'YTD', label: 'YTD', key: 'YTD' },
  { id: '1Y', label: '1Y', key: '1Y' },
  { id: '2Y', label: '2Y', key: '2Y' },
];

// Map period key to approximate number of trading days to show in sparklines
const PERIOD_DAYS = {
  null: 2, // 1D — last two daily closes (distinct from 1W’s five sessions)
  '1W': 5,
  '1M': 21,
  '3M': 63,
  '6M': 126,
  'YTD': 180,
  '1Y': 252,
  '2Y': 504,
};

function sliceSparkline(data, periodKey) {
  if (!data?.length) return data;
  const days = PERIOD_DAYS[periodKey] ?? 60;
  const n = Math.min(days, data.length);
  return data.slice(-n);
}

// ─── Hero chart tooltip ───
function HeroTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-1.5 text-[10px]">
      <span className="text-white font-medium">${payload[0]?.value?.toLocaleString()}</span>
    </div>
  );
}

// ─── Helpers ───
function Sparkline({ data, height = 32 }) {
  if (!data?.length) return null;
  const w = 200; // viewBox width, SVG scales to container
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const denom = Math.max(data.length - 1, 1);
  const pts = data.map((v, i) => `${(i / denom) * w},${height - ((v - min) / range) * height}`).join(' ');
  return <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}><polyline fill="none" stroke={data[data.length - 1] >= data[0] ? '#22c55e' : '#ef4444'} strokeWidth="2" points={pts} /></svg>;
}
function Pct({ value }) {
  if (value == null) return <span className="text-gray-600">—</span>;
  const c = value > 0 ? 'text-emerald-400' : value < 0 ? 'text-red-400' : 'text-gray-500';
  return <span className={`${c} font-mono text-xs`}>{value > 0 ? '+' : ''}{value}%</span>;
}
function fmtPrice(v) {
  if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return v.toFixed(2);
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

function getChange(item, period) {
  if (!period) return item.change_1d; // 1D is the default
  return item.changes?.[period] ?? null;
}

function MarketCard({ item, period }) {
  const change = getChange(item, period);
  const up = change != null && change >= 0;
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3 hover:border-white/10 transition-all overflow-hidden min-w-0">
      <div className="flex items-start justify-between mb-1.5">
        <div className="text-[10px] text-gray-500 truncate max-w-[80px]">{item.name}</div>
        <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${change == null ? 'bg-white/5 text-gray-500' : up ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {change != null ? `${up ? '+' : ''}${change}%` : '—'}
        </div>
      </div>
      <div className={`text-sm font-bold ${change == null ? 'text-gray-400' : up ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPrice(item.price)}</div>
      <div className="mt-1.5"><Sparkline data={sliceSparkline(item.sparkline, period)} height={28} /></div>
      {/* Show other periods as context */}
      <div className="flex gap-2 mt-1.5 flex-wrap">
        {PERIODS.filter(p => p.id !== '1D' && p.key !== period).slice(0, 3).map(p => {
          const val = item.changes?.[p.key];
          if (val == null) return null;
          return (
            <div key={p.id} className="text-center">
              <div className="text-[7px] text-gray-600">{p.label}</div>
              <Pct value={val} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectorHeatmap({ sectors, period }) {
  if (!sectors?.length) return null;
  const changes = sectors.map(s => getChange(s, period) ?? 0);
  const maxAbs = Math.max(...changes.map(Math.abs), 0.01);
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
      {sectors.map(s => {
        const change = getChange(s, period) ?? 0;
        const intensity = Math.min(Math.abs(change) / maxAbs, 1);
        const bg = change >= 0 ? `rgba(34,197,94,${0.1 + intensity * 0.4})` : `rgba(239,68,68,${0.1 + intensity * 0.4})`;
        return (
          <div key={s.symbol} className="rounded-lg p-2.5 text-center border border-white/5" style={{ background: bg }}>
            <div className="text-[10px] text-gray-300 font-medium truncate">{s.name}</div>
            <div className={`text-sm font-bold ${change >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{change > 0 ? '+' : ''}{change}%</div>
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children, right }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function DashboardPanel() {
  const [market, setMarket] = useState(null);
  const [news, setNews] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('1Y');

  useEffect(() => {
    Promise.all([fetchMarketOverview().catch(() => null), fetchNews('^GSPC,^IXIC,AAPL,MSFT,NVDA,TSLA,AMZN').catch(() => null)]).then(
      ([m, n]) => {
        setMarket(m);
        setNews(n);
      }
    ).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading market overview...
      </div>
    );
  }

  const articles = (news?.articles || []).slice(0, 8);

  const activePeriodKey = PERIODS.find(p => p.key === period)?.key ?? null;
  const activePeriodLabel = PERIODS.find(p => p.key === period)?.label ?? '1Y';

  return (
    <div className="space-y-6">
      {/* Period Toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Market Overview</h2>
        <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5 flex-wrap justify-end">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                period === p.key ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hero Charts — big visual for key indices */}
      {market?.indices && (() => {
        const heroItems = [
          { name: 'S&P 500', symbol: '^GSPC', color: '#6366f1', gradId: 'hg1' },
          { name: 'NASDAQ', symbol: '^IXIC', color: '#22c55e', gradId: 'hg2' },
          { name: 'VIX', symbol: '^VIX', color: '#f59e0b', gradId: 'hg3' },
        ];
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {heroItems.map(h => {
              const item = market.indices.find(i => i.symbol === h.symbol);
              if (!item) return null;
              const spark = sliceSparkline(item.sparkline, activePeriodKey);
              const chartData = spark.map((v, i) => ({ i, price: v }));
              const change = getChange(item, activePeriodKey);
              const up = change != null && change >= 0;
              return (
                <div key={h.symbol} className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-xs text-gray-500">{h.name}</div>
                      <div className="text-xl font-bold text-white">{fmtPrice(item.price)}</div>
                    </div>
                    <div className={`text-sm font-bold px-2 py-1 rounded-lg ${change == null ? 'text-gray-500' : up ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {change != null ? `${up ? '+' : ''}${change}%` : '—'}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id={h.gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={up ? '#22c55e' : '#ef4444'} stopOpacity={0.15} />
                          <stop offset="100%" stopColor={up ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff04" />
                      <YAxis domain={['auto', 'auto']} hide />
                      <Tooltip content={<HeroTooltip />} />
                      <Area type="monotone" dataKey="price" stroke={up ? '#22c55e' : '#ef4444'} fill={`url(#${h.gradId})`} strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Indices */}
      {market?.indices && (
        <Section title={`Indices — ${activePeriodLabel} Change`}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {market.indices.map(item => <MarketCard key={item.symbol} item={item} period={activePeriodKey} />)}
          </div>
        </Section>
      )}

      {/* Sector Heatmap */}
      {market?.sectors && (
        <Section title={`Sector Performance — ${activePeriodLabel}`}>
          <SectorHeatmap sectors={market.sectors} period={activePeriodKey} />
        </Section>
      )}

      {/* Commodities, rates, housing + news (crypto has its own tab) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-5">
          {market?.commodities && (
            <Section title="Commodities">
              <div className="grid grid-cols-2 gap-2">
                {market.commodities.map((item) => (
                  <MarketCard key={item.symbol} item={item} period={activePeriodKey} />
                ))}
              </div>
            </Section>
          )}
          {market?.bonds && (
            <Section title="Bonds & Yields">
              <div className="grid grid-cols-2 gap-2">
                {market.bonds.map((item) => (
                  <MarketCard key={item.symbol} item={item} period={activePeriodKey} />
                ))}
              </div>
            </Section>
          )}
          {market?.currencies && (
            <Section title="Currencies">
              <div className="grid grid-cols-2 gap-2">
                {market.currencies.map((item) => (
                  <MarketCard key={item.symbol} item={item} period={activePeriodKey} />
                ))}
              </div>
            </Section>
          )}
          {market?.housing && (
            <Section title="Housing & Real Estate">
              <div className="grid grid-cols-2 gap-2">
                {market.housing.map((item) => (
                  <MarketCard key={item.symbol} item={item} period={activePeriodKey} />
                ))}
              </div>
            </Section>
          )}
        </div>

        <div>
          <Section title="Market News">
            <div className="space-y-2">
              {articles.map((a, i) => (
                <a
                  key={i}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-white/[0.02] border border-white/5 rounded-lg p-2.5 hover:bg-white/[0.04] hover:border-white/10 transition-all group"
                >
                  <div className="text-[11px] font-medium text-gray-200 group-hover:text-white line-clamp-2">{a.title}</div>
                  <div className="flex items-center gap-2 mt-1 text-[9px] text-gray-500">
                    {a.source && <span>{a.source}</span>}
                    <span>{timeAgo(a.date)} ago</span>
                    {a.tickers?.slice(0, 3).map((t, j) => (
                      <span key={j} className="px-1 rounded bg-white/5 text-indigo-400 text-[8px]">
                        {t}
                      </span>
                    ))}
                  </div>
                </a>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

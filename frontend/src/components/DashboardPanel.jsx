import { useState, useEffect, useMemo } from 'react';
import { Loader2, Search } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { fetchMarketOverview, fetchNews } from '../api';
import CryptoPanel from './CryptoPanel';
import { buildOverviewHeroChartRows, formatHeroXTick } from '../utils/marketHeroChart';

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
  '5Y': 1260,
  '10Y': 2520,
};

function pickSparkline(item, periodKey) {
  if (!item) return null;
  if (periodKey === null) return item.sparkline_1d?.length ? item.sparkline_1d : item.sparkline;
  if (periodKey === '1W') return item.sparkline_1w?.length ? item.sparkline_1w : item.sparkline;
  return item.sparkline;
}

function sliceSparkline(data, periodKey) {
  if (!data?.length) return data;
  if (periodKey === '1W') return data;
  if (periodKey === null) return data;
  const days = PERIOD_DAYS[periodKey] ?? 60;
  const n = Math.min(days, data.length);
  return data.slice(-n);
}

function HeroTooltip({ active, payload, periodKey }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const v = row?.price ?? payload[0]?.value;
  const when = row?.ts != null ? formatHeroXTick(periodKey, row.ts) : '';
  const n = Number(v);
  const priceStr = Number.isFinite(n) ? `$${n.toLocaleString()}` : '—';
  return (
    <div className="bg-[var(--eq-card)] rounded-lg px-3 py-1.5 text-[10px] shadow-md ring-1 ring-[var(--eq-border)]">
      {when && <div className="text-[var(--eq-text3)] mb-0.5">{when}</div>}
      <span className="text-[var(--eq-text)] font-medium">{priceStr}</span>
    </div>
  );
}

function QuoteHeroTooltip({ active, payload, decimals, periodKey }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const raw = row?.price ?? payload[0]?.value;
  const n = Number(raw);
  const s = Number.isFinite(n) ? n.toFixed(decimals) : '—';
  const when = row?.ts != null ? formatHeroXTick(periodKey, row.ts) : '';
  return (
    <div className="bg-[var(--eq-card)] rounded-lg px-3 py-1.5 text-[10px] shadow-md ring-1 ring-[var(--eq-border)]">
      {when && <div className="text-[var(--eq-text3)] mb-0.5">{when}</div>}
      <span className="text-[var(--eq-text)] font-medium">{s}</span>
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
  if (value == null) return <span className="text-[var(--eq-text3)]">—</span>;
  const c = value > 0 ? 'text-[var(--eq-gain)]' : value < 0 ? 'text-[var(--eq-loss)]' : 'text-[var(--eq-text3)]';
  return <span className={`${c} font-mono text-xs`}>{value > 0 ? '+' : ''}{value}%</span>;
}
function fmtPrice(v) {
  if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return v.toFixed(2);
}

function isForexItem(item) {
  const s = item?.symbol || '';
  return s.includes('=X') || s === 'DX-Y.NYB';
}

function isCommodityFuture(item) {
  const s = item?.symbol || '';
  return s.includes('=F');
}

/** Card headline: extra decimals for FX; futures keep compact. */
function fmtDisplayPrice(item) {
  const v = item?.price;
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  const sym = item.symbol || '';
  if (sym === 'DX-Y.NYB') return n.toFixed(2);
  if (sym.includes('=X')) {
    if (sym === 'JPY=X' || /JPY=X$/.test(sym) || (sym.includes('JPY') && n >= 15)) return n.toFixed(2);
    if (n >= 50 && n < 400) return n.toFixed(2);
    if (n < 0.01) return n.toFixed(6);
    if (n < 1) return n.toFixed(5);
    if (n < 20) return n.toFixed(4);
    return n.toFixed(2);
  }
  if (sym.includes('=F')) {
    if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (n >= 100) return n.toFixed(1);
    if (n < 1) return n.toFixed(3);
    return n.toFixed(2);
  }
  return fmtPrice(n);
}

function heroTooltipDecimals(item) {
  if (!item) return 2;
  const sym = item.symbol || '';
  if (sym.includes('=X') && sym !== 'DX-Y.NYB') {
    const n = Number(item.price);
    if (Number.isFinite(n) && n < 20 && n >= 0.5) return 4;
    return 2;
  }
  if (sym.includes('=F')) {
    const n = Number(item.price);
    if (Number.isFinite(n) && n < 50) return 3;
    return 2;
  }
  return 2;
}

function formatHeroAxisY(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  if (a >= 100) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a >= 1) return n.toFixed(n >= 10 ? 1 : 2);
  return n.toFixed(2);
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
  if (!period) return item.change_1d;
  return item.changes?.[period] ?? null;
}

function MarketCard({ item, period, onClick }) {
  const change = getChange(item, period);
  const up = change != null && change >= 0;
  const rawSpark = pickSparkline(item, period);
  const sparkData = sliceSparkline(rawSpark, period);
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`bg-[var(--eq-card)] rounded-xl p-3 shadow-sm ring-1 ring-[var(--eq-border)] hover:ring-[var(--eq-border2)] transition-all overflow-hidden min-w-0 ${onClick ? 'w-full text-left hover:-translate-y-0.5 cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between mb-1.5">
        <div className="text-[10px] text-[var(--eq-text3)] truncate max-w-[80px]">{item.name}</div>
        <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${change == null ? 'bg-[var(--eq-card2)] text-[var(--eq-text3)]' : up ? 'bg-[var(--eq-gain-soft)] text-[var(--eq-gain)]' : 'bg-[var(--eq-loss-soft)] text-[var(--eq-loss)]'}`}>
          {change != null ? `${up ? '+' : ''}${change}%` : '—'}
        </div>
      </div>
      <div className={`text-sm font-bold ${change == null ? 'text-[var(--eq-text3)]' : up ? 'text-[var(--eq-gain)]' : 'text-[var(--eq-loss)]'}`}>{fmtDisplayPrice(item)}</div>
      <div className="mt-1.5"><Sparkline data={sparkData} height={28} /></div>
      <div className="flex gap-2 mt-1.5 flex-wrap">
        {PERIODS.filter(p => p.id !== '1D' && p.key !== period).slice(0, 3).map(p => {
          const val = item.changes?.[p.key];
          if (val == null) return null;
          return (
            <div key={p.id} className="text-center">
              <div className="text-[7px] text-[var(--eq-text3)]">{p.label}</div>
              <Pct value={val} />
            </div>
          );
        })}
      </div>
    </Wrapper>
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
        const bg = change >= 0 ? `rgba(34,197,94,${0.08 + intensity * 0.35})` : `rgba(239,68,68,${0.08 + intensity * 0.35})`;
        return (
          <div key={s.symbol} className="rounded-lg p-2.5 text-center ring-1 ring-[var(--eq-border)]" style={{ background: bg }}>
            <div className="text-[10px] text-[var(--eq-text)] font-medium truncate">{s.name}</div>
            <div className={`text-sm font-bold ${change >= 0 ? 'text-[var(--eq-gain)]' : 'text-[var(--eq-loss)]'}`}>{change > 0 ? '+' : ''}{change}%</div>
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
        <h3 className="text-xs font-semibold text-[var(--eq-text3)] uppercase tracking-wider">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

const MARKET_ARENAS = [
  { id: 'stocks', label: 'Stocks' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'forex', label: 'Forex' },
  { id: 'commodities', label: 'Commodities' },
];

const NEWS_SYMBOLS_BY_ARENA = {
  stocks: '^GSPC,^IXIC,AAPL,MSFT,NVDA,TSLA,AMZN,META',
  forex: 'EURUSD=X,GBPUSD=X,JPY=X,CAD=X,CHF=X,DX-Y.NYB',
  commodities: 'CL=F,GC=F,BZ=F,SI=F,NG=F,HG=F,ZC=F,ZW=F',
};

const DEFAULT_MARKET_ORDERS = {
  stocks: ['^GSPC', '^IXIC'],
  forex: ['EURUSD=X', 'JPY=X'],
  commodities: ['CL=F', 'GC=F'],
};

function orderedMarketSeries(items, order = []) {
  if (!items?.length) return [];
  const bySymbol = new Map(items.map((item) => [item.symbol, item]));
  const used = new Set();
  const ordered = [];
  order.forEach((symbol) => {
    const item = bySymbol.get(symbol);
    if (item && !used.has(symbol)) {
      ordered.push(item);
      used.add(symbol);
    }
  });
  items.forEach((item) => {
    if (!used.has(item.symbol)) ordered.push(item);
  });
  return ordered;
}

function normalizeMarketSearch(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9=^.-]+/g, ' ');
}

function scoreMarketSearchItem(item, query) {
  const q = normalizeMarketSearch(query);
  if (!q) return 0;
  const compact = q.replace(/\s+/g, '');
  const symbol = String(item.symbol || '').toLowerCase();
  const cleanSymbol = symbol.replace(/[^a-z0-9]/g, '');
  const name = normalizeMarketSearch(item.name || '');
  const nameCompact = name.replace(/\s+/g, '');
  if (symbol === compact || cleanSymbol === compact) return 100;
  if (name === q) return 96;
  if (symbol.startsWith(compact) || cleanSymbol.startsWith(compact)) return 90 - symbol.length / 10;
  if (name.startsWith(q) || nameCompact.startsWith(compact)) return 82 - name.length / 100;
  if (symbol.includes(compact) || cleanSymbol.includes(compact)) return 72 - Math.min(symbol.indexOf(compact), cleanSymbol.indexOf(compact) || 99);
  if (name.includes(q) || nameCompact.includes(compact)) return 64 - Math.min(name.indexOf(q), nameCompact.indexOf(compact) || 99) / 10;
  return 0;
}

function sortForexSeries(items) {
  if (!items?.length) return [];
  return [...items].sort((a, b) => {
    const dx = (s) => (s === 'DX-Y.NYB' ? 1 : 0);
    const d = dx(a.symbol) - dx(b.symbol);
    if (d !== 0) return d;
    return (a.name || '').localeCompare(b.name || '');
  });
}

const COMM_PRIORITY = ['CL=F', 'BZ=F', 'GC=F', 'SI=F', 'NG=F', 'HG=F', 'PL=F', 'PA=F', 'RB=F', 'HO=F'];
function sortCommoditySeries(items) {
  if (!items?.length) return [];
  return [...items].sort((a, b) => {
    const ca = COMM_PRIORITY.indexOf(a.symbol);
    const cb = COMM_PRIORITY.indexOf(b.symbol);
    const ra = ca === -1 ? 999 : ca;
    const rb = cb === -1 ? 999 : cb;
    if (ra !== rb) return ra - rb;
    return (a.name || '').localeCompare(b.name || '');
  });
}

function formatHeroTickForItem(item, v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  if (isForexItem(item)) {
    const a = Math.abs(n);
    if (a < 200 && a >= 0.0001) {
      if (a < 2) return n.toFixed(4);
      if (a < 20) return n.toFixed(3);
      return n.toFixed(2);
    }
    return formatHeroAxisY(n);
  }
  if (isCommodityFuture(item)) {
    const a = Math.abs(n);
    if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (a >= 10000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (a >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (a < 10) return n.toFixed(3);
    return n.toFixed(2);
  }
  return formatHeroAxisY(n);
}

function PeriodToolbar({ period, setPeriod }) {
  return (
    <div className="flex gap-0.5 bg-[var(--eq-card2)] rounded-lg p-0.5 flex-wrap justify-end">
      {PERIODS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => setPeriod(p.key)}
          className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
            period === p.key ? 'bg-[var(--eq-card)] text-[var(--eq-accent)] shadow-sm ring-1 ring-[var(--eq-border)]' : 'text-[var(--eq-text3)] hover:text-[var(--eq-text)]'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function NewsFeed({ articles, title = 'Market News' }) {
  return (
    <Section title={title}>
      <div className="space-y-2">
        {articles.map((a, i) => (
          <a
            key={i}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-[var(--eq-card)] rounded-lg p-2.5 shadow-sm ring-1 ring-[var(--eq-border)] hover:bg-[var(--eq-card2)] hover:ring-[var(--eq-border2)] transition-all group"
          >
            <div className="text-[11px] font-medium text-[var(--eq-text)] group-hover:text-[var(--eq-text)] line-clamp-2">{a.title}</div>
            <div className="flex items-center gap-2 mt-1 text-[9px] text-[var(--eq-text3)]">
              {a.source && <span>{a.source}</span>}
              <span>{timeAgo(a.date)} ago</span>
              {a.tickers?.slice(0, 3).map((t, j) => (
                <span key={j} className="px-1 rounded bg-[var(--eq-accent-soft)] text-[var(--eq-accent)] text-[8px] ring-1 ring-[var(--eq-accent-ring)]">
                  {t}
                </span>
              ))}
            </div>
          </a>
        ))}
      </div>
    </Section>
  );
}

function OverviewHeroRow({ seriesList, activePeriodKey, useQuoteTooltip, gradPrefix }) {
  if (!seriesList?.length) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {seriesList.slice(0, 2).map((item, index) => {
        if (!item) return null;
        const { chartData, xTicks } = buildOverviewHeroChartRows(item, activePeriodKey);
        if (!chartData.length) return null;
        const change = getChange(item, activePeriodKey);
        const up = change != null && change >= 0;
        const dec = heroTooltipDecimals(item);
        const gradId = `${gradPrefix}-${index + 1}-${item.symbol.replace(/[^a-z0-9]/gi, '-')}`;
        return (
          <div key={item.symbol} className="bg-[var(--eq-card)] rounded-xl p-4 sm:p-5 shadow-sm ring-1 ring-[var(--eq-border)]">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-xs font-medium text-[var(--eq-text3)]">{item.name}</div>
                <div className="text-2xl sm:text-3xl font-bold text-[var(--eq-text)]">{fmtDisplayPrice(item)}</div>
              </div>
              <div className={`text-sm font-bold px-2.5 py-1 rounded-lg ${change == null ? 'text-[var(--eq-text3)]' : up ? 'bg-[var(--eq-gain-soft)] text-[var(--eq-gain)]' : 'bg-[var(--eq-loss-soft)] text-[var(--eq-loss)]'}`}>
                {change != null ? `${up ? '+' : ''}${change}%` : '—'}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 4, right: 2, left: 4, bottom: 8 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={up ? '#22c55e' : '#ef4444'} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={up ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} className="" />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  ticks={xTicks}
                  tickFormatter={(t) => formatHeroXTick(activePeriodKey, t)}
                  tick={{ fontSize: 9, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={{ stroke: '#d4d4d8' }}
                  minTickGap={12}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tickCount={4}
                  width={48}
                  tick={{ fontSize: 9, fill: '#71717a' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(y) => formatHeroTickForItem(item, y)}
                />
                <Tooltip
                  content={
                    useQuoteTooltip ? (
                      <QuoteHeroTooltip decimals={dec} periodKey={activePeriodKey} />
                    ) : (
                      <HeroTooltip periodKey={activePeriodKey} />
                    )
                  }
                />
                <Area type="monotone" dataKey="price" stroke={up ? '#16a34a' : '#dc2626'} fill={`url(#${gradId})`} strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}

function StockMarketsOverviewBody({ market, articles, activePeriodKey, activePeriodLabel, orderedIndices, onPromote }) {
  return (
    <div className="space-y-6">
      {orderedIndices?.length > 0 && (
        <OverviewHeroRow
          seriesList={orderedIndices}
          activePeriodKey={activePeriodKey}
          useQuoteTooltip={false}
          gradPrefix="hg-st"
        />
      )}

      {orderedIndices?.length > 0 && (
        <Section title={`Indices — ${activePeriodLabel} change`}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {orderedIndices.slice(2).map((item) => (
              <MarketCard key={item.symbol} item={item} period={activePeriodKey} onClick={() => onPromote(item.symbol, orderedIndices)} />
            ))}
          </div>
        </Section>
      )}

      {market?.sectors && (
        <Section title={`Sector performance — ${activePeriodLabel}`}>
          <SectorHeatmap sectors={market.sectors} period={activePeriodKey} />
        </Section>
      )}

      <NewsFeed articles={articles} title="Equities & macro news" />
    </div>
  );
}

function ForexMarketsBody({ market, articles, activePeriodKey, activePeriodLabel, orderedPairs, onPromote }) {
  if (!orderedPairs.length) {
    return <p className="text-sm text-[var(--eq-text3)]">No FX data in this snapshot.</p>;
  }
  return (
    <div className="space-y-6">
      <OverviewHeroRow
        seriesList={orderedPairs}
        activePeriodKey={activePeriodKey}
        useQuoteTooltip
        gradPrefix="hg-fx"
      />
      <Section title={`All FX pairs — ${activePeriodLabel}`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {orderedPairs.slice(2).map((item) => (
            <MarketCard key={item.symbol} item={item} period={activePeriodKey} onClick={() => onPromote(item.symbol, orderedPairs)} />
          ))}
        </div>
      </Section>
      <div className="max-w-3xl">
        <NewsFeed articles={articles} title="FX & macro news" />
      </div>
    </div>
  );
}

function CommoditiesMarketsBody({ market, articles, activePeriodKey, activePeriodLabel, orderedFutures, onPromote }) {
  if (!orderedFutures.length) {
    return <p className="text-sm text-[var(--eq-text3)]">No commodity futures in this snapshot.</p>;
  }
  return (
    <div className="space-y-6">
      <OverviewHeroRow
        seriesList={orderedFutures}
        activePeriodKey={activePeriodKey}
        useQuoteTooltip
        gradPrefix="hg-cm"
      />
      <Section title={`All futures — ${activePeriodLabel}`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {orderedFutures.slice(2).map((item) => (
            <MarketCard key={item.symbol} item={item} period={activePeriodKey} onClick={() => onPromote(item.symbol, orderedFutures)} />
          ))}
        </div>
      </Section>
      <div className="max-w-3xl">
        <NewsFeed articles={articles} title="Commodity markets news" />
      </div>
    </div>
  );
}

export default function DashboardPanel() {
  const [market, setMarket] = useState(null);
  const [news, setNews] = useState(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [period, setPeriod] = useState('1Y');
  const [arena, setArena] = useState('stocks');
  const [marketOrders, setMarketOrders] = useState(DEFAULT_MARKET_ORDERS);
  const [marketSearch, setMarketSearch] = useState('');
  const [marketSearchOpen, setMarketSearchOpen] = useState(false);
  const [marketSearchError, setMarketSearchError] = useState('');

  useEffect(() => {
    setMarketLoading(true);
    fetchMarketOverview()
      .then((m) => setMarket(m))
      .catch(() => setMarket(null))
      .finally(() => setMarketLoading(false));
  }, []);

  useEffect(() => {
    if (arena === 'crypto') {
      setNews(null);
      return undefined;
    }
    const sym = NEWS_SYMBOLS_BY_ARENA[arena] ?? NEWS_SYMBOLS_BY_ARENA.stocks;
    let cancelled = false;
    fetchNews(sym)
      .then((n) => {
        if (!cancelled) setNews(n);
      })
      .catch(() => {
        if (!cancelled) setNews(null);
      });
    return () => {
      cancelled = true;
    };
  }, [arena]);

  useEffect(() => {
    const onArena = (e) => {
      const a = e.detail?.arena;
      if (a === 'stocks' || a === 'crypto' || a === 'forex' || a === 'commodities') {
        setArena(a);
      }
    };
    window.addEventListener('eq-market-arena', onArena);
    return () => window.removeEventListener('eq-market-arena', onArena);
  }, []);

  const articles = (news?.articles || []).slice(0, 10);
  const activePeriodKey = PERIODS.find((p) => p.key === period)?.key ?? null;
  const activePeriodLabel = PERIODS.find((p) => p.key === period)?.label ?? '1Y';
  const orderedIndices = orderedMarketSeries(market?.indices || [], marketOrders.stocks);
  const orderedFxPairs = orderedMarketSeries(sortForexSeries(market?.currencies || []), marketOrders.forex);
  const orderedCommodityFutures = orderedMarketSeries(sortCommoditySeries(market?.commodities || []), marketOrders.commodities);
  const marketSearchItems = useMemo(() => ([
    ...orderedIndices.map((item) => ({ ...item, arenaId: 'stocks', arenaLabel: 'Stocks' })),
    ...orderedFxPairs.map((item) => ({ ...item, arenaId: 'forex', arenaLabel: 'Forex' })),
    ...orderedCommodityFutures.map((item) => ({ ...item, arenaId: 'commodities', arenaLabel: 'Commodities' })),
  ]), [orderedIndices, orderedFxPairs, orderedCommodityFutures]);
  const marketSearchSuggestions = useMemo(() => {
    const q = marketSearch.trim();
    if (!q) return [];
    return marketSearchItems
      .map((item) => ({ ...item, score: scoreMarketSearchItem(item, q) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [marketSearch, marketSearchItems]);

  const promoteMarketCard = (arenaId, symbol, orderedItems) => {
    const symbols = (orderedItems || []).map((item) => item.symbol);
    const fromIndex = symbols.indexOf(symbol);
    if (fromIndex <= 0) return;
    const next = [...symbols];
    const previousFirst = next[0];
    const previousSecond = next[1];
    next[0] = symbol;
    next[1] = previousFirst;
    if (fromIndex > 1 && previousSecond) next[fromIndex] = previousSecond;
    setMarketOrders((prev) => ({ ...prev, [arenaId]: next }));
  };

  const getOrderedItemsForArena = (arenaId) => {
    if (arenaId === 'stocks') return orderedIndices;
    if (arenaId === 'forex') return orderedFxPairs;
    if (arenaId === 'commodities') return orderedCommodityFutures;
    return [];
  };

  const openMarketSearchItem = (item) => {
    if (!item) return;
    setArena(item.arenaId);
    setMarketSearch(`${item.symbol}`);
    setMarketSearchOpen(false);
    setMarketSearchError('');
    promoteMarketCard(item.arenaId, item.symbol, getOrderedItemsForArena(item.arenaId));
  };

  const submitMarketSearch = (e) => {
    e.preventDefault();
    const best = marketSearchSuggestions[0];
    if (!best) {
      setMarketSearchError(`No market chart found for "${marketSearch.trim()}".`);
      return;
    }
    openMarketSearchItem(best);
  };

  if (arena !== 'crypto' && marketLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--eq-text3)]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading market overview...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--eq-text)]">Markets</h2>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          {arena !== 'crypto' && (
            <form onSubmit={submitMarketSearch} className="relative w-full max-w-xs sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--eq-text3)]" />
              <input
                type="text"
                value={marketSearch}
                onFocus={() => setMarketSearchOpen(true)}
                onChange={(e) => {
                  setMarketSearch(e.target.value);
                  setMarketSearchOpen(true);
                  setMarketSearchError('');
                }}
                onBlur={() => window.setTimeout(() => setMarketSearchOpen(false), 120)}
                placeholder="Search chart..."
                className="h-8 w-full rounded-lg bg-[var(--eq-card)] pl-8 pr-3 text-xs text-[var(--eq-text)] shadow-sm ring-1 ring-[var(--eq-border)] placeholder:text-[var(--eq-text3)] focus:outline-none focus:ring-2 focus:ring-[var(--eq-accent-ring)]"
              />
              {marketSearchOpen && marketSearch.trim() && (
                <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl bg-[var(--eq-card)] shadow-lg ring-1 ring-[var(--eq-border)]">
                  {marketSearchSuggestions.length ? marketSearchSuggestions.map((item) => (
                    <button
                      key={`${item.arenaId}:${item.symbol}`}
                      type="button"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => openMarketSearchItem(item)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--eq-card2)]"
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-[var(--eq-text)]">{item.symbol}</span>
                        <span className="block truncate text-[11px] text-[var(--eq-text3)]">{item.name}</span>
                      </span>
                      <span className="shrink-0 rounded bg-[var(--eq-card2)] px-1.5 py-0.5 text-[9px] text-[var(--eq-text3)]">{item.arenaLabel}</span>
                    </button>
                  )) : (
                    <div className="px-3 py-2 text-xs text-[var(--eq-text3)]">No matching market chart.</div>
                  )}
                </div>
              )}
            </form>
          )}
          {arena !== 'crypto' && <PeriodToolbar period={period} setPeriod={setPeriod} />}
        </div>
      </div>
      {marketSearchError && <div className="text-xs text-[var(--eq-loss)]">{marketSearchError}</div>}

      <div className="flex flex-wrap gap-1 rounded-xl bg-[var(--eq-card2)] p-1 ring-1 ring-[var(--eq-border)]">
        {MARKET_ARENAS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setArena(a.id)}
            className={`min-w-[5.5rem] flex-1 rounded-lg px-2.5 py-2 text-center text-xs font-medium transition-all sm:min-w-[6.5rem] ${
              arena === a.id
                ? 'bg-[var(--eq-card)] text-[var(--eq-text)] shadow-sm ring-1 ring-[var(--eq-border)]'
                : 'text-[var(--eq-text2)] hover:text-[var(--eq-text)]'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {arena === 'crypto' && <CryptoPanel embedded />}

      {arena === 'stocks' && market && (
        <StockMarketsOverviewBody
          market={market}
          articles={articles}
          activePeriodKey={activePeriodKey}
          activePeriodLabel={activePeriodLabel}
          orderedIndices={orderedIndices}
          onPromote={(symbol, orderedItems) => promoteMarketCard('stocks', symbol, orderedItems)}
        />
      )}

      {arena === 'forex' && market && (
        <ForexMarketsBody
          market={market}
          articles={articles}
          activePeriodKey={activePeriodKey}
          activePeriodLabel={activePeriodLabel}
          orderedPairs={orderedFxPairs}
          onPromote={(symbol, orderedItems) => promoteMarketCard('forex', symbol, orderedItems)}
        />
      )}

      {arena === 'commodities' && market && (
        <CommoditiesMarketsBody
          market={market}
          articles={articles}
          activePeriodKey={activePeriodKey}
          activePeriodLabel={activePeriodLabel}
          orderedFutures={orderedCommodityFutures}
          onPromote={(symbol, orderedItems) => promoteMarketCard('commodities', symbol, orderedItems)}
        />
      )}

      {arena !== 'crypto' && !market && !marketLoading && (
        <p className="text-sm text-[var(--eq-text3)]">Market data unavailable.</p>
      )}
    </div>
  );
}

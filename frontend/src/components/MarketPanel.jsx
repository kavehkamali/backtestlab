import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { fetchMarketOverview } from '../api';

function Sparkline({ data, width = 100, height = 32 }) {
  if (!data?.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`).join(' ');
  return (
    <svg width={width} height={height}>
      <polyline fill="none" stroke={data[data.length - 1] >= data[0] ? '#16a34a' : '#dc2626'} strokeWidth="1.5" points={pts} />
    </svg>
  );
}

function Pct({ value }) {
  if (value == null) return <span className="text-zinc-400">—</span>;
  const c = value > 0 ? 'text-emerald-600' : value < 0 ? 'text-red-600' : 'text-zinc-500';
  return <span className={`${c} font-mono text-xs`}>{value > 0 ? '+' : ''}{value}%</span>;
}

function fmtPrice(v) {
  if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 100) return v.toFixed(2);
  return v.toFixed(2);
}

function MarketCard({ item, large }) {
  const up = item.change_1d >= 0;
  return (
    <div className={`bg-white rounded-xl p-4 shadow-sm ring-1 ring-zinc-200/70 hover:ring-zinc-300/80 transition-all ${large ? '' : ''}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{item.name}</div>
          <div className={`text-lg font-bold ${up ? 'text-emerald-600' : 'text-red-600'}`}>
            {fmtPrice(item.price)}
          </div>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${
          up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {item.change_1d > 0 ? '+' : ''}{item.change_1d}%
        </div>
      </div>
      <Sparkline data={item.sparkline} width={large ? 200 : 140} height={36} />
      <div className="flex gap-2 mt-2 flex-wrap">
        {Object.entries(item.changes || {}).map(([k, v]) => (
          <div key={k} className="text-center">
            <div className="text-[8px] text-zinc-500">{k}</div>
            <Pct value={v} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SectorHeatmap({ sectors }) {
  if (!sectors?.length) return null;
  const maxAbs = Math.max(...sectors.map(s => Math.abs(s.change_1d)), 1);
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
      {sectors.map(s => {
        const intensity = Math.min(Math.abs(s.change_1d) / maxAbs, 1);
        const bg = s.change_1d >= 0
          ? `rgba(34, 197, 94, ${0.08 + intensity * 0.35})`
          : `rgba(239, 68, 68, ${0.08 + intensity * 0.35})`;
        return (
          <div key={s.symbol} className="rounded-lg p-3 text-center ring-1 ring-zinc-200/50" style={{ background: bg }}>
            <div className="text-[10px] text-zinc-800 font-medium truncate">{s.name}</div>
            <div className={`text-sm font-bold ${s.change_1d >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {s.change_1d > 0 ? '+' : ''}{s.change_1d}%
            </div>
            <div className="text-[9px] text-zinc-600 mt-0.5">
              YTD: <Pct value={s.changes?.YTD} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

export default function MarketPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMarketOverview()
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-zinc-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading market data...</div>;
  if (error) return <div className="p-4 rounded-xl bg-red-50 text-red-800 ring-1 ring-red-200/80">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-8">
      <Section title="Market Indices">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {data.indices?.map(item => <MarketCard key={item.symbol} item={item} />)}
        </div>
      </Section>

      <Section title="Sector Performance (Today)">
        <SectorHeatmap sectors={data.sectors} />
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Section title="Commodities">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {data.commodities?.map(item => <MarketCard key={item.symbol} item={item} />)}
          </div>
        </Section>
        <Section title="Crypto">
          <div className="grid grid-cols-2 gap-3">
            {data.crypto?.map(item => <MarketCard key={item.symbol} item={item} />)}
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Section title="Bonds & Yields">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {data.bonds?.map(item => <MarketCard key={item.symbol} item={item} />)}
          </div>
        </Section>
        <Section title="Currencies">
          <div className="grid grid-cols-2 gap-3">
            {data.currencies?.map(item => <MarketCard key={item.symbol} item={item} />)}
          </div>
        </Section>
      </div>

      <Section title="Housing & Real Estate">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.housing?.map(item => <MarketCard key={item.symbol} item={item} />)}
        </div>
      </Section>
    </div>
  );
}

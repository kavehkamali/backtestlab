import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, Zap, Shield, ChevronDown, ChevronRight } from 'lucide-react';
import { fetchAiInsight } from '../../api';

function Badge({ children, color }) {
  const colors = {
    green: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20',
    red: 'bg-red-500/15 text-red-600 border-red-500/20',
    yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    blue: 'bg-indigo-500/15 text-indigo-600 border-indigo-500/20',
    gray: 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200/80',
  };
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${colors[color] || colors.gray}`}>{children}</span>;
}

function SignalGauge({ strength, label }) {
  const color = strength >= 65 ? '#22c55e' : strength >= 45 ? '#f59e0b' : '#ef4444';
  const pct = strength / 100;
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="#e4e4e7" strokeWidth="3" />
          <circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${pct * 94.2} 94.2`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-zinc-900">{strength}</span>
        </div>
      </div>
      <div>
        <div className="text-sm font-semibold text-zinc-900">{label}</div>
        <div className="text-[10px] text-zinc-500">Signal Strength</div>
      </div>
    </div>
  );
}

function CollapsibleSection({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-zinc-200/80 last:border-0">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-zinc-50 transition-colors">
        <Icon className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold flex-1">{title}</span>
        {open ? <ChevronDown className="w-3 h-3 text-zinc-600" /> : <ChevronRight className="w-3 h-3 text-zinc-600" />}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

export default function AiInsightPanel({ symbol, timeframe }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    fetchAiInsight(symbol, timeframe)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, timeframe]);

  if (loading) return <div className="flex items-center justify-center h-32 text-zinc-600"><Loader2 className="w-4 h-4 animate-spin mr-2" />Analyzing...</div>;
  if (!data) return <div className="p-4 text-zinc-600 text-xs">Select a symbol to analyze</div>;

  const t = data.trend || {};
  const m = data.momentum || {};
  const v = data.volatility || {};
  const sr = data.support_resistance || {};

  const signalColor = data.signal?.includes('bullish') ? 'green' : data.signal?.includes('bearish') ? 'red' : 'yellow';
  const trendIcon = t.direction?.includes('bullish') ? TrendingUp : t.direction?.includes('bearish') ? TrendingDown : Minus;
  const TrendIcon = trendIcon;

  return (
    <div className="text-[11px] overflow-y-auto h-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-200/80">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-lg font-bold text-zinc-900">{data.symbol}</div>
            <div className="text-zinc-500">${data.price}</div>
          </div>
          <SignalGauge strength={data.signal_strength} label={data.signal_label} />
        </div>
        <p className="text-zinc-600 leading-relaxed text-xs">{data.summary}</p>
      </div>

      {/* Trend */}
      <CollapsibleSection title="Trend" icon={TrendIcon}>
        <div className="flex items-center gap-2 mb-2">
          <Badge color={t.direction?.includes('bullish') ? 'green' : 'red'}>{t.label}</Badge>
        </div>
        <div className="space-y-1 text-[10px]">
          <div className="flex justify-between">
            <span className="text-zinc-500">SMA 20</span>
            <span className={t.above_sma20 ? 'text-emerald-600' : 'text-red-600'}>${t.sma20} {t.above_sma20 ? 'Above' : 'Below'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">SMA 50</span>
            <span className={t.above_sma50 ? 'text-emerald-600' : 'text-red-600'}>${t.sma50} {t.above_sma50 ? 'Above' : 'Below'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">SMA 200</span>
            <span className={t.above_sma200 ? 'text-emerald-600' : 'text-red-600'}>${t.sma200} {t.above_sma200 ? 'Above' : 'Below'}</span>
          </div>
        </div>
      </CollapsibleSection>

      {/* Momentum */}
      <CollapsibleSection title="Momentum" icon={Zap}>
        <div className="space-y-2">
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-zinc-500">RSI (14)</span>
              <Badge color={m.rsi_zone === 'overbought' ? 'red' : m.rsi_zone === 'oversold' ? 'green' : 'gray'}>{m.rsi} — {m.rsi_zone}</Badge>
            </div>
            <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${m.rsi >= 70 ? 'bg-red-400' : m.rsi <= 30 ? 'bg-emerald-400' : 'bg-indigo-400'}`}
                style={{ width: `${m.rsi}%` }} />
            </div>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-zinc-500">MACD</span>
            <span className={m.macd_histogram > 0 ? 'text-emerald-600' : 'text-red-600'}>{m.macd_histogram} ({m.macd_direction})</span>
          </div>
        </div>
      </CollapsibleSection>

      {/* Volatility */}
      <CollapsibleSection title="Volatility" icon={AlertTriangle} defaultOpen={false}>
        <div className="space-y-1 text-[10px]">
          <div className="flex justify-between">
            <span className="text-zinc-500">Regime</span>
            <Badge color={v.regime === 'high' ? 'red' : v.regime === 'low' ? 'green' : 'yellow'}>{v.regime?.toUpperCase()}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">20D Vol</span>
            <span className="text-zinc-600">{v.vol_20d}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">60D Vol</span>
            <span className="text-zinc-600">{v.vol_60d}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">BB Position</span>
            <span className="text-zinc-600">{(v.bb_position * 100).toFixed(0)}%</span>
          </div>
        </div>
      </CollapsibleSection>

      {/* S/R Levels */}
      <CollapsibleSection title="Support / Resistance" icon={Shield} defaultOpen={false}>
        <div className="space-y-1 text-[10px]">
          {sr.resistance?.map((r, i) => (
            <div key={i} className="flex justify-between">
              <span className="text-red-600/60">R{i + 1}</span>
              <span className="text-red-600">${r}</span>
            </div>
          ))}
          <div className="flex justify-between font-semibold">
            <span className="text-zinc-900">Current</span>
            <span className="text-zinc-900">${data.price}</span>
          </div>
          {sr.support?.map((s, i) => (
            <div key={i} className="flex justify-between">
              <span className="text-emerald-600/60">S{i + 1}</span>
              <span className="text-emerald-600">${s}</span>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Patterns & Risks */}
      {data.patterns?.length > 0 && (
        <CollapsibleSection title="Patterns Detected" icon={Zap} defaultOpen={false}>
          <div className="space-y-1.5">
            {data.patterns.map((p, i) => (
              <div key={i} className="text-[10px] text-zinc-600 pl-2 border-l-2 border-indigo-300">{p}</div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {data.risks?.length > 0 && (
        <CollapsibleSection title="Risk Warnings" icon={AlertTriangle} defaultOpen={false}>
          <div className="space-y-1.5">
            {data.risks.map((r, i) => (
              <div key={i} className="text-[10px] text-yellow-400/80 pl-2 border-l-2 border-yellow-500/30">{r}</div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

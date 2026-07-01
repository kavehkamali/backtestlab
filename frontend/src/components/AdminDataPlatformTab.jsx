import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RefreshCw, Database, Shield, ShieldOff, Activity, CheckCircle, XCircle, Server, Layers } from 'lucide-react';
import { fetchAdminDataPlatform } from '../api';

const num = (n) => (n == null ? '—' : Number(n).toLocaleString());
const fmtCap = (n) => {
  if (n == null) return '—';
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${num(Math.round(n))}`;
};
const ago = (s) => {
  if (!s) return '—';
  const t = Date.parse(s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z'));
  if (Number.isNaN(t)) return s;
  const d = Math.max(0, Date.now() - t) / 1000;
  if (d < 60) return `${Math.round(d)}s ago`;
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
};

const CLASS_LABEL = {
  stock: 'Stocks', etf: 'ETFs', crypto: 'Crypto', commodity: 'Commodities',
  index: 'Indices', forex: 'Forex', bond: 'Bonds',
};

function Bar({ done, total, label, sub, running }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : (running ? 0 : 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium text-[var(--eq-text2)] flex items-center gap-1.5">
          {running && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          {label}
        </span>
        <span className="text-[var(--eq-text3)] tabular-nums">{sub}</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--eq-card2)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${running ? 'bg-emerald-500' : 'bg-indigo-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CovStat({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-[var(--eq-border)] bg-[var(--eq-card)] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[var(--eq-text3)] font-semibold">{label}</div>
      <div className="text-xl font-bold text-[var(--eq-text)] mt-0.5 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-[var(--eq-text3)] mt-0.5">{sub}</div>}
    </div>
  );
}

export default function AdminDataPlatformTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [auto, setAuto] = useState(true);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchAdminDataPlatform();
      setData(d);
      setErr('');
    } catch (e) {
      setErr(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!auto) { if (timer.current) clearInterval(timer.current); return; }
    timer.current = setInterval(load, 4000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [auto, load]);

  if (loading && !data) {
    return <div className="flex items-center gap-2 text-sm text-[var(--eq-text3)] py-10 justify-center">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading data platform…</div>;
  }

  const cov = data?.coverage || {};
  const collectors = data?.collectors || [];
  const byClass = data?.by_class || [];
  const runs = data?.runs || [];
  const top = data?.top_equities || [];
  const vpn = data?.vpn || {};
  const running = collectors.filter((c) => c.status === 'running');

  return (
    <div className="space-y-5">
      {/* controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-[var(--eq-text2)]">
          <Database className="w-4 h-4 text-[var(--eq-accent)]" />
          <span className="font-medium">
            {running.length > 0
              ? `${running.length} collector${running.length > 1 ? 's' : ''} running`
              : 'All collectors idle'}
          </span>
          {data?.writer_active && !data?.available && (
            <span className="text-[var(--eq-warn)] text-xs">(warehouse busy — collector holds write lock)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[var(--eq-text3)] cursor-pointer">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Auto-refresh 4s
          </label>
          <button
            type="button"
            onClick={load}
            className="p-1.5 rounded-lg text-[var(--eq-text3)] hover:text-[var(--eq-accent)] hover:bg-[var(--eq-card2)]"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {err && <div className="rounded-lg bg-[var(--eq-loss-soft)] text-[var(--eq-loss)] text-xs px-3 py-2">{err}</div>}

      {/* VPN */}
      <div className={`rounded-xl border p-4 ${vpn.netns_up ? 'border-emerald-200 bg-[var(--eq-gain-soft)]' : vpn.configured ? 'border-amber-200 bg-[var(--eq-warn)]/10' : 'border-[var(--eq-border)] bg-[var(--eq-card)]'}`}>
        <div className="flex items-center gap-2 mb-2">
          {vpn.netns_up ? <Shield className="w-4 h-4 text-[var(--eq-gain)]" /> : <ShieldOff className="w-4 h-4 text-[var(--eq-text3)]" />}
          <span className="font-semibold text-sm text-[var(--eq-text)]">Collector egress VPN</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${vpn.netns_up ? 'bg-emerald-500/15 text-[var(--eq-gain)]' : vpn.configured ? 'bg-amber-500/15 text-[var(--eq-warn)]' : 'bg-[var(--eq-border)] text-[var(--eq-text3)]'}`}>
            {vpn.netns_up ? 'ACTIVE' : vpn.configured ? 'CONFIGURED (netns down)' : 'NOT CONFIGURED'}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div><div className="text-[var(--eq-text3)]">Namespace</div><div className="font-medium text-[var(--eq-text2)]">protonvpn</div></div>
          <div><div className="text-[var(--eq-text3)]">Exit IP</div><div className="font-medium text-[var(--eq-text2)] tabular-nums">{vpn.exit_ip || '—'}</div></div>
          <div><div className="text-[var(--eq-text3)]">Mode</div><div className="font-medium text-[var(--eq-text2)]">{vpn.mode || '—'}</div></div>
          <div><div className="text-[var(--eq-text3)]">Routed</div><div className="font-medium text-[var(--eq-text2)]">{(vpn.routed_collectors || []).length} collectors</div></div>
        </div>
        {(vpn.routed_collectors || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {vpn.routed_collectors.map((c) => (
              <span key={c} className="text-[11px] px-2 py-0.5 rounded bg-[var(--eq-card)] border border-[var(--eq-border)] text-[var(--eq-text2)]">{c}</span>
            ))}
          </div>
        )}
      </div>

      {/* live collector progress */}
      <div className="rounded-xl border border-[var(--eq-border)] bg-[var(--eq-card)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-[var(--eq-accent)]" />
          <span className="font-semibold text-sm text-[var(--eq-text)]">Collector progress</span>
        </div>
        {collectors.length === 0 ? (
          <div className="text-xs text-[var(--eq-text3)]">No collector has reported state yet. Runs on the next timer tick.</div>
        ) : (
          <div className="space-y-3">
            {collectors.map((c) => {
              const isRun = c.status === 'running';
              const sub = isRun
                ? `${num(c.done)}/${num(c.total)}${c.phase ? ` · ${c.phase}` : ''} · ${num(c.rows)} rows`
                : `${c.status} · ${num(c.rows)} rows · ${ago(c.updated_at)}`;
              return <Bar key={c.collector} label={c.collector} sub={sub} done={c.done} total={c.total} running={isRun} />;
            })}
          </div>
        )}
      </div>

      {/* coverage */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Server className="w-4 h-4 text-[var(--eq-accent)]" />
          <span className="font-semibold text-sm text-[var(--eq-text)]">Warehouse coverage</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <CovStat label="Symbols" value={num(cov.symbols)} sub={`${num(cov.cik_symbols)} with SEC CIK`} />
          <CovStat label="Daily bars" value={num(cov.price_rows)} sub={`${num(cov.price_symbols)} symbols`} />
          <CovStat label="Intraday bars" value={num(cov.intraday_bars)} sub={`${num(cov.intraday_symbols)} symbols`} />
          <CovStat label="Company info" value={num(cov.yf_info)} sub="Yahoo profiles" />
          <CovStat label="Fundamentals" value={num(cov.fundamentals_facts)} sub={`${num(cov.filers_with_facts)} filers (XBRL)`} />
          <CovStat label="SEC filings" value={num(cov.filings)} sub="8-K/10-K/10-Q index" />
          <CovStat label="Macro obs" value={num(cov.macro_obs)} sub={`${num(cov.macro_series)} series`} />
        </div>
      </div>

      {/* by asset class */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-4 h-4 text-[var(--eq-accent)]" />
          <span className="font-semibold text-sm text-[var(--eq-text)]">Coverage by asset class</span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-[var(--eq-border)]">
          <table className="w-full text-xs">
            <thead className="bg-[var(--eq-card2)] text-[var(--eq-text3)]">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Class</th>
                <th className="text-right px-3 py-2 font-semibold">Symbols</th>
                <th className="text-right px-3 py-2 font-semibold">Daily px</th>
                <th className="text-right px-3 py-2 font-semibold">Intraday</th>
                <th className="text-right px-3 py-2 font-semibold">Total mkt cap</th>
              </tr>
            </thead>
            <tbody>
              {byClass.map((r) => (
                <tr key={r.asset_class} className="border-t border-[var(--eq-grid)]">
                  <td className="px-3 py-2 font-medium text-[var(--eq-text2)]">{CLASS_LABEL[r.asset_class] || r.asset_class || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(r.symbols)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {num(r.price_covered)}
                    <span className="text-[var(--eq-text3)]"> ({r.symbols ? Math.round((r.price_covered / r.symbols) * 100) : 0}%)</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(r.intraday_covered)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtCap(r.market_cap_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* two-up: recent runs + top equities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <div className="font-semibold text-sm text-[var(--eq-text)] mb-2">Recent runs</div>
          <div className="overflow-x-auto rounded-xl border border-[var(--eq-border)]">
            <table className="w-full text-xs">
              <thead className="bg-[var(--eq-card2)] text-[var(--eq-text3)]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Collector</th>
                  <th className="text-center px-3 py-2 font-semibold">OK</th>
                  <th className="text-right px-3 py-2 font-semibold">Rows</th>
                  <th className="text-right px-3 py-2 font-semibold">Finished</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-3 text-center text-[var(--eq-text3)]">No runs recorded yet</td></tr>
                ) : runs.map((r, i) => (
                  <tr key={i} className="border-t border-[var(--eq-grid)]">
                    <td className="px-3 py-2 font-medium text-[var(--eq-text2)]">{r.collector}</td>
                    <td className="px-3 py-2 text-center">
                      {r.ok ? <CheckCircle className="w-3.5 h-3.5 text-[var(--eq-gain)] inline" /> : <XCircle className="w-3.5 h-3.5 text-[var(--eq-loss)] inline" />}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(r.rows)}</td>
                    <td className="px-3 py-2 text-right text-[var(--eq-text3)]">{ago(r.finished_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="font-semibold text-sm text-[var(--eq-text)] mb-2">Largest covered equities</div>
          <div className="overflow-x-auto rounded-xl border border-[var(--eq-border)] max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--eq-card2)] text-[var(--eq-text3)] sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Symbol</th>
                  <th className="text-left px-3 py-2 font-semibold">Name</th>
                  <th className="text-left px-3 py-2 font-semibold">Class</th>
                  <th className="text-right px-3 py-2 font-semibold">Mkt cap</th>
                </tr>
              </thead>
              <tbody>
                {top.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-3 text-center text-[var(--eq-text3)]">No profiles collected yet</td></tr>
                ) : top.map((r) => (
                  <tr key={r.symbol} className="border-t border-[var(--eq-grid)]">
                    <td className="px-3 py-2 font-semibold text-[var(--eq-text)]">{r.symbol}</td>
                    <td className="px-3 py-2 text-[var(--eq-text2)] truncate max-w-[14rem]">{r.name || '—'}</td>
                    <td className="px-3 py-2 text-[var(--eq-text3)]">{CLASS_LABEL[r.asset_class] || r.asset_class || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtCap(r.market_cap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

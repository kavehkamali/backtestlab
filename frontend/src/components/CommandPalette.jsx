import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, TrendingUp, LayoutGrid, FlaskConical, Moon, Sun, CornerDownLeft } from 'lucide-react';
import { searchSymbols } from '../api';
import { getStoredSiteMode, setStoredSiteMode } from '../siteTheme';

const CLASS_LABEL = { stock: 'Stock', etf: 'ETF', crypto: 'Crypto', commodity: 'Commodity', index: 'Index', forex: 'Forex', bond: 'Bond' };

/** ⌘K command palette: jump to any ticker in the covered universe, switch
 *  tabs, toggle theme — from anywhere. */
export default function CommandPalette({ onOpenSymbol, onGoTab }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);

  // global hotkey
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) { setQ(''); setRows([]); setIdx(0); window.setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  // actions always available
  const actions = [
    { kind: 'tab', id: 'research', label: 'Go to Research', icon: TrendingUp },
    { kind: 'tab', id: 'screener', label: 'Go to Screener', icon: LayoutGrid },
    { kind: 'tab', id: 'backtest', label: 'Go to Backtesting', icon: FlaskConical },
    { kind: 'theme', id: 'theme', label: `Switch to ${getStoredSiteMode() === 'dark' ? 'light' : 'dark'} mode`, icon: getStoredSiteMode() === 'dark' ? Sun : Moon },
  ];
  const filteredActions = q.trim()
    ? actions.filter((a) => a.label.toLowerCase().includes(q.trim().toLowerCase()))
    : actions;

  // ticker search (debounced)
  useEffect(() => {
    if (!open) return;
    const raw = q.trim();
    if (raw.length < 1) { setRows([]); return; }
    let cancel = false;
    const t = window.setTimeout(() => {
      searchSymbols(raw).then((r) => { if (!cancel) { setRows(r.slice(0, 7)); setIdx(0); } }).catch(() => {});
    }, 160);
    return () => { cancel = true; window.clearTimeout(t); };
  }, [q, open]);

  const list = [...rows.map((r) => ({ kind: 'symbol', ...r })), ...filteredActions];

  const run = useCallback((item) => {
    if (!item) return;
    setOpen(false);
    if (item.kind === 'symbol') onOpenSymbol?.(item.symbol);
    else if (item.kind === 'tab') onGoTab?.(item.id);
    else if (item.kind === 'theme') setStoredSiteMode(getStoredSiteMode() === 'dark' ? 'light' : 'dark');
  }, [onOpenSymbol, onGoTab]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(list.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(list[idx]); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-start justify-center pt-[14vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        className="eq-fade-up relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-[var(--eq-border)] bg-[var(--eq-elev)] shadow-[var(--eq-shadow-pop)] mx-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--eq-border)] px-4">
          <Search className="h-4 w-4 shrink-0 text-[var(--eq-text3)]" strokeWidth={1.8} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search any ticker, crypto, commodity… or an action"
            className="h-12 w-full bg-transparent text-[13.5px] text-[var(--eq-text)] outline-none placeholder:text-[var(--eq-text3)]"
          />
          <kbd className="eq-chip shrink-0 !normal-case">esc</kbd>
        </div>
        <div className="max-h-[340px] overflow-y-auto p-1.5">
          {list.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-[var(--eq-text3)]">Type a ticker or company name…</div>
          )}
          {list.map((item, i) => {
            const active = i === idx;
            return (
              <button
                key={item.kind === 'symbol' ? `s-${item.symbol}` : `a-${item.id}`}
                type="button"
                onMouseEnter={() => setIdx(i)}
                onClick={() => run(item)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors ${active ? 'bg-[var(--eq-accent-soft)]' : ''}`}
              >
                {item.kind === 'symbol' ? (
                  <>
                    <span className="eq-num w-20 shrink-0 text-[12.5px] font-semibold text-[var(--eq-text)]">{item.symbol}</span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--eq-text2)]">{item.name}</span>
                    <span className="eq-chip shrink-0">{CLASS_LABEL[item.type] || item.type}</span>
                    {item.covered && <span className="shrink-0 text-[9px] font-bold text-[var(--eq-gain)]">●</span>}
                  </>
                ) : (
                  <>
                    <item.icon className="h-4 w-4 shrink-0 text-[var(--eq-text3)]" strokeWidth={1.8} />
                    <span className="flex-1 text-[12.5px] text-[var(--eq-text2)]">{item.label}</span>
                  </>
                )}
                {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-[var(--eq-text3)]" />}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 border-t border-[var(--eq-border)] px-4 py-2 text-[10px] text-[var(--eq-text3)]">
          <span><kbd className="eq-chip !normal-case">↑↓</kbd> navigate</span>
          <span><kbd className="eq-chip !normal-case">↵</kbd> open</span>
          <span className="ml-auto">● tracked by Equilima</span>
        </div>
      </div>
    </div>
  );
}

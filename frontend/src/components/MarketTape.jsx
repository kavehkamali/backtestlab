import { useEffect, useMemo, useState } from 'react';
import { fetchMacroOverview } from '../api';

/** Slim market tape under the header: key assets, price + 1-month move.
 *  Click an item to open it in Research. Data rides the cached macro payload. */
const TAPE = ['S&P 500', 'Nasdaq', 'VIX', 'US 10Y Yield', 'Gold', 'Oil WTI', 'Copper', 'Bitcoin', 'Ethereum', 'USD Index'];

function usMarketOpen() {
  // US cash session 9:30–16:00 ET, Mon–Fri (holidays ignored — label only).
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 570 && mins < 960;
}

export default function MarketTape({ onOpenSymbol }) {
  const [assets, setAssets] = useState(null);
  const [open, setOpen] = useState(usMarketOpen());

  useEffect(() => {
    let cancel = false;
    fetchMacroOverview().then((d) => {
      if (cancel || !d?.assets) return;
      const byName = new Map(d.assets.map((a) => [a.name, a]));
      setAssets(TAPE.map((n) => byName.get(n)).filter(Boolean));
    }).catch(() => {});
    const id = window.setInterval(() => setOpen(usMarketOpen()), 60_000);
    return () => { cancel = true; window.clearInterval(id); };
  }, []);

  const items = useMemo(() => (assets || []).map((a) => ({
    name: a.name, symbol: a.symbol, price: a.price, chg: a.change_1m,
  })), [assets]);

  if (!items.length) return null;

  return (
    <div className="border-b border-[var(--eq-border)] bg-[var(--eq-bg)]">
      <div className="no-scrollbar mx-auto flex max-w-[1680px] items-center gap-1 overflow-x-auto px-3 sm:px-6">
        {/* market status */}
        <span className="mr-1 flex shrink-0 items-center gap-1.5 py-1.5 pr-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--eq-text3)]">
          <span className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-[var(--eq-gain)]' : 'bg-[var(--eq-text3)]'} ${open ? 'animate-pulse' : ''}`} />
          US {open ? 'open' : 'closed'}
        </span>
        {items.map((it) => (
          <button
            key={it.symbol}
            type="button"
            onClick={() => onOpenSymbol?.(it.symbol)}
            className="group flex shrink-0 items-baseline gap-1.5 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--eq-card2)]"
            title={`${it.name} — open in Research`}
          >
            <span className="text-[10.5px] font-medium text-[var(--eq-text3)] group-hover:text-[var(--eq-text2)]">{it.name}</span>
            <span className="eq-num text-[10.5px] font-semibold text-[var(--eq-text)]">
              {it.price >= 1000 ? Math.round(it.price).toLocaleString() : it.price}
            </span>
            {it.chg != null && (
              <span className={`eq-num text-[10px] font-semibold ${it.chg >= 0 ? 'eq-gain' : 'eq-loss'}`}>
                {it.chg >= 0 ? '+' : ''}{it.chg}%<span className="ml-0.5 font-normal text-[var(--eq-text3)]">1M</span>
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

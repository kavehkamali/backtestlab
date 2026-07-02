import { useState, useRef, useEffect, useCallback } from 'react';
import {
  User,
  LogOut,
  ChevronDown,
  Settings,
  HelpCircle,
  Mail,
  FileText,
  Shield,
  BookOpen,
  Sun,
  Moon,
} from 'lucide-react';
import { getStoredSiteMode, setStoredSiteMode } from '../siteTheme';

const TABS = [
  { id: 'research', label: 'Research', short: 'Research' },
  { id: 'screener', label: 'Screener', short: 'Screen' },
  { id: 'backtest', label: 'Backtesting', short: 'Backtest' },
];

const TAB_PATHS = {
  research: '/',
  screener: '/screener',
  backtest: '/backtest',
};

const SUPPORT_EMAIL = 'info@equilima.com';

function ThemeButton() {
  const [dark, setDark] = useState(() => getStoredSiteMode() === 'dark');
  useEffect(() => {
    const on = () => setDark(getStoredSiteMode() === 'dark');
    window.addEventListener('eq-theme-changed', on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener('eq-theme-changed', on);
      window.removeEventListener('storage', on);
    };
  }, []);
  const toggle = useCallback(() => {
    const next = !dark;
    setDark(next);
    setStoredSiteMode(next ? 'dark' : 'light');
  }, [dark]);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--eq-text3)] transition-colors hover:bg-[var(--eq-card2)] hover:text-[var(--eq-text)]"
    >
      {dark ? <Sun className="h-[15px] w-[15px]" strokeWidth={1.8} /> : <Moon className="h-[15px] w-[15px]" strokeWidth={1.8} />}
    </button>
  );
}

function UserMenu({ user, setActiveTab, onSignOut }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const goAccount = () => {
    setActiveTab('account');
    setOpen(false);
  };

  const itemClass =
    'w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-[var(--eq-text2)] hover:bg-[var(--eq-card2)] hover:text-[var(--eq-text)] rounded-lg transition-colors';

  return (
    <div className="relative z-[200]" ref={rootRef}>
      <button
        type="button"
        id="user-menu-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="user-menu"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 items-center gap-1.5 max-w-[200px] rounded-lg pl-2.5 pr-1.5 transition-colors ${
          open ? 'bg-[var(--eq-card2)] text-[var(--eq-text)]' : 'text-[var(--eq-text2)] hover:bg-[var(--eq-card2)] hover:text-[var(--eq-text)]'
        }`}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--eq-accent-soft)]">
          <User className="h-3 w-3 text-[var(--eq-accent)]" strokeWidth={2} />
        </span>
        <span className="hidden text-xs sm:block truncate">{user.name || user.email}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[var(--eq-text3)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          id="user-menu"
          role="menu"
          aria-labelledby="user-menu-button"
          className="absolute right-0 top-full z-[300] mt-2 w-56 rounded-xl border border-[var(--eq-border)] bg-[var(--eq-elev)] py-1.5 shadow-[var(--eq-shadow-pop)]"
        >
          <div className="border-b border-[var(--eq-border)] px-3 pb-2 pt-1">
            <p className="eq-label">Signed in</p>
            <p className="truncate text-xs font-medium text-[var(--eq-text)]" title={user.email}>
              {user.email}
            </p>
          </div>

          <div className="p-1">
            <button type="button" role="menuitem" className={itemClass} onClick={goAccount}>
              <Settings className="h-4 w-4 text-[var(--eq-text3)]" strokeWidth={1.8} />
              Account & security
            </button>
            <a
              role="menuitem"
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Equilima — Help')}`}
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              <HelpCircle className="h-4 w-4 text-[var(--eq-text3)]" strokeWidth={1.8} />
              Help & support
            </a>
            <a
              role="menuitem"
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Equilima — Contact')}`}
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              <Mail className="h-4 w-4 text-[var(--eq-text3)]" strokeWidth={1.8} />
              Contact us
            </a>
          </div>

          <div className="mx-2 border-t border-[var(--eq-border)]" />
          <div className="p-1">
            <a
              role="menuitem"
              href="/privacy.html"
              target="_blank"
              rel="noopener noreferrer"
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              <Shield className="h-4 w-4 text-[var(--eq-text3)]" strokeWidth={1.8} />
              Privacy policy
            </a>
            <a
              role="menuitem"
              href="/terms.html"
              target="_blank"
              rel="noopener noreferrer"
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              <FileText className="h-4 w-4 text-[var(--eq-text3)]" strokeWidth={1.8} />
              Terms of service
            </a>
          </div>

          <div className="mx-2 border-t border-[var(--eq-border)]" />
          <div className="p-1">
            <button
              type="button"
              role="menuitem"
              className={`${itemClass} !text-[var(--eq-loss)] hover:!bg-[var(--eq-loss-soft)]`}
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              <LogOut className="h-4 w-4" strokeWidth={1.8} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Header({
  activeTab,
  setActiveTab,
  user,
  onSignIn,
  onSignUp,
  onSignOut,
  onOpenLearn,
}) {
  const handleTab = (id) => {
    setActiveTab(id);
    const path = TAB_PATHS[id];
    if (path && window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
  };

  const openLearn = () => {
    if (onOpenLearn) onOpenLearn();
  };

  const navItem = (tab, compact = false) => {
    const active = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        onClick={() => handleTab(tab.id)}
        className={`relative px-3 py-2 font-medium transition-colors ${compact ? 'text-[11.5px] px-2' : 'text-[13px]'} ${
          active ? 'text-[var(--eq-text)]' : 'text-[var(--eq-text3)] hover:text-[var(--eq-text2)]'
        }`}
      >
        {compact ? tab.short : tab.label}
        {/* Active underline indicator */}
        <span
          className={`pointer-events-none absolute inset-x-2 -bottom-px h-[2px] rounded-full transition-all duration-200 ${
            active ? 'bg-[var(--eq-accent)] opacity-100' : 'opacity-0'
          }`}
        />
      </button>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--eq-border)] bg-[color-mix(in_srgb,var(--eq-bg)_82%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex h-[52px] max-w-[1680px] items-center justify-between gap-2 px-3 sm:px-6">
        <button
          type="button"
          onClick={() => handleTab('research')}
          className="flex shrink-0 items-center gap-2 rounded-md px-1 py-0.5 text-left transition hover:opacity-80 focus:outline-none"
          aria-label="Go to Research"
        >
          <img src="/logo-mark.svg" alt="" width={22} height={22} className="h-[22px] w-[22px] shrink-0" aria-hidden />
          <h1 className="text-[15px] font-semibold tracking-tight text-[var(--eq-text)]">Equilima</h1>
        </button>

        {/* Desktop nav — underline indicator */}
        <nav className="hidden h-full items-center md:flex">
          {TABS.map((t) => navItem(t))}
          {onOpenLearn && (
            <button
              type="button"
              onClick={openLearn}
              className="ml-1 inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-[var(--eq-text3)] transition-colors hover:text-[var(--eq-text2)]"
            >
              <BookOpen className="h-3.5 w-3.5" strokeWidth={1.8} />
              Blog
            </button>
          )}
        </nav>

        {/* Mobile nav */}
        <nav className="no-scrollbar mx-1 min-w-0 flex-1 overflow-x-auto md:hidden">
          <div className="flex w-max items-center">
            {TABS.map((t) => navItem(t, true))}
            {onOpenLearn && (
              <button
                type="button"
                onClick={openLearn}
                className="whitespace-nowrap px-2 py-2 text-[11.5px] font-medium text-[var(--eq-text3)]"
              >
                Blog
              </button>
            )}
          </div>
        </nav>

        <div className="relative z-[200] flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            className="hidden h-8 items-center gap-2 rounded-lg border border-[var(--eq-border)] px-2.5 text-[11px] text-[var(--eq-text3)] transition-colors hover:border-[var(--eq-border2)] hover:text-[var(--eq-text2)] lg:flex"
            title="Command palette"
          >
            Search anything
            <kbd className="rounded border border-[var(--eq-border)] bg-[var(--eq-card2)] px-1 py-px font-[inherit] text-[9.5px]">⌘K</kbd>
          </button>
          <ThemeButton />
          {user ? (
            <UserMenu user={user} setActiveTab={setActiveTab} onSignOut={onSignOut} />
          ) : (
            <>
              <button
                onClick={onSignIn}
                className="hidden h-8 items-center rounded-lg px-2.5 text-xs font-medium text-[var(--eq-text2)] transition-colors hover:bg-[var(--eq-card2)] hover:text-[var(--eq-text)] sm:flex"
              >
                Sign in
              </button>
              <button
                onClick={onSignUp}
                className="flex h-8 items-center rounded-lg bg-[var(--eq-text)] px-3 text-xs font-semibold text-[var(--eq-bg)] transition-opacity hover:opacity-85"
              >
                Sign up
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

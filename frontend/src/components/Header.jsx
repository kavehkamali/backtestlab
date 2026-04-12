import { useState, useRef, useEffect } from 'react';
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
} from 'lucide-react';

const TABS = [
  { id: 'agent', label: 'AI Agent', short: 'AI' },
  { id: 'research', label: 'Research', short: 'Research' },
  { id: 'crypto', label: 'Crypto', short: 'Crypto' },
  { id: 'markets', label: 'Markets', short: 'Markets' },
  { id: 'screener', label: 'Screener', short: 'Screen' },
  { id: 'terminal', label: 'Terminal', short: 'Terminal' },
  { id: 'backtest', label: 'Backtesting', short: 'Backtest' },
];

const SUPPORT_EMAIL = 'info@equilima.com';

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
    'w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-50 rounded-lg transition-colors';

  return (
    <div className="relative z-[200]" ref={rootRef}>
      <button
        type="button"
        id="user-menu-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="user-menu"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 max-w-[200px] pl-2 pr-1.5 py-1.5 rounded-lg transition-colors ${
          open
            ? 'bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200/80'
            : 'bg-zinc-50 text-zinc-700 hover:bg-zinc-100 ring-1 ring-transparent hover:ring-zinc-200/60'
        }`}
      >
        <User className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
        <span className="text-xs truncate">{user.name || user.email}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          id="user-menu"
          role="menu"
          aria-labelledby="user-menu-button"
          className="absolute right-0 top-full mt-1.5 w-56 py-1.5 rounded-xl bg-white shadow-lg shadow-zinc-900/10 ring-1 ring-zinc-200/70 z-[300]"
        >
          <div className="px-3 py-2 border-b border-zinc-100">
            <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Signed in</p>
            <p className="text-xs text-zinc-900 font-medium truncate" title={user.email}>
              {user.email}
            </p>
          </div>

          <div className="p-1">
            <button type="button" role="menuitem" className={itemClass} onClick={goAccount}>
              <Settings className="w-4 h-4 text-zinc-400" />
              Account & security
            </button>
            <a
              role="menuitem"
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Equilima — Help')}`}
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              <HelpCircle className="w-4 h-4 text-zinc-400" />
              Help & support
            </a>
            <a
              role="menuitem"
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Equilima — Contact')}`}
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              <Mail className="w-4 h-4 text-zinc-400" />
              Contact us
            </a>
          </div>

          <div className="border-t border-zinc-100 mx-2" />
          <div className="p-1">
            <a
              role="menuitem"
              href="/privacy.html"
              target="_blank"
              rel="noopener noreferrer"
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              <Shield className="w-4 h-4 text-zinc-400" />
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
              <FileText className="w-4 h-4 text-zinc-400" />
              Terms of service
            </a>
          </div>

          <div className="border-t border-zinc-100 mx-2" />
          <div className="p-1">
            <button
              type="button"
              role="menuitem"
              className={`${itemClass} text-red-600 hover:text-red-700 hover:bg-red-50`}
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Header({ activeTab, setActiveTab, user, onSignIn, onSignUp, onSignOut, onOpenLearn }) {
  const handleTab = (id) => {
    setActiveTab(id);
  };

  const openLearn = () => {
    if (onOpenLearn) onOpenLearn();
  };

  return (
    <header className="border-b border-zinc-200/50 bg-white/90 backdrop-blur-md overflow-visible relative z-40 shadow-sm shadow-zinc-900/[0.02]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <img
            src="/logo-mark.svg"
            alt=""
            width={24}
            height={24}
            className="w-5 h-5 sm:w-6 sm:h-6 shrink-0"
            aria-hidden
          />
          <h1 className="text-base sm:text-lg font-semibold tracking-tight text-zinc-900">Equilima</h1>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          <div className="flex gap-0.5 bg-zinc-100/80 rounded-lg p-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTab(tab.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-zinc-200/60'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {onOpenLearn && (
            <button
              type="button"
              onClick={openLearn}
              className="ml-1 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm font-medium text-zinc-600 hover:text-indigo-700 hover:bg-zinc-50 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Learn
            </button>
          )}
        </nav>

        <nav className="md:hidden flex-1 min-w-0 overflow-x-auto no-scrollbar mx-1">
          <div className="flex gap-0.5 bg-zinc-100/80 rounded-lg p-0.5 w-max items-center">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTab(tab.id)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-zinc-500'
                }`}
              >
                {tab.short}
              </button>
            ))}
            {onOpenLearn && (
              <button
                type="button"
                onClick={openLearn}
                className="px-2 py-1 rounded-md text-[11px] font-medium text-zinc-500 whitespace-nowrap"
              >
                Learn
              </button>
            )}
          </div>
        </nav>

        <div className="flex items-center gap-1.5 shrink-0 relative z-[200]">
          {user ? (
            <UserMenu user={user} setActiveTab={setActiveTab} onSignOut={onSignOut} />
          ) : (
            <>
              <button onClick={onSignIn} className="hidden sm:block px-2 py-1.5 rounded-lg text-xs font-medium text-zinc-600 hover:text-zinc-900">
                Sign In
              </button>
              <button
                onClick={onSignUp}
                className="px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm"
              >
                Sign Up
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

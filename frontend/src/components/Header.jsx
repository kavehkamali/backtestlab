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
} from 'lucide-react';

const TABS = [
  { id: 'agent', label: 'AI Agent', short: 'AI' },
  { id: 'research', label: 'Research', short: 'Research' },
  { id: 'dashboard', label: 'Dashboard', short: 'Dash' },
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
    'w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm text-gray-200 hover:bg-white/[0.06] rounded-lg transition-colors';

  return (
    <div className="relative z-[200]" ref={rootRef}>
      <button
        type="button"
        id="user-menu-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="user-menu"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 max-w-[200px] pl-2 pr-1.5 py-1.5 rounded-lg border transition-colors ${
          open
            ? 'bg-white/10 border-white/15 text-white'
            : 'bg-white/5 border-white/10 text-gray-200 hover:bg-white/[0.08] hover:border-white/15'
        }`}
      >
        <User className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span className="text-xs truncate">{user.name || user.email}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          id="user-menu"
          role="menu"
          aria-labelledby="user-menu-button"
          className="absolute right-0 top-full mt-1.5 w-56 py-1.5 rounded-xl bg-[#12121a] border border-white/10 shadow-xl shadow-black/40 z-[300]"
        >
          <div className="px-3 py-2 border-b border-white/[0.06]">
            <p className="text-[11px] text-gray-500 uppercase tracking-wide">Signed in</p>
            <p className="text-xs text-white font-medium truncate" title={user.email}>
              {user.email}
            </p>
          </div>

          <div className="p-1">
            <button type="button" role="menuitem" className={itemClass} onClick={goAccount}>
              <Settings className="w-4 h-4 text-gray-400" />
              Account & security
            </button>
            <a
              role="menuitem"
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Equilima — Help')}`}
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              <HelpCircle className="w-4 h-4 text-gray-400" />
              Help & support
            </a>
            <a
              role="menuitem"
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Equilima — Contact')}`}
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              <Mail className="w-4 h-4 text-gray-400" />
              Contact us
            </a>
          </div>

          <div className="border-t border-white/[0.06] mx-2" />
          <div className="p-1">
            <a
              role="menuitem"
              href="/privacy.html"
              target="_blank"
              rel="noopener noreferrer"
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              <Shield className="w-4 h-4 text-gray-400" />
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
              <FileText className="w-4 h-4 text-gray-400" />
              Terms of service
            </a>
          </div>

          <div className="border-t border-white/[0.06] mx-2" />
          <div className="p-1">
            <button
              type="button"
              role="menuitem"
              className={`${itemClass} text-red-300 hover:text-red-200 hover:bg-red-500/10`}
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

export default function Header({ activeTab, setActiveTab, user, onSignIn, onSignUp, onSignOut }) {
  const handleTab = (id) => {
    setActiveTab(id);
  };

  return (
    <header className="border-b border-white/5 overflow-visible relative z-40">
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
          <h1 className="text-base sm:text-lg font-semibold tracking-tight text-white">Equilima</h1>
        </div>

        <nav className="hidden md:flex gap-0.5 bg-white/5 rounded-lg p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTab(tab.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <nav className="md:hidden flex-1 min-w-0 overflow-x-auto no-scrollbar mx-1">
          <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5 w-max">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTab(tab.id)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-500'
                }`}
              >
                {tab.short}
              </button>
            ))}
          </div>
        </nav>

        <div className="flex items-center gap-1.5 shrink-0 relative z-[200]">
          {user ? (
            <UserMenu user={user} setActiveTab={setActiveTab} onSignOut={onSignOut} />
          ) : (
            <>
              <button onClick={onSignIn} className="hidden sm:block px-2 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white">
                Sign In
              </button>
              <button
                onClick={onSignUp}
                className="px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500"
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

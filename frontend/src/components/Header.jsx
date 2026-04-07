import { useState } from 'react';
import { BarChart3, User, LogOut, Menu, X } from 'lucide-react';

const TABS = [
  { id: 'agent', label: 'AI Agent', short: 'AI' },
  { id: 'dashboard', label: 'Dashboard', short: 'Dash' },
  { id: 'screener', label: 'Screener', short: 'Screen' },
  { id: 'research', label: 'Research', short: 'Research' },
  { id: 'terminal', label: 'Terminal', short: 'Terminal' },
  { id: 'backtest', label: 'Backtesting', short: 'Backtest' },
  { id: 'account', label: 'Account', short: 'Account', authOnly: true },
];

export default function Header({ activeTab, setActiveTab, user, onSignIn, onSignUp, onSignOut }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleTab = (id) => {
    setActiveTab(id);
    setMenuOpen(false);
  };

  return (
    <header className="border-b border-white/5 overflow-hidden">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex items-center justify-between gap-2">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400" />
          <h1 className="text-base sm:text-lg font-semibold tracking-tight text-white">Equilima</h1>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex gap-0.5 bg-white/5 rounded-lg p-1">
          {TABS.filter(t => !t.authOnly || user).map(tab => (
            <button key={tab.id} onClick={() => handleTab(tab.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:text-gray-200'
              }`}>{tab.label}</button>
          ))}
        </nav>

        {/* Mobile nav - scrollable tabs */}
        <nav className="md:hidden flex-1 min-w-0 overflow-x-auto no-scrollbar mx-1">
          <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5 w-max">
            {TABS.filter(t => !t.authOnly || user).map(tab => (
              <button key={tab.id} onClick={() => handleTab(tab.id)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-500'
                }`}>{tab.short}</button>
            ))}
          </div>
        </nav>

        {/* Auth */}
        <div className="flex items-center gap-1 shrink-0">
          {user ? (
            <>
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/5">
                <User className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs text-gray-300 max-w-[80px] truncate">{user.name || user.email}</span>
              </div>
              <button onClick={onSignOut} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5" title="Sign out">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button onClick={onSignIn} className="hidden sm:block px-2 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white">Sign In</button>
              <button onClick={onSignUp} className="px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500">Sign Up</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

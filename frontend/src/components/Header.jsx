import { BarChart3, User, LogOut } from 'lucide-react';

export default function Header({ activeTab, setActiveTab, user, onSignIn, onSignUp, onSignOut }) {
  return (
    <header className="border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-indigo-400" />
          <h1 className="text-lg font-semibold tracking-tight text-white">
            Equilima
          </h1>
        </div>

        <nav className="flex gap-0.5 bg-white/5 rounded-lg p-1">
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'screener', label: 'Screener' },
            { id: 'research', label: 'Research' },
            { id: 'terminal', label: 'Terminal' },
            { id: 'backtest', label: 'Backtesting' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-indigo-500/20 text-indigo-300'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Auth */}
        <div className="flex items-center gap-2">
          {user ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5">
                <User className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs text-gray-300">{user.name || user.email}</span>
              </div>
              <button onClick={onSignOut}
                className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors" title="Sign out">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button onClick={onSignIn}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white transition-colors">
                Sign In
              </button>
              <button onClick={onSignUp}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">
                Sign Up
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

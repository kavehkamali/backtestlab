import { useState, useEffect, useCallback } from 'react';
import { fetchStrategies, compareStrategies, getStoredUser, signout, checkInteraction } from './api';
import DashboardPanel from './components/DashboardPanel';
import ComparePanel from './components/ComparePanel';
import ScreenerPanel from './components/ScreenerPanel';
import ResearchPanel from './components/ResearchPanel';
import TerminalPanel from './components/terminal/TerminalPanel';
import Header from './components/Header';
import AuthModal from './components/AuthModal';

function App() {
  const [strategies, setStrategies] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [compareResults, setCompareResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Auth state
  const [user, setUser] = useState(() => getStoredUser());
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState('signup');
  const [authMessage, setAuthMessage] = useState('');

  // Interaction tracking
  const [interactions, setInteractions] = useState(0);

  useEffect(() => {
    fetchStrategies().then(d => setStrategies(d.strategies)).catch(() => {});
  }, []);

  // Track interactions on tab switch and periodically
  const trackInteraction = useCallback(async () => {
    if (user) return; // signed-in users bypass
    try {
      const data = await checkInteraction();
      setInteractions(data.count);
      if (data.exceeded) {
        setAuthMessage('You\'ve reached the free daily limit. Sign up for unlimited access!');
        setAuthMode('signup');
        setShowAuth(true);
      }
    } catch {}
  }, [user]);

  // Track on tab change
  useEffect(() => {
    trackInteraction();
  }, [activeTab, trackInteraction]);

  const handleAuth = (userData) => {
    setUser(userData);
    setShowAuth(false);
    setAuthMessage('');
  };

  const handleSignout = () => {
    signout();
    setUser(null);
  };

  const handleCompare = async (params) => {
    setLoading(true);
    setError(null);
    setCompareResults(null);
    try {
      const res = await compareStrategies(params);
      setCompareResults(res.results);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const isTerminal = activeTab === 'terminal';

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onSignIn={() => { setAuthMode('signin'); setAuthMessage(''); setShowAuth(true); }}
        onSignUp={() => { setAuthMode('signup'); setAuthMessage(''); setShowAuth(true); }}
        onSignOut={handleSignout}
      />

      {isTerminal && <TerminalPanel />}

      {!isTerminal && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 pb-12 mt-4">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}
          {activeTab === 'dashboard' && <DashboardPanel />}
          {activeTab === 'screener' && <ScreenerPanel />}
          {activeTab === 'research' && <ResearchPanel />}
          {activeTab === 'backtest' && (
            <ComparePanel
              strategies={strategies}
              onCompare={handleCompare}
              results={compareResults}
              loading={loading}
            />
          )}
        </main>
      )}

      {/* Auth modal */}
      {showAuth && (
        <AuthModal
          mode={authMode}
          message={authMessage}
          onClose={() => setShowAuth(false)}
          onAuth={handleAuth}
        />
      )}
    </div>
  );
}

export default App;

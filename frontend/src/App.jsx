import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchStrategies, compareStrategies, getStoredUser, signout, checkInteraction, trackPageView } from './api';
import DashboardPanel from './components/DashboardPanel';
import ComparePanel from './components/ComparePanel';
import ScreenerPanel from './components/ScreenerPanel';
import ResearchPanel from './components/ResearchPanel';
import TerminalPanel from './components/terminal/TerminalPanel';
import Header from './components/Header';
import AuthModal from './components/AuthModal';
import AdminPanel from './components/AdminPanel';
import AgentPanel from './components/AgentPanel';
import ConsentBanner from './components/ConsentBanner';
import AccountPanel from './components/AccountPanel';
import { bootstrapAgentE2EE, fetchAgentE2EEMeta, rewrapAgentE2EE } from './api';
import { createAndWrapDek, unwrapDek, wrapExistingDek } from './e2ee';

function App() {
  const [strategies, setStrategies] = useState([]);
  const [isAdmin, setIsAdmin] = useState(window.location.hash === '#admin');
  const [activeTab, setActiveTab] = useState('agent');

  // Listen for hash changes
  useEffect(() => {
    const handler = () => setIsAdmin(window.location.hash === '#admin');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  const [compareResults, setCompareResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Auth state
  const [user, setUser] = useState(() => getStoredUser());
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState('signup');
  const [authMessage, setAuthMessage] = useState('');
  const [agentDek, setAgentDek] = useState(null); // CryptoKey (in-memory only)

  // Interaction tracking
  const [forceAuth, setForceAuth] = useState(false);
  const [softPromptShown, setSoftPromptShown] = useState(false);

  useEffect(() => {
    fetchStrategies().then(d => setStrategies(d.strategies)).catch(() => {});
  }, []);

  // Track interactions on tab switch
  const trackInteraction = useCallback(async () => {
    if (user) return;
    try {
      const data = await checkInteraction();
      if (data.force_signup) {
        setForceAuth(true);
        setAuthMessage('Create a free account to continue using Equilima');
        setAuthMode('signup');
        setShowAuth(true);
      } else if (data.show_prompt && !softPromptShown) {
        setSoftPromptShown(true);
        setAuthMessage('Sign up for unlimited access — it\'s free!');
        setAuthMode('signup');
        setShowAuth(true);
      }
    } catch {}
  }, [user, softPromptShown]);

  // Track page views
  useEffect(() => {
    trackPageView(activeTab);
  }, [activeTab]);

  // Only track auth interactions after user interacts (not on first page load)
  const hasInteracted = useRef(false);
  useEffect(() => {
    if (!hasInteracted.current) {
      hasInteracted.current = true;
      return;
    }
    trackInteraction();
  }, [activeTab, trackInteraction]);

  const handleAuth = async (userData, ctx = {}) => {
    setUser(userData);
    setShowAuth(false);
    setAuthMessage('');

    // Unlock/initialize agent E2EE using the password the user just entered.
    const password = ctx?.password;
    if (!userData?.id || !password) return;
    try {
      const metaResp = await fetchAgentE2EEMeta().catch(() => ({ has_e2ee: false }));
      if (!metaResp?.has_e2ee) {
        const { dek, meta } = await createAndWrapDek(password);
        await bootstrapAgentE2EE(meta);
        setAgentDek(dek);
      } else {
        const dek = await unwrapDek(password, metaResp.meta);
        setAgentDek(dek);
      }
    } catch {
      // If unlocking fails, keep app usable; history will be unavailable.
      setAgentDek(null);
    }
  };

  const handleSignout = () => {
    signout();
    setUser(null);
    setAgentDek(null);
    setShowAuth(false);
    setForceAuth(false);
    setSoftPromptShown(true); // don't show prompt again after signout
  };

  const handlePasswordChanged = async (current_password, new_password) => {
    if (!user?.id) return;
    // Rewrap DEK so chat history stays readable after password change.
    const metaResp = await fetchAgentE2EEMeta().catch(() => null);
    if (!metaResp?.has_e2ee) return;
    const dek = await unwrapDek(current_password, metaResp.meta);
    const newMeta = await wrapExistingDek(dek, new_password);
    await rewrapAgentE2EE(newMeta);
    setAgentDek(dek); // keep unlocked for this session
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

  // Admin panel — hidden route via #admin
  if (isAdmin) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] overflow-x-hidden">
        <header className="border-b border-white/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/logo-mark.svg"
                alt=""
                width={24}
                height={24}
                className="w-6 h-6 shrink-0"
                aria-hidden
              />
              <h1 className="text-lg font-semibold tracking-tight text-white">Equilima Admin</h1>
            </div>
            <a href="/" className="text-xs text-gray-500 hover:text-white">Back to site</a>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-3 sm:px-6 pb-8 sm:pb-12 mt-2 sm:mt-4">
          <AdminPanel />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-x-hidden">
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
        <main
          className={
            activeTab === 'agent'
              ? 'w-full max-w-none px-0 pb-0 mt-2 sm:mt-4 min-h-0'
              : 'max-w-7xl mx-auto px-3 sm:px-6 pb-8 sm:pb-12 mt-2 sm:mt-4'
          }
        >
          {error && (
            <div
              className={
                activeTab === 'agent'
                  ? 'max-w-7xl mx-auto px-3 sm:px-6 mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm'
                  : 'mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm'
              }
            >
              {error}
            </div>
          )}
          {/* Agent: full-width ChatGPT-style shell; other tabs stay in max-w-7xl */}
          <div
            className={
              activeTab === 'agent'
                ? 'block w-full h-[calc(100vh-52px)] sm:h-[calc(100vh-60px)] min-h-0'
                : 'hidden'
            }
          >
            <AgentPanel
              onNavigate={(tab, ticker) => {
                setActiveTab(tab);
                if (ticker) window.__equilima_nav_ticker = ticker;
              }}
              user={user}
              dek={agentDek}
              onRequireUnlock={() => {
                setAuthMode('signin');
                setAuthMessage('Sign in again to unlock encrypted chat history');
                setShowAuth(true);
              }}
            />
          </div>
          <div className={activeTab === 'dashboard' ? '' : 'hidden'}>
            <DashboardPanel />
          </div>
          <div className={activeTab === 'screener' ? '' : 'hidden'}>
            <ScreenerPanel />
          </div>
          <div className={activeTab === 'research' ? '' : 'hidden'}>
            <ResearchPanel />
          </div>
          <div className={activeTab === 'account' ? '' : 'hidden'}>
            {user && <AccountPanel onSignedOut={handleSignout} onPasswordChanged={handlePasswordChanged} />}
          </div>
          <div className={activeTab === 'backtest' ? '' : 'hidden'}>
            <ComparePanel
              strategies={strategies}
              onCompare={handleCompare}
              results={compareResults}
              loading={loading}
            />
          </div>
        </main>
      )}

      {/* Auth modal */}
      {showAuth && (
        <AuthModal
          mode={authMode}
          message={authMessage}
          forced={forceAuth}
          onClose={forceAuth ? undefined : () => setShowAuth(false)}
          onAuth={handleAuth}
        />
      )}

      <ConsentBanner />
    </div>
  );
}

export default App;

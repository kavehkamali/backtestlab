import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchStrategies, compareStrategies, getStoredUser, signout, checkInteraction, trackPageView } from './api';
import DashboardPanel from './components/DashboardPanel';
import ScreenerPanel from './components/ScreenerPanel';
import ResearchPanel from './components/ResearchPanel';
import Header from './components/Header';
import AuthModal from './components/AuthModal';
import AdminPanel from './components/AdminPanel';
import AgentPanel from './components/AgentPanel';
import AiPicksPanel from './components/AiPicksPanel';
import ConsentBanner from './components/ConsentBanner';
import AccountPanel from './components/AccountPanel';
import LearnLayout from './components/LearnLayout';
import ThemeToggle from './components/ThemeToggle';
import { getLearnRoute } from './learnNavigation';
import { applyDocumentTheme, syncSiteThemeUserMeta } from './siteTheme';
import { bootstrapAgentE2EE, fetchAgentE2EEMeta, rewrapAgentE2EE } from './api';
import { createAndWrapDek, unwrapDek, wrapExistingDek } from './e2ee';

function App() {
  const [strategies, setStrategies] = useState([]);
  const [isAdmin, setIsAdmin] = useState(window.location.hash === '#admin');
  const [learnRoute, setLearnRoute] = useState(() => getLearnRoute());
  const [activeTab, setActiveTab] = useState('agent');

  // Listen for hash changes
  useEffect(() => {
    const handler = () => setIsAdmin(window.location.hash === '#admin');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  useEffect(() => {
    const syncLearn = () => setLearnRoute(getLearnRoute());
    window.addEventListener('popstate', syncLearn);
    window.addEventListener('hashchange', syncLearn);
    return () => {
      window.removeEventListener('popstate', syncLearn);
      window.removeEventListener('hashchange', syncLearn);
    };
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

  useEffect(() => {
    syncSiteThemeUserMeta(user);
  }, [user]);

  useEffect(() => {
    if (isAdmin) applyDocumentTheme({ forceLight: true });
    else applyDocumentTheme({ forceLight: false });
  }, [isAdmin]);

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
    try {
      const u = getStoredUser();
      if (u?.id) {
        localStorage.removeItem(`eq_agent_chat_sessions_plain_v1:${u.id}`);
      }
    } catch {}
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

  // Learn hub (/learn, /learn/:slug, or #/learn …) — SEO articles
  if (learnRoute && !isAdmin) {
    return (
      <div className="min-h-screen bg-zinc-50 text-zinc-900 overflow-x-hidden dark:bg-zinc-950 dark:text-zinc-100">
        <LearnLayout route={learnRoute} setActiveTab={setActiveTab} />
        {showAuth && (
          <AuthModal
            mode={authMode}
            message={authMessage}
            forced={forceAuth}
            onClose={forceAuth ? undefined : () => setShowAuth(false)}
            onAuth={handleAuth}
          />
        )}
        <ThemeToggle />
        <ConsentBanner />
      </div>
    );
  }

  // Admin panel — hidden route via #admin
  if (isAdmin) {
    return (
      <div className="min-h-screen bg-zinc-50 overflow-x-auto text-zinc-900">
        <header className="border-b border-zinc-200/60 bg-white/80 backdrop-blur-sm">
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
              <h1 className="text-lg font-semibold tracking-tight text-zinc-900">Equilima Admin</h1>
            </div>
            <a href="/" className="text-xs text-zinc-500 hover:text-zinc-900">Back to site</a>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-3 sm:px-6 pb-8 sm:pb-12 mt-2 sm:mt-4">
          <AdminPanel />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 overflow-x-hidden dark:bg-zinc-950 dark:text-zinc-100">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onSignIn={() => { setAuthMode('signin'); setAuthMessage(''); setShowAuth(true); }}
        onSignUp={() => { setAuthMode('signup'); setAuthMessage(''); setShowAuth(true); }}
        onSignOut={handleSignout}
        onOpenLearn={() => {
          window.history.pushState({}, '', '/learn');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }}
      />

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
                  ? 'max-w-7xl mx-auto px-3 sm:px-6 mb-4 p-3 rounded-xl bg-red-50 text-red-800 text-sm ring-1 ring-red-200/80 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900/50'
                  : 'mb-4 p-3 rounded-xl bg-red-50 text-red-800 text-sm ring-1 ring-red-200/80 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900/50'
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
                const t = ticker ? String(ticker).trim().toUpperCase() : '';
                if (tab === 'terminal' || tab === 'backtest') {
                  setActiveTab('research');
                  window.dispatchEvent(new CustomEvent('eq-research-subtab', { detail: { sub: tab } }));
                  if (t) {
                    window.dispatchEvent(new CustomEvent('eq-agent-open-ticker', { detail: { tab, ticker: t } }));
                  }
                  return;
                }
                if (tab === 'research') {
                  setActiveTab('research');
                  window.dispatchEvent(new CustomEvent('eq-research-subtab', { detail: { sub: 'fundamentals' } }));
                  if (t) {
                    window.dispatchEvent(new CustomEvent('eq-agent-open-ticker', { detail: { tab: 'research', ticker: t } }));
                  }
                  return;
                }
                if (tab === 'crypto') {
                  setActiveTab('markets');
                  window.dispatchEvent(new CustomEvent('eq-market-arena', { detail: { arena: 'crypto' } }));
                  if (t) {
                    window.dispatchEvent(new CustomEvent('eq-agent-open-ticker', { detail: { tab: 'crypto', ticker: t } }));
                  }
                  return;
                }
                setActiveTab(tab);
                if (t) {
                  window.dispatchEvent(new CustomEvent('eq-agent-open-ticker', { detail: { tab, ticker: t } }));
                }
              }}
              user={user}
              dek={agentDek}
            />
          </div>
          <div className={activeTab === 'markets' ? '' : 'hidden'}>
            <DashboardPanel />
          </div>
          <div className={activeTab === 'picks' ? '' : 'hidden'}>
            <AiPicksPanel
              onOpenTicker={(ticker) => {
                const t = ticker ? String(ticker).trim().toUpperCase() : '';
                setActiveTab('research');
                window.dispatchEvent(new CustomEvent('eq-research-subtab', { detail: { sub: 'fundamentals' } }));
                if (t) {
                  window.dispatchEvent(new CustomEvent('eq-agent-open-ticker', { detail: { tab: 'research', ticker: t } }));
                }
              }}
            />
          </div>
          <div className={activeTab === 'screener' ? '' : 'hidden'}>
            <ScreenerPanel />
          </div>
          <div className={activeTab === 'research' ? '' : 'hidden'}>
            <ResearchPanel
              strategies={strategies}
              onCompare={handleCompare}
              compareResults={compareResults}
              compareLoading={loading}
            />
          </div>
          <div className={activeTab === 'account' ? '' : 'hidden'}>
            {user && <AccountPanel onSignedOut={handleSignout} onPasswordChanged={handlePasswordChanged} />}
          </div>
        </main>

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

      <ThemeToggle />
      <ConsentBanner />
    </div>
  );
}

export default App;

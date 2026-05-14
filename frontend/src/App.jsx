import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchStrategies, compareStrategies, getStoredUser, signout, checkInteraction, trackPageView } from './api';
import ScreenerPanel from './components/ScreenerPanel';
import ResearchPanel from './components/ResearchPanel';
import Header from './components/Header';
import AuthModal from './components/AuthModal';
import AdminPanel from './components/AdminPanel';
import AgentPanel from './components/AgentPanel';
import ConsentBanner from './components/ConsentBanner';
import AccountPanel from './components/AccountPanel';
import LearnLayout from './components/LearnLayout';
import ThemeToggle from './components/ThemeToggle';
import { getLearnRoute } from './learnNavigation';
import { applyDocumentTheme, syncSiteThemeUserMeta } from './siteTheme';
import { bootstrapAgentE2EE, fetchAgentE2EEMeta, rewrapAgentE2EE } from './api';
import { createAndWrapDek, unwrapDek, wrapExistingDek } from './e2ee';

const APP_PATH_TO_TAB = {
  '/': 'research',
  '/agent': 'research',
  '/macro': 'research',
  '/picks': 'research',
  '/research': 'research',
  '/markets': 'research',
  '/screener': 'screener',
  '/chart': 'research',
  '/terminal': 'research',
  '/backtest': 'backtest',
};

function getTabFromPath() {
  const path = (window.location.pathname || '/').replace(/\/$/, '') || '/';
  return APP_PATH_TO_TAB[path] || 'research';
}

function getResearchSubtabFromPath() {
  const path = (window.location.pathname || '/').replace(/\/$/, '') || '/';
  if (path === '/chart' || path === '/terminal') return 'terminal';
  if (path === '/backtest') return 'backtest';
  return null;
}

function App() {
  const [strategies, setStrategies] = useState([]);
  const [isAdmin, setIsAdmin] = useState(window.location.hash === '#admin');
  const [learnRoute, setLearnRoute] = useState(() => getLearnRoute());
  const [activeTab, setActiveTab] = useState(() => getTabFromPath());

  // Listen for hash changes
  useEffect(() => {
    const handler = () => setIsAdmin(window.location.hash === '#admin');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  useEffect(() => {
    const syncLearn = () => {
      const nextLearn = getLearnRoute();
      setLearnRoute(nextLearn);
      if (!nextLearn && !window.location.hash.includes('admin')) {
        setActiveTab(getTabFromPath());
        const sub = getResearchSubtabFromPath();
        if (sub) {
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('eq-research-subtab', { detail: { sub } }));
          }, 0);
        }
      }
    };
    window.addEventListener('popstate', syncLearn);
    window.addEventListener('hashchange', syncLearn);
    syncLearn();
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
  const openUsageAuth = useCallback((info = {}) => {
    const force = Boolean(info.force_signup);
    setForceAuth(force);
    setAuthMode('signup');
    setAuthMessage(
      force
        ? 'Create a completely free Equilima account to continue. Unlimited access, no credit card required.'
        : 'You are using Equilima actively today. Sign in for completely free unlimited access — no credit card required.'
    );
    setShowAuth(true);
  }, []);

  useEffect(() => {
    const onGate = (e) => {
      const info = e.detail || {};
      if (user) return;
      if (info.force_signup || (info.show_prompt && !softPromptShown)) {
        setSoftPromptShown(true);
        openUsageAuth(info);
      }
    };
    window.addEventListener('eq-usage-gate', onGate);
    return () => window.removeEventListener('eq-usage-gate', onGate);
  }, [user, softPromptShown, openUsageAuth]);

  const trackInteraction = useCallback(async () => {
    if (user) return;
    try {
      const data = await checkInteraction(activeTab);
      if (data.force_signup) {
        openUsageAuth(data);
      } else if (data.show_prompt && !softPromptShown) {
        setSoftPromptShown(true);
        openUsageAuth(data);
      }
    } catch {}
  }, [user, softPromptShown, activeTab, openUsageAuth]);

  // Track page views
  useEffect(() => {
    trackPageView(activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'backtest') return;
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('eq-research-subtab', { detail: { sub: 'backtest' } }));
    }, 0);
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

  const handleAgentNavigate = useCallback((tab, ticker) => {
    const target = String(tab || 'research').toLowerCase();
    const t = ticker ? String(ticker).trim().toUpperCase() : '';

    if (target === 'screener') {
      setActiveTab('screener');
      window.history.pushState({}, '', '/screener');
      if (t) {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('eq-agent-open-ticker', { detail: { tab: 'screener', ticker: t } }));
        }, 0);
      }
      return;
    }

    if (target === 'backtest') {
      setActiveTab('backtest');
      window.history.pushState({}, '', '/backtest');
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('eq-research-subtab', { detail: { sub: 'backtest' } }));
        if (t) {
          window.dispatchEvent(new CustomEvent('eq-agent-open-ticker', { detail: { tab: 'research', ticker: t } }));
        }
      }, 0);
      return;
    }

    const sub = target === 'terminal' || target === 'chart' ? 'terminal' : 'fundamentals';
    setActiveTab('research');
    window.history.pushState({}, '', sub === 'terminal' ? '/chart' : '/');
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('eq-research-subtab', { detail: { sub } }));
      if (t) {
        window.dispatchEvent(new CustomEvent('eq-agent-open-ticker', { detail: { tab: 'research', ticker: t } }));
      }
    }, 0);
  }, []);

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
        className="max-w-[1680px] mx-auto px-3 sm:px-6 pb-8 sm:pb-12 mt-2 sm:mt-4"
      >
          {error && (
            <div
              className={
                'mb-4 p-3 rounded-xl bg-red-50 text-red-800 text-sm ring-1 ring-red-200/80 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900/50'
              }
            >
              {error}
            </div>
          )}
          <div className={activeTab === 'screener' ? '' : 'hidden'}>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
              <ScreenerPanel
                onOpenResearch={(ticker) => {
                  const t = ticker ? String(ticker).trim().toUpperCase() : '';
                  setActiveTab('research');
                  window.setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('eq-research-subtab', { detail: { sub: 'fundamentals' } }));
                    if (t) {
                      window.dispatchEvent(new CustomEvent('eq-agent-open-ticker', { detail: { tab: 'research', ticker: t } }));
                    }
                  }, 0);
                }}
              />
              <AgentPanel
                embedded
                context="screener"
                contextTitle="Screener Assistant"
                contextInstruction="You are embedded in the Screener tab. Help the user translate requests into practical screen filters, universes, ranking criteria, and next research actions. If they ask for macro or market context, answer briefly and connect it back to screening."
                onUserMessage={(message) => window.dispatchEvent(new CustomEvent('eq-screener-assistant-query', { detail: { message } }))}
                onNavigate={handleAgentNavigate}
                user={user}
                dek={agentDek}
              />
            </div>
          </div>
          <div className={activeTab === 'research' || activeTab === 'backtest' ? '' : 'hidden'}>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
              <ResearchPanel
                strategies={strategies}
                onCompare={handleCompare}
                compareResults={compareResults}
                compareLoading={loading}
              />
              <AgentPanel
                embedded
                context={activeTab === 'backtest' ? 'backtest' : 'research'}
                contextTitle={activeTab === 'backtest' ? 'Backtesting Assistant' : 'Research Assistant'}
                contextInstruction={activeTab === 'backtest'
                  ? 'You are embedded in the Backtesting workflow. Help the user choose strategies, time windows, tickers, risk controls, and interpret backtest results. If they ask for macro or market data, connect it to backtest assumptions.'
                  : 'You are embedded in the Research tab. Help with ticker research, fundamentals, valuation, technicals, news, macro and market context when asked. Be concise, specific, and practical.'}
                onNavigate={handleAgentNavigate}
                user={user}
                dek={agentDek}
                strategies={strategies}
                onCompare={handleCompare}
                compareResults={compareResults}
                compareLoading={loading}
              />
            </div>
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

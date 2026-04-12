import { useEffect, useState } from 'react';
import { applyConsentToGa, getAnalyticsConsent, setAnalyticsConsent } from '../consent/ga';

export default function ConsentBanner() {
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [consent, setConsent] = useState(() => getAnalyticsConsent());

  useEffect(() => {
    const c = getAnalyticsConsent();
    setConsent(c);
    setOpen(c == null);
    if (c) applyConsentToGa(c);
  }, []);

  const accept = () => {
    setAnalyticsConsent('granted');
    setConsent('granted');
    applyConsentToGa('granted');
    setOpen(false);
    setManage(false);
  };

  const reject = () => {
    setAnalyticsConsent('denied');
    setConsent('denied');
    setOpen(false);
    setManage(false);
  };

  const openManage = () => {
    setOpen(true);
    setManage(true);
  };

  // Expose a simple global hook so you can add a "Manage cookies" link anywhere later.
  useEffect(() => {
    window.__equilima_open_cookie_settings = openManage;
    return () => { delete window.__equilima_open_cookie_settings; };
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 pb-3">
        <div className="bg-white rounded-2xl p-4 shadow-lg shadow-zinc-900/10 ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:ring-zinc-700 dark:shadow-black/25">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-[12px] text-zinc-600 leading-relaxed dark:text-zinc-400">
              <div className="text-xs font-semibold text-zinc-900 mb-1 dark:text-zinc-100">Cookies & analytics</div>
              We use analytics cookies (Google Analytics) to understand traffic and improve Equilima.
              {manage ? (
                <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-500">
                  - <span className="text-zinc-700 dark:text-zinc-300">Analytics</span>: {consent === 'granted' ? 'On' : 'Off'} (GA4)
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-end">
              {!manage ? (
                <button
                  type="button"
                  onClick={() => setManage(true)}
                  className="px-3 py-2 rounded-lg bg-zinc-100 text-[11px] text-zinc-700 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  Manage
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setManage(false)}
                  className="px-3 py-2 rounded-lg bg-zinc-100 text-[11px] text-zinc-700 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  Back
                </button>
              )}

              <button
                type="button"
                onClick={reject}
                className="px-3 py-2 rounded-lg bg-zinc-100 text-[11px] text-zinc-700 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={accept}
                className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] text-white font-medium dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Accept
              </button>
            </div>
          </div>

          <div className="mt-2 text-[10px] text-zinc-400 dark:text-zinc-500">
            You can change this anytime via “cookie settings”.
          </div>
        </div>
      </div>
    </div>
  );
}


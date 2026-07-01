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
        <div className="eq-card eq-fade-up p-4 !shadow-[var(--eq-shadow-pop)]">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-[12px] leading-relaxed text-[var(--eq-text2)]">
              <div className="mb-1 text-xs font-semibold text-[var(--eq-text)]">Cookies & analytics</div>
              We use analytics cookies (Google Analytics) to understand traffic and improve Equilima.
              {manage ? (
                <div className="mt-2 text-[11px] text-[var(--eq-text3)]">
                  - <span className="text-[var(--eq-text)]">Analytics</span>: {consent === 'granted' ? 'On' : 'Off'} (GA4)
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-end">
              {!manage ? (
                <button
                  type="button"
                  onClick={() => setManage(true)}
                  className="eq-btn !text-[11px]"
                >
                  Manage
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setManage(false)}
                  className="eq-btn !text-[11px]"
                >
                  Back
                </button>
              )}

              <button
                type="button"
                onClick={reject}
                className="eq-btn !text-[11px]"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={accept}
                className="eq-btn eq-btn-primary !text-[11px]"
              >
                Accept
              </button>
            </div>
          </div>

          <div className="mt-2 text-[10px] text-[var(--eq-text3)]">
            You can change this anytime via “cookie settings”.
          </div>
        </div>
      </div>
    </div>
  );
}


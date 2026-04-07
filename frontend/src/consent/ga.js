const GA_MEASUREMENT_ID = 'G-20XD03DT0E';
const LS_KEY = 'eq_consent_analytics';

export function getAnalyticsConsent() {
  const v = localStorage.getItem(LS_KEY);
  if (v === 'granted' || v === 'denied') return v;
  return null;
}

export function setAnalyticsConsent(value) {
  localStorage.setItem(LS_KEY, value);
}

let _gaLoaded = false;

export function ensureGaLoaded() {
  if (_gaLoaded) return;
  _gaLoaded = true;

  // Create gtag shim immediately so early calls don't crash.
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(){ window.dataLayer.push(arguments); };

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  document.head.appendChild(s);

  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID);
}

export function applyConsentToGa(consent) {
  // With GA4-only, simplest is: don't load GA unless consent granted.
  if (consent === 'granted') ensureGaLoaded();
}


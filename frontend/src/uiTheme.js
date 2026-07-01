/**
 * Chart color tokens for JS-drawn surfaces (recharts, lightweight-charts).
 * Mirrors the CSS variables in index.css — keep the two in sync.
 */
export function isDarkMode() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

export function chartTheme(dark = isDarkMode()) {
  return dark
    ? {
        text: '#a1a1aa',
        textStrong: '#f4f4f5',
        grid: 'rgba(250,250,250,0.05)',
        border: 'rgba(250,250,250,0.08)',
        card: '#101013',
        elev: '#1a1a1f',
        accent: '#818cf8',
        gain: '#34d399',
        loss: '#fb7185',
        gainSoft: 'rgba(52,211,153,0.12)',
        lossSoft: 'rgba(251,113,133,0.12)',
        accentSoft: 'rgba(129,140,248,0.13)',
        series: ['#818cf8', '#22d3ee', '#fbbf24', '#f472b6', '#34d399', '#a78bfa'],
        mono: "'Geist Mono', ui-monospace, monospace",
      }
    : {
        text: '#52525b',
        textStrong: '#0a0a0b',
        grid: 'rgba(9,9,11,0.05)',
        border: 'rgba(9,9,11,0.08)',
        card: '#ffffff',
        elev: '#ffffff',
        accent: '#4f46e5',
        gain: '#059669',
        loss: '#e11d48',
        gainSoft: 'rgba(5,150,105,0.10)',
        lossSoft: 'rgba(225,29,72,0.10)',
        accentSoft: 'rgba(79,70,229,0.09)',
        series: ['#4f46e5', '#0891b2', '#d97706', '#db2777', '#059669', '#7c3aed'],
        mono: "'Geist Mono', ui-monospace, monospace",
      };
}

/** Recharts tooltip contentStyle from tokens. */
export function tooltipStyle(dark = isDarkMode()) {
  const t = chartTheme(dark);
  return {
    background: t.elev,
    border: `1px solid ${t.border}`,
    borderRadius: 10,
    fontSize: 12,
    color: t.textStrong,
    boxShadow: dark ? '0 8px 30px rgba(0,0,0,0.5)' : '0 8px 30px rgba(9,9,11,0.12)',
  };
}

/** Subscribe to theme changes; returns unsubscribe. */
export function onThemeChange(cb) {
  const h = () => cb(isDarkMode());
  window.addEventListener('eq-theme-changed', h);
  return () => window.removeEventListener('eq-theme-changed', h);
}

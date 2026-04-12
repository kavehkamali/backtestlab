/**
 * Site-wide appearance preference (localStorage for now).
 * Record shape reserved for server sync: userId + ip when backend supports it.
 */
export const SITE_THEME_STORAGE_KEY = 'eq_site_theme_v1';

const DEFAULT_RECORD = () => ({
  v: 1,
  mode: 'light',
  userId: null,
  ip: null,
  updatedAt: null,
});

export function readSiteThemeRecord() {
  try {
    const raw = localStorage.getItem(SITE_THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_RECORD();
    const o = JSON.parse(raw);
    if (o && o.v === 1 && (o.mode === 'light' || o.mode === 'dark')) {
      return {
        ...DEFAULT_RECORD(),
        ...o,
        v: 1,
      };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_RECORD();
}

export function writeSiteThemeRecord(partial) {
  const prev = readSiteThemeRecord();
  const next = {
    ...prev,
    ...partial,
    v: 1,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(SITE_THEME_STORAGE_KEY, JSON.stringify(next));
}

export function getStoredSiteMode() {
  return readSiteThemeRecord().mode;
}

export function dispatchThemeEvent(mode) {
  window.dispatchEvent(new CustomEvent('eq-theme-changed', { detail: { mode } }));
}

/** Apply `dark` class from persisted mode (call with forceLight on admin shell). */
export function applyDocumentTheme({ forceLight = false } = {}) {
  const root = document.documentElement;
  if (forceLight) {
    root.classList.remove('dark');
    dispatchThemeEvent('light');
    return;
  }
  const mode = readSiteThemeRecord().mode;
  if (mode === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  dispatchThemeEvent(mode);
}

export function setStoredSiteMode(mode) {
  if (mode !== 'light' && mode !== 'dark') return;
  const prev = readSiteThemeRecord();
  writeSiteThemeRecord({ ...prev, mode });
  applyDocumentTheme({ forceLight: false });
}

/** Call once before React render to avoid flash. */
export function initSiteThemeFromStorage() {
  applyDocumentTheme({ forceLight: false });
}

/** Attach signed-in user id to the record (ip left null until server provides it). */
export function syncSiteThemeUserMeta(user) {
  const prev = readSiteThemeRecord();
  const userId = user?.id != null ? user.id : null;
  if (prev.userId === userId) return;
  writeSiteThemeRecord({ userId });
}

import { useCallback, useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { getStoredSiteMode, setStoredSiteMode } from '../siteTheme';

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => getStoredSiteMode() === 'dark');

  useEffect(() => {
    const onExternal = () => setDark(getStoredSiteMode() === 'dark');
    window.addEventListener('eq-theme-changed', onExternal);
    window.addEventListener('storage', onExternal);
    return () => {
      window.removeEventListener('eq-theme-changed', onExternal);
      window.removeEventListener('storage', onExternal);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !dark;
    setDark(next);
    setStoredSiteMode(next ? 'dark' : 'light');
  }, [dark]);

  return (
    <div className="fixed bottom-4 right-4 z-[45] pointer-events-auto" aria-live="polite">
      <button
        type="button"
        role="switch"
        aria-checked={dark}
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        onClick={toggle}
        className="group flex h-7 w-[3.25rem] shrink-0 items-center rounded-full bg-zinc-200/90 px-0.5 shadow-sm ring-1 ring-zinc-300/60 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:ring-zinc-600/80 dark:hover:bg-zinc-700"
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-zinc-200/80 transition-transform duration-200 ease-out dark:bg-zinc-900 dark:ring-zinc-600 ${
            dark ? 'translate-x-6' : 'translate-x-0'
          }`}
        >
          {dark ? (
            <Moon className="h-3 w-3 text-zinc-400" strokeWidth={2} aria-hidden />
          ) : (
            <Sun className="h-3 w-3 text-amber-500" strokeWidth={2} aria-hidden />
          )}
        </span>
      </button>
    </div>
  );
}

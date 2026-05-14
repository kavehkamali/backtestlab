import { Mail, Shield, FileText, BookOpen } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

const year = new Date().getFullYear();

const productLinks = [
  { label: 'Research', href: '/' },
  { label: 'Screener', href: '/screener' },
  { label: 'Backtesting', href: '/backtest' },
  { label: 'Market Blog', href: '/learn' },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200/70 bg-white/85 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/85 dark:text-zinc-400">
      <div className="max-w-[1680px] mx-auto px-3 sm:px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <a href="/" className="inline-flex items-center gap-2 rounded-md -ml-1 px-1 py-0.5 hover:bg-zinc-100/80 dark:hover:bg-zinc-900">
              <img src="/logo-mark.svg" alt="" width={24} height={24} className="w-5 h-5 shrink-0" aria-hidden />
              <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Equilima</span>
            </a>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
              Free AI-assisted stock research, screening, and strategy backtesting for education and research. Equilima is not a broker, adviser, or source of personalized financial advice.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label="Footer">
            {productLinks.map((link) => (
              <a key={link.href} href={link.href} className="font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100">
                {link.label}
              </a>
            ))}
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              <Shield className="w-3.5 h-3.5" /> Privacy
            </a>
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              <FileText className="w-3.5 h-3.5" /> Terms
            </a>
            <a href="mailto:info@equilima.com" className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              <Mail className="w-3.5 h-3.5" /> Contact
            </a>
            <a href="/learn" className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              <BookOpen className="w-3.5 h-3.5" /> Blog
            </a>
          </nav>

          <div className="flex items-center gap-3 lg:justify-end">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-500">Dark mode</span>
            <ThemeToggle inline />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200/70 pt-4 text-[11px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
          <span>© {year} Equilima. All rights reserved.</span>
          <span>Market data may be delayed. Verify decisions with primary sources.</span>
        </div>
      </div>
    </footer>
  );
}

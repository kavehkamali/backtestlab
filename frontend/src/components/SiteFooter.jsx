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
    <footer className="border-t border-[var(--eq-border)] bg-[var(--eq-bg)] text-[var(--eq-text2)]">
      <div className="mx-auto max-w-[1680px] px-3 py-7 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <a href="/" className="-ml-1 inline-flex items-center gap-2 rounded-md px-1 py-0.5 transition-opacity hover:opacity-80">
              <img src="/logo-mark.svg" alt="" width={24} height={24} className="h-5 w-5 shrink-0" aria-hidden />
              <span className="text-sm font-semibold tracking-tight text-[var(--eq-text)]">Equilima</span>
            </a>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-[var(--eq-text3)]">
              Free AI-assisted stock research, screening, and strategy backtesting for education and research. Equilima is not a broker, adviser, or source of personalized financial advice.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label="Footer">
            {productLinks.map((link) => (
              <a key={link.href} href={link.href} className="font-medium text-[var(--eq-text2)] transition-colors hover:text-[var(--eq-text)]">
                {link.label}
              </a>
            ))}
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[var(--eq-text3)] transition-colors hover:text-[var(--eq-text)]">
              <Shield className="h-3.5 w-3.5" strokeWidth={1.8} /> Privacy
            </a>
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[var(--eq-text3)] transition-colors hover:text-[var(--eq-text)]">
              <FileText className="h-3.5 w-3.5" strokeWidth={1.8} /> Terms
            </a>
            <a href="mailto:info@equilima.com" className="inline-flex items-center gap-1.5 text-[var(--eq-text3)] transition-colors hover:text-[var(--eq-text)]">
              <Mail className="h-3.5 w-3.5" strokeWidth={1.8} /> Contact
            </a>
            <a href="/learn" className="inline-flex items-center gap-1.5 text-[var(--eq-text3)] transition-colors hover:text-[var(--eq-text)]">
              <BookOpen className="h-3.5 w-3.5" strokeWidth={1.8} /> Blog
            </a>
          </nav>

          <div className="flex items-center gap-3 lg:justify-end">
            <span className="eq-label">Theme</span>
            <ThemeToggle inline />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--eq-border)] pt-4 text-[11px] text-[var(--eq-text3)]">
          <span>© {year} Equilima. All rights reserved.</span>
          <span>Market data may be delayed. Verify decisions with primary sources.</span>
        </div>
      </div>
    </footer>
  );
}

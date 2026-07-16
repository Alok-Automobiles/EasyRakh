'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Menu, X } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

export default function LandingNavbar() {
  const pathname = usePathname();
  const links = useMemo(
    () => [
      { href: '/about', label: 'About' },
      { href: pathname === '/' ? '#faq' : '/#faq', label: 'FAQs' },
      { href: pathname === '/' ? '#contact' : '/#contact', label: 'Contact' },
    ],
    [pathname],
  );
  const [scrolled, setScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 100);
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const closeOnResize = () => setIsMenuOpen(false);
    window.addEventListener('resize', closeOnResize);
    return () => window.removeEventListener('resize', closeOnResize);
  }, []);

  const containerClasses = `pointer-events-auto mx-auto flex w-[92%] items-center rounded-2xl border border-border bg-card/90 px-3 py-2 shadow-sm backdrop-blur-xl transition-all duration-300 sm:w-4/5 ${scrolled ? 'md:w-[44rem] shadow-md' : 'md:w-[40rem]'}`;

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex flex-col items-center pt-4 pointer-events-none gap-2">
      <div className={containerClasses}>
        <nav className="flex w-full items-center justify-between gap-4 text-sm text-foreground">
          <Link href="/" className="flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="EasyRakh logo"
              width={42}
              height={42}
              className="theme-logo-surface rounded-full p-1"
            />
          </Link>

          <div className="hidden md:flex items-center gap-2">
            <div className="flex items-center gap-3">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <Link
              href="/register"
              className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Signup now
            </Link>
            <ThemeToggle />
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-border bg-card p-2 text-foreground transition-colors hover:bg-muted"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation menu"
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>
      </div>

      <div
        className={`md:hidden pointer-events-auto w-[92%] sm:w-4/5 transition-all duration-200 ${isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
          }`}
      >
        <div className="rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur-xl">
          <div className="flex flex-col gap-2 text-sm text-foreground">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => setIsMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              onClick={() => setIsMenuOpen(false)}
            >
              Signup now
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Menu, X } from 'lucide-react';

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

  const containerClasses = `pointer-events-auto flex items-center rounded-full border border-white/30 bg-neutral-900/80 backdrop-blur-xl px-4 py-2 mx-auto transition-all duration-300 shadow-lg w-[92%] sm:w-4/5 ${scrolled ? 'bg-neutral-900/95 md:w-1/2 shadow-black/20' : 'bg-neutral-900/75 md:w-1/3 shadow-black/10'}`;

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex flex-col items-center pt-4 pointer-events-none gap-2">
      <div className={containerClasses}>
        <nav className="flex items-center justify-between w-full gap-4 text-sm text-white">
          <Link href="/" className="flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="EasyRakh logo"
              width={42}
              height={42}
              className="rounded-full bg-white/90 p-1"
            />
          </Link>

          <div className="hidden md:flex items-center gap-2">
            <div className="flex items-center gap-3">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-2 text-white/80 hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <Link
              href="/register"
              className="rounded-full bg-(--brand-green) px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[#059669]"
            >
              Signup now
            </Link>
          </div>

          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>
      </div>

      <div
        className={`md:hidden pointer-events-auto w-[92%] sm:w-4/5 transition-all duration-200 ${isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
          }`}
      >
        <div className="rounded-2xl border border-white/25 bg-neutral-900/95 backdrop-blur-xl px-4 py-3 shadow-lg">
          <div className="flex flex-col gap-3 text-sm text-white">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="py-1 text-white/80 hover:text-white transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-full bg-(--brand-green) px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[#059669]"
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


'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const links = [
  { href: '#faq', label: 'FAQs' },
  { href: '#contact', label: 'Contact' },
];

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 100);
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center pt-4 pointer-events-none">
      <div
        className={`pointer-events-auto flex items-center rounded-full border border-white/30 bg-neutral-900/80 backdrop-blur-xl px-4 py-2 mx-auto transition-all duration-300 shadow-lg ${scrolled ? 'bg-neutral-900/95 w-1/2 shadow-black/20' : 'bg-neutral-900/75 shadow-black/10 w-1/3'
          }`}
      >
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

          <div className="flex items-center gap-2">
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
        </nav>
      </div>
    </header>
  );
}


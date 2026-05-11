'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';

function TwitterIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
    );
}

function GithubIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.16c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.73.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.07.78 2.16v3.2c0 .31.21.67.8.55C20.21 21.38 23.5 17.08 23.5 12 23.5 5.73 18.27.5 12 .5z" />
        </svg>
    );
}

function LinkedinIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.61 0 4.28 2.38 4.28 5.47v6.27zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zm1.78 13.02H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.21 0 22.23 0z" />
        </svg>
    );
}

export default function Footer() {
    const pathname = usePathname();
    const featuresHref = pathname === '/' ? '#features' : '/#features';
    const pricingHref = pathname === '/' ? '#pricing' : '/#pricing';
    const contactHref = pathname === '/' ? '#contact' : '/#contact';

    return (
        <footer
            className="relative w-full bg-white border-t border-gray-100 pt-16 pb-6 sm:pb-0 overflow-hidden z-0"
            style={{ height: 'auto' }}
        >
            <div className="md:h-[500px] flex flex-col justify-between">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 h-full flex flex-col justify-between w-full">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-12">

                        {/* Brand & Socials */}
                        <div className="max-w-sm">
                            <Link href="/" className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-6">
                                <Image
                                    src="/favicon.ico"
                                    alt="EasyRakh logo"
                                    width={150}
                                    height={150}
                                />
                            </Link>
                            <p className="text-gray-500 mb-8 leading-relaxed">
                                The simplest ledger for Indian businesses. Track credits, debits, and daily cash in a simple, secure, and purpose-built ledger.
                            </p>
                            <div className="flex gap-4">
                                <a href="https://x.com/cenation_rishi" aria-label="Twitter" className="w-10 h-10 rounded-full bg-(--brand-bg) flex items-center justify-center text-gray-500 hover:bg-(--brand-green-light) hover:text-(--brand-green) transition-colors">
                                    <TwitterIcon className="w-5 h-5" />
                                </a>
                                <a href="https://github.com/Alok-Automobiles/EasyRakh" aria-label="GitHub" className="w-10 h-10 rounded-full bg-(--brand-bg) flex items-center justify-center text-gray-500 hover:bg-(--brand-green-light) hover:text-(--brand-green) transition-colors">
                                    <GithubIcon className="w-5 h-5" />
                                </a>
                                <a href="https://www.linkedin.com/in/rishichaubey3105/" aria-label="LinkedIn" className="w-10 h-10 rounded-full bg-(--brand-bg) flex items-center justify-center text-gray-500 hover:bg-(--brand-green-light) hover:text-(--brand-green) transition-colors">
                                    <LinkedinIcon className="w-5 h-5" />
                                </a>
                            </div>
                        </div>

                        {/* Minimal Links */}
                        <div className="flex gap-16">
                            <div>
                                <h4 className="font-semibold text-gray-900 mb-6">Product</h4>
                                <ul className="space-y-4">
                                    <li><Link href={featuresHref} className="text-gray-500 hover:text-(--brand-green)">Features</Link></li>
                                    <li><Link href={pricingHref} className="text-gray-500 hover:text-(--brand-green)">Pricing</Link></li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="font-semibold text-gray-900 mb-6">Company</h4>
                                <ul className="space-y-4">
                                    <li><Link href="/about" className="text-gray-500 hover:text-(--brand-green)">About</Link></li>
                                    <li><Link href={contactHref} className="text-gray-500 hover:text-(--brand-green)">Contact</Link></li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="font-semibold text-gray-900 mb-6">Legal</h4>
                                <ul className="space-y-4">
                                    <li><Link href="/privacy" className="text-gray-500 hover:text-(--brand-green)">Privacy</Link></li>
                                    <li><Link href="/terms" className="text-gray-500 hover:text-(--brand-green)">Terms</Link></li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Copyright Line */}
                    {/* <div className="border-t border-gray-100 py-8 flex flex-col md:flex-row justify-between items-center gap-4 bg-white/80 backdrop-blur-sm">
                        <p className="text-gray-400 text-sm">
                            © {new Date().getFullYear()} EasyRakh. All rights reserved.
                        </p>
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            <span>Made with</span>
                            <Heart className="w-4 h-4 text-rose-300 fill-rose-300" />
                            <span>in India</span>
                        </div>
                    </div> */}
                </div>
            </div>

            {/* Massive Footer Text */}
            <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-none opacity-5 pointer-events-none select-none z-0">
                <h1 className="text-[15vw] font-bold text-center text-gray-900 tracking-tighter -mb-[4vw]">
                    EasyRakh
                </h1>
            </div>
        </footer>
    );
}

'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Twitter, Github, Linkedin } from 'lucide-react';
import Image from 'next/image';

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
                                <a href="https://x.com/cenation_rishi" className="w-10 h-10 rounded-full bg-(--brand-bg) flex items-center justify-center text-gray-500 hover:bg-(--brand-green-light) hover:text-(--brand-green) transition-colors">
                                    <Twitter className="w-5 h-5" />
                                </a>
                                <a href="https://github.com/Alok-Automobiles/EasyRakh" className="w-10 h-10 rounded-full bg-(--brand-bg) flex items-center justify-center text-gray-500 hover:bg-(--brand-green-light) hover:text-(--brand-green) transition-colors">
                                    <Github className="w-5 h-5" />
                                </a>
                                <a href="https://www.linkedin.com/in/rishichaubey3105/" className="w-10 h-10 rounded-full bg-(--brand-bg) flex items-center justify-center text-gray-500 hover:bg-(--brand-green-light) hover:text-(--brand-green) transition-colors">
                                    <Linkedin className="w-5 h-5" />
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

'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CurrencyInr, ArrowUpRight, ArrowDownLeft } from '@phosphor-icons/react';
import React from 'react';
import { ComicText } from '@/components/ui/comic-text';
import Image from 'next/image';
import { Highlighter } from '../ui/highlighter';

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-emerald-50 via-white to-rose-50" />

      {/* Left SVG decoration */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/4 z-20 pointer-events-none hidden lg:block">
        <Image
          src="/left.svg"
          alt=""
          width={380}
          height={390}
          className="opacity-100"
          priority={false}
        />
      </div>

      {/* Right SVG decoration */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/4 z-20 pointer-events-none hidden lg:block">
        <Image
          src="/right.svg"
          alt=""
          width={290}
          height={420}
          className="opacity-100"
          priority={false}
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 relative z-30">
        <div className="mx-auto text-center max-w-3xl">
          {/* EasyRakh Logo */}
          <div className="mb-8">
            <div className="flex items-center justify-center gap-2">
              <ComicText
                fontSize={4}
                style={{
                  backgroundColor: '#10b981',
                  backgroundImage: 'radial-gradient(circle at 1px 1px, #065f46 1px, transparent 0)',
                  WebkitTextStroke: '4px #000000',
                  filter: 'drop-shadow(5px 5px 0px #000000) drop-shadow(3px 3px 0px #065f46)',
                }}
              >
                Easy
              </ComicText>
              <ComicText
                fontSize={4}
                style={{
                  backgroundColor: '#f43f5e',
                  backgroundImage: 'radial-gradient(circle at 1px 1px, #be123c 1px, transparent 0)',
                  WebkitTextStroke: '4px #000000',
                  filter: 'drop-shadow(5px 5px 0px #000000) drop-shadow(3px 3px 0px #be123c)',
                }}
              >
                Rakh
              </ComicText>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 mb-6 rounded-full border bg-white/70 backdrop-blur px-4 py-1 shadow-sm">
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">New</Badge>
            <span className="text-sm text-gray-600">Track every rupee with confidence</span>
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-gray-900">
            Simple <Highlighter action="highlight" color="#fecaca">Ledger</Highlighter> for <Highlighter action="underline" color="#10b981">Profits</Highlighter> and <Highlighter action="underline" color="#10b981">Losses</Highlighter>
          </h1>
          <p className="mt-6 text-lg text-gray-600">
            Manage credits and debits with clarity. Light green highlights <Highlighter action="underline" color="#10b981">profits</Highlighter>, light red flags <Highlighter action="underline" color="#10b981">losses</Highlighter>.
            Designed for fast daily bookkeeping.
          </p>
          
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="text-base px-8 py-6 bg-emerald-600 hover:bg-emerald-700 cursor-none">
              <Link href="/register">Get started free</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="text-base px-8 py-6 border-gray-300 cursor-none"
            >
              <Link href="/login">Sign in</Link>
            </Button>
          </div>

          {/* Mini highlights */}
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="flex items-center justify-center gap-2 rounded-lg border bg-white/70 px-3 py-2">
              <CurrencyInr weight="bold" className="h-4 w-4 text-emerald-600" />
              <span className="text-gray-700">Profit-first visuals</span>
            </div>
            <div className="flex items-center justify-center gap-2 rounded-lg border bg-white/70 px-3 py-2">
              <ArrowUpRight weight="bold" className="h-4 w-4 text-emerald-600" />
              <span className="text-gray-700">Fast credit entry</span>
            </div>
            <div className="flex items-center justify-center gap-2 rounded-lg border bg-white/70 px-3 py-2">
              <ArrowDownLeft weight="bold" className="h-4 w-4 text-rose-600" />
              <span className="text-gray-700">Clear debit history</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

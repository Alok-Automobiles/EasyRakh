'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IndianRupee, ArrowUpRight, ArrowDownLeft, ReceiptIndianRupee } from 'lucide-react';
import React from 'react';

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-emerald-50 via-white to-rose-50" />

      {/* Decorative vectors */}
      <RupeeCoin className="hidden sm:block absolute -left-10 top-12 h-24 w-24 opacity-70" />
      <GreenUpArrow className="hidden md:block absolute right-12 top-10 h-28 w-28 opacity-70" />
      <RedDownArrow className="hidden md:block absolute left-24 bottom-10 h-24 w-24 opacity-60" />
      <Receipt className="hidden sm:block absolute right-0 -bottom-6 h-28 w-28 opacity-70" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="mx-auto text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 mb-6 rounded-full border bg-white/70 backdrop-blur px-4 py-1 shadow-sm">
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">New</Badge>
            <span className="text-sm text-gray-600">Track every rupee with confidence</span>
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-gray-900">
            Simple Ledger for Profits and Losses
          </h1>
          <p className="mt-6 text-lg text-gray-600">
            Manage credits and debits with clarity. Light green highlights profits, light red flags losses.
            Designed for fast daily bookkeeping.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="text-base px-8 py-6 bg-emerald-600 hover:bg-emerald-700">
              <Link href="/register">Get started free</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="text-base px-8 py-6 border-gray-300"
            >
              <Link href="/login">Sign in</Link>
            </Button>
          </div>

          {/* Mini highlights */}
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="flex items-center justify-center gap-2 rounded-lg border bg-white/70 px-3 py-2">
              <IndianRupee className="h-4 w-4 text-emerald-600" />
              <span className="text-gray-700">Profit-first visuals</span>
            </div>
            <div className="flex items-center justify-center gap-2 rounded-lg border bg-white/70 px-3 py-2">
              <ArrowUpRight className="h-4 w-4 text-emerald-600" />
              <span className="text-gray-700">Fast credit entry</span>
            </div>
            <div className="flex items-center justify-center gap-2 rounded-lg border bg-white/70 px-3 py-2">
              <ArrowDownLeft className="h-4 w-4 text-rose-600" />
              <span className="text-gray-700">Clear debit history</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RupeeCoin({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className}>
      <defs>
        <radialGradient id="g" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#d1fae5" />
          <stop offset="100%" stopColor="#a7f3d0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#g)" stroke="#10b981" strokeWidth="2" />
      {/* rupee symbol */}
      <g transform="translate(40,35)">
        <path d="M5 0h25M5 10h20M5 10c0 15 10 30 30 35" stroke="#065f46" strokeWidth="4" fill="none" />
      </g>
    </svg>
  );
}

function GreenUpArrow({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className}>
      <path d="M20 80 L60 40 L80 60 L100 30" stroke="#10b981" strokeWidth="10" fill="none" />
      <circle cx="100" cy="30" r="6" fill="#10b981" />
    </svg>
  );
}

function RedDownArrow({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className}>
      <path d="M20 40 L60 80 L80 60 L100 90" stroke="#f43f5e" strokeWidth="10" fill="none" />
      <circle cx="20" cy="40" r="6" fill="#f43f5e" />
    </svg>
  );
}

function Receipt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 160" className={className}>
      <rect x="20" y="10" width="100" height="140" rx="10" fill="#fff" stroke="#e5e7eb" />
      <path d="M35 40h70M35 60h70M35 80h50M35 100h60" stroke="#e5e7eb" strokeWidth="6" />
      <ReceiptIndianRupee className="absolute" />
    </svg>
  );
}



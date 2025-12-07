'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, CheckCircle2, PlayCircle } from 'lucide-react';
import React from 'react';
import { ComicText } from '@/components/ui/comic-text';
import Image from 'next/image';
import { motion } from 'motion/react'
import { Highlighter } from '@/components/ui/highlighter';

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 lg:pt-40 lg:pb-28 bg-[var(--brand-bg)]">
      {/* Background Elements */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[var(--brand-green-light)] via-[var(--brand-bg)] to-[var(--brand-bg)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl -z-10 opacity-60 pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-[var(--brand-green-light)] rounded-full blur-3xl" />
        <div className="absolute top-40 right-10 w-96 h-96 bg-[var(--brand-red-light)] rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto">

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 mb-8 rounded-full border border-emerald-100 bg-white px-4 py-1.5 shadow-sm"
          >
            <Badge variant="secondary" className="bg-[var(--brand-green-light)] text-emerald-700 hover:bg-emerald-100 border-emerald-100">New v2.0</Badge>
            <span className="text-sm font-medium text-gray-600">The simplest ledger for Indian businesses</span>
            <ArrowRight className="w-3 h-3 text-emerald-600 ml-1" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-gray-900 mb-8 leading-[1.1]"
          >
            Master your <Highlighter type="underline" color="var(--brand-green)" >Cashflow</Highlighter> with <br className="hidden sm:block" />
            <span className="mt-2 inline-block">
              <Highlighter type="underline" color="oklch(0.63 0.26 29)" >EasyRakh</Highlighter>
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-xl text-gray-600 mb-10 max-w-2xl leading-relaxed"
          >
            Stop wrestling with complex spreadsheets. Track credits, debits, and daily cash in a simple, secure, and purpose-built ledger for your business.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto"
          >
            <Button asChild size="lg" className="text-base px-8 py-6 bg-[var(--brand-green)] hover:bg-[#059669] text-white shadow-lg shadow-emerald-200/50 transition-all hover:scale-105">
              <Link href="/register">Get started free</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="text-base px-8 py-6 border-gray-200 bg-transparent hover:bg-white hover:text-gray-900 transition-all hover:scale-105"
            >
              <Link href="/login">Sign in</Link>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-10 flex flex-wrap justify-center gap-6 text-sm text-gray-500"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Free forever plan</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Secure & Private</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

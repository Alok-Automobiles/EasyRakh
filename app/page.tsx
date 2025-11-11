'use client';

import Hero from '@/components/landing/Hero';
import TransactionShowcase from '@/components/landing/TransactionShowcase';
import Features from '@/components/landing/Features';
import FinalCTA from '@/components/landing/FinalCTA';
import { SmoothCursor } from '@/components/ui/smooth-cursor';

export default function LandingPage() {
  return (
    <>
      <SmoothCursor />
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-rose-50">
        <Hero />
        <TransactionShowcase />
        <Features />
        <FinalCTA />
      </div>
    </>
  );
}

'use client';

import Hero from '@/components/landing/Hero';
import TransactionShowcase from '@/components/landing/TransactionShowcase';
import Features from '@/components/landing/Features';
import FinalCTA from '@/components/landing/FinalCTA';
import { SmoothCursor } from '@/components/ui/smooth-cursor';
import {motion} from 'framer-motion';

export default function LandingPage() {
  return (
    <>
    <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 1.3 }}
    exit={{ opacity: 0 }}
    >
      <SmoothCursor />
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-rose-50">
        <Hero />
        <TransactionShowcase />
        <Features />
        <FinalCTA />
      </div>
      </motion.div>
    </>
  );
}

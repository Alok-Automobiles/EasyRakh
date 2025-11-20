'use client';

import Hero from '@/components/landing/Hero';
import CoreLedger from '@/components/landing/CoreLedger';
import EntityManagement from '@/components/landing/EntityManagement';
import DashboardPreview from '@/components/landing/DashboardPreview';
import TransactionShowcase from '@/components/landing/TransactionShowcase';
import SecuritySection from '@/components/landing/SecuritySection';
import Footer from '@/components/landing/Footer';
import { SmoothCursor } from '@/components/ui/smooth-cursor';
import { motion } from 'framer-motion';

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
        <div className="min-h-screen bg-white">
          <Hero />
          <CoreLedger />
          <EntityManagement />
          <DashboardPreview />
          <TransactionShowcase />
          <SecuritySection />
          <Footer />
        </div>
      </motion.div>
    </>
  );
}

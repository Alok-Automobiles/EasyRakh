'use client';

import LandingHeader from '@/components/landing/Header';
import Hero from '@/components/landing/Hero';
import MissionStatement from '@/components/landing/MissionStatement';
import GrowthTrust from '@/components/landing/GrowthTrust';
import WhyChooseUs from '@/components/landing/WhyChooseUs';
import FinancialJourney from '@/components/landing/FinancialJourney';
import MoneyManagement from '@/components/landing/MoneyManagement';
import Services from '@/components/landing/Services';
import FeaturesShowcase from '@/components/landing/FeaturesShowcase';
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
          <LandingHeader />
          <Hero />
          <MissionStatement />
          <GrowthTrust />
          <WhyChooseUs />
          <FinancialJourney />
          <MoneyManagement />
          <Services />
          <FeaturesShowcase />
          <Footer />
        </div>
      </motion.div>
    </>
  );
}

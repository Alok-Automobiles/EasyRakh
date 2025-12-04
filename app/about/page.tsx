'use client';

import LandingHeader from '@/components/landing/Header';
import Footer from '@/components/landing/Footer';
import { motion } from 'framer-motion';
import { SmoothCursor } from '@/components/ui/smooth-cursor';

export default function AboutPage() {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <SmoothCursor />
        <div className="min-h-screen bg-white">
          <LandingHeader />
          
          <section className="py-20 bg-white">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-center mb-12"
              >
                <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
                  About EasyRakh
                </h1>
                <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                  Empowering businesses with simple, powerful ledger management
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="prose prose-lg max-w-none"
              >
                <div className="space-y-6 text-gray-700 leading-relaxed">
                  <p>
                    EasyRakh is a modern ledger management system designed specifically for Indian businesses. 
                    We understand that managing finances shouldn't be complicated, which is why we've built 
                    a solution that's both powerful and easy to use.
                  </p>
                  
                  <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">Our Mission</h2>
                  <p>
                    Our mission is to simplify financial management for businesses of all sizes. We believe 
                    that every business owner should have clear visibility into their finances without needing 
                    to be an accounting expert.
                  </p>
                  
                  <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">What We Offer</h2>
                  <p>
                    EasyRakh provides a comprehensive set of tools to manage your business finances:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>Track customers and suppliers separately</li>
                    <li>Create custom collections for employees, shopkeepers, and more</li>
                    <li>Upload and manage bill images</li>
                    <li>Generate professional PDF ledgers</li>
                    <li>Monitor daily cash records with monthly summaries</li>
                    <li>Save important notes and reminders</li>
                    <li>Access a smart dashboard with charts and activity summaries</li>
                  </ul>
                  
                  <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">Why Choose EasyRakh</h2>
                  <p>
                    We've designed EasyRakh with simplicity and performance in mind. Our clean interface 
                    makes it easy for everyone to use, while our fast performance ensures you can manage 
                    your finances without delays. With multi-device sync, you can access your data from 
                    anywhere, anytime.
                  </p>
                  
                  <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">Get Started</h2>
                  <p>
                    Ready to simplify your business finances? Sign up today and start managing your ledgers 
                    with ease. No credit card required, and our free plan gives you everything you need to 
                    get started.
                  </p>
                </div>
              </motion.div>
            </div>
          </section>
          
          <Footer />
        </div>
      </motion.div>
    </>
  );
}


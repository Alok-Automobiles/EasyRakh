'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowUp, TrendingUp, Smartphone, LineChart } from 'lucide-react';
import React from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-20 pb-16 lg:pt-24 lg:pb-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Side - Financial Data Cards */}
          <div className="order-2 lg:order-1">
            <div className="grid grid-cols-2 gap-4">
              {/* Total Balance Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <Card className="p-4 bg-white border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Total Balance</span>
                    <ArrowUp className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-bold text-gray-900">$125,430</div>
                  <div className="text-xs text-emerald-600 mt-1">+12.5% from last month</div>
                </Card>
              </motion.div>

              {/* My Investments Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <Card className="p-4 bg-white border border-gray-200 shadow-sm">
                  <div className="text-sm text-gray-600 mb-2">My Investments</div>
                  <div className="text-2xl font-bold text-gray-900">$89,200</div>
                  <div className="text-xs text-gray-500 mt-1">Portfolio value</div>
                </Card>
              </motion.div>

              {/* Smartphone Mockup */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="col-span-2"
              >
                <Card className="p-4 bg-emerald-50 border border-emerald-100 shadow-sm">
                  <div className="flex items-center justify-center mb-2">
                    <Smartphone className="w-8 h-8 text-emerald-700" />
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-500 mb-1">Financial App</div>
                    <div className="text-sm font-semibold text-gray-900">Track & Manage</div>
                    <div className="flex justify-center gap-1 mt-2">
                      <div className="w-1 h-1 rounded-full bg-emerald-500"></div>
                      <div className="w-1 h-1 rounded-full bg-emerald-500"></div>
                      <div className="w-1 h-1 rounded-full bg-emerald-500"></div>
                    </div>
                  </div>
                </Card>
              </motion.div>

              {/* Line Graph Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="col-span-2"
              >
                <Card className="p-4 bg-emerald-50 border border-emerald-100 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">Growth Trend</span>
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="h-20 bg-white rounded flex items-end justify-around p-2">
                    <div className="w-8 bg-emerald-400 rounded-t" style={{ height: '30%' }}></div>
                    <div className="w-8 bg-emerald-400 rounded-t" style={{ height: '50%' }}></div>
                    <div className="w-8 bg-emerald-400 rounded-t" style={{ height: '70%' }}></div>
                    <div className="w-8 bg-emerald-500 rounded-t" style={{ height: '85%' }}></div>
                    <div className="w-8 bg-emerald-600 rounded-t" style={{ height: '100%' }}></div>
                  </div>
                </Card>
              </motion.div>
            </div>
          </div>

          {/* Right Side - Main Hero Content */}
          <div className="order-1 lg:order-2 text-center lg:text-left">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 mb-6 leading-tight"
            >
              Empowering Your Wealth<br />
              <span className="text-emerald-700">Securing Your Future</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-lg text-gray-600 mb-8 leading-relaxed max-w-xl mx-auto lg:mx-0"
            >
              EasyRakh helps grow and protect wealth with strategic finance and investment, providing data-driven solutions for lasting security.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Button
                asChild
                size="lg"
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-base px-8 py-6 shadow-lg"
              >
                <Link href="/register">Get Started</Link>
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

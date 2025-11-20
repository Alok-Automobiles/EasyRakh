'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight, ArrowDownLeft, TrendUp, TrendDown } from '@phosphor-icons/react';
import { motion } from 'framer-motion';

export default function CoreLedger() {
  return (
    <section className="py-24 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Text Content */}
          <div className="order-2 lg:order-1">
            <Badge className="bg-emerald-100 text-emerald-800 mb-6 hover:bg-emerald-100 px-4 py-1 text-sm">
              Core Ledger
            </Badge>
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
              Instantly see if you're <span className="text-emerald-600">Profiting</span> or <span className="text-rose-600">Losing</span>.
            </h2>
            <p className="text-lg text-gray-600 mb-8 leading-relaxed">
              Stop guessing your financial health. EasyRakh uses intuitive color-coding to give you instant feedback. 
              <span className="font-semibold text-emerald-700"> Green</span> means you're making money, and 
              <span className="font-semibold text-rose-700"> Red</span> means money is going out.
            </p>

            <div className="space-y-6">
              <div className="flex gap-4 items-start">
                <div className="p-3 bg-emerald-100 rounded-xl mt-1">
                  <TrendUp weight="duotone" className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">Profit-First Visuals</h3>
                  <p className="text-gray-600 mt-1">
                    Credits are highlighted in light green, making your gains pop out immediately.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="p-3 bg-rose-100 rounded-xl mt-1">
                  <TrendDown weight="duotone" className="w-6 h-6 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">Loss Awareness</h3>
                  <p className="text-gray-600 mt-1">
                    Debits are flagged in light red, helping you spot expenses and losses instantly.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Visual Content */}
          <div className="order-1 lg:order-2 relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-100/50 to-rose-100/50 rounded-3xl blur-3xl -z-10" />
            
            <div className="relative space-y-4">
              {/* Mock Transaction Card - Profit */}
              <motion.div 
                initial={{ x: 50, opacity: 0 }}
                whileInView={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
              >
                <Card className="border-l-4 border-l-emerald-500 shadow-lg">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-emerald-100 rounded-full">
                        <ArrowUpRight weight="bold" className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Sale to Raj Traders</p>
                        <p className="text-sm text-gray-500">Today, 10:30 AM</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-emerald-600">+ ₹12,500</p>
                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">Profit</Badge>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Mock Transaction Card - Loss */}
              <motion.div 
                initial={{ x: 50, opacity: 0 }}
                whileInView={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                viewport={{ once: true }}
              >
                <Card className="border-l-4 border-l-rose-500 shadow-lg">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-rose-100 rounded-full">
                        <ArrowDownLeft weight="bold" className="w-6 h-6 text-rose-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Shop Rent Payment</p>
                        <p className="text-sm text-gray-500">Yesterday, 4:15 PM</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-rose-600">- ₹8,000</p>
                      <Badge variant="secondary" className="bg-rose-50 text-rose-700">Expense</Badge>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Running Balance Card */}
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                viewport={{ once: true }}
                className="mt-8 bg-gray-900 rounded-2xl p-6 text-white shadow-xl"
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400">Net Running Balance</span>
                  <Badge className="bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20">Real-time</Badge>
                </div>
                <div className="text-4xl font-bold">₹ 45,230.00</div>
                <div className="mt-4 flex gap-2 text-sm text-gray-400">
                  <span>Total Credits: <span className="text-emerald-400">₹1.2L</span></span>
                  <span>•</span>
                  <span>Total Debits: <span className="text-rose-400">₹75k</span></span>
                </div>
              </motion.div>

            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

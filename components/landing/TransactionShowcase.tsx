'use client';

import { ArrowDownLeft, ArrowUpRight, Banknote, TrendingUp, TrendingDown } from 'lucide-react';
import React from 'react';
import { motion } from 'motion/react'

type Tx = {
  id: string;
  label: string;
  amount: string;
  type: 'credit' | 'debit';
  time: string;
};

const SAMPLE_TX: Tx[] = [
  { id: 't1', label: 'Payment from Rahul', amount: '+₹4,800', type: 'credit', time: '2m ago' },
  { id: 't2', label: 'Parts purchase', amount: '-₹1,260', type: 'debit', time: '15m ago' },
  { id: 't3', label: 'Service income', amount: '+₹2,150', type: 'credit', time: '42m ago' },
  { id: 't4', label: 'Fuel expense', amount: '-₹740', type: 'debit', time: '1h ago' },
  { id: 't5', label: 'UPI settlement', amount: '+₹9,200', type: 'credit', time: '2h ago' },
  { id: 't6', label: 'Maintenance cost', amount: '-₹3,500', type: 'debit', time: '3h ago' },
  { id: 't7', label: 'Customer payment', amount: '+₹6,400', type: 'credit', time: '4h ago' },
];

export default function TransactionShowcase() {
  return (
    <section className="relative py-24 overflow-hidden bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="order-2 lg:order-1">
            <div className="relative rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-blue-500" />

              {/* Fake Header */}
              <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Live Feed</div>
              </div>

              <div className="p-6 bg-gray-50/30">
                <div className="space-y-3">
                  {SAMPLE_TX.slice(0, 5).map((tx, i) => (
                    <motion.div
                      key={tx.id}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${tx.type === 'credit' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                          {tx.type === 'credit' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{tx.label}</p>
                          <p className="text-xs text-gray-500">{tx.time}</p>
                        </div>
                      </div>
                      <span className={`font-bold ${tx.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {tx.amount}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Footer Stats */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-between items-center text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Updating live
                </div>
                <div className="font-medium text-gray-900">Total Volume: ₹28,050</div>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-blue-50 text-blue-700 text-sm font-medium">
              <Banknote className="w-4 h-4" />
              <span>Real-time Tracking</span>
            </div>
            <h2 className="text-4xl font-bold text-gray-900 mb-6">
              See your cashflow in <span className="text-blue-600">real-time</span>
            </h2>
            <p className="text-lg text-gray-600 mb-8 leading-relaxed">
              No more guessing where your money went. Every transaction is recorded instantly and your balance is updated automatically.
            </p>

            <div className="grid grid-cols-2 gap-6">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                <TrendingUp className="w-8 h-8 text-emerald-600 mb-3" />
                <div className="text-2xl font-bold text-emerald-700">₹22.5k</div>
                <div className="text-sm text-emerald-600">Total Credits</div>
              </div>
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-100">
                <TrendingDown className="w-8 h-8 text-rose-600 mb-3" />
                <div className="text-2xl font-bold text-rose-700">₹5.5k</div>
                <div className="text-sm text-rose-600">Total Debits</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}



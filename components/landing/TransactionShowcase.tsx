'use client';

import { ArrowDownLeft, ArrowUpRight, Banknote, CreditCard, Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import React from 'react';

type Tx = {
  id: string;
  label: string;
  amount: string;
  type: 'credit' | 'debit';
};

const SAMPLE_TX: Tx[] = [
  { id: 't1', label: 'Payment from Rahul', amount: '+₹4,800', type: 'credit' },
  { id: 't2', label: 'Parts purchase', amount: '-₹1,260', type: 'debit' },
  { id: 't3', label: 'Service income', amount: '+₹2,150', type: 'credit' },
  { id: 't4', label: 'Fuel expense', amount: '-₹740', type: 'debit' },
  { id: 't5', label: 'UPI settlement', amount: '+₹9,200', type: 'credit' },
  { id: 't6', label: 'Maintenance cost', amount: '-₹3,500', type: 'debit' },
  { id: 't7', label: 'Customer payment', amount: '+₹6,400', type: 'credit' },
];

export default function TransactionShowcase() {
  return (
    <section className="relative py-16 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-emerald-100">
              <Banknote className="h-5 w-5 text-emerald-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900">Live Transaction Feed</h3>
          </div>
          <p className="text-gray-600 text-sm">Watch your credits and debits flow in real-time</p>
        </div>

        {/* Marquee Container */}
        <div className="relative rounded-2xl border-2 border-emerald-200/50 bg-gradient-to-br from-emerald-50/50 via-white to-rose-50/50 backdrop-blur-sm shadow-xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-100/20 via-transparent to-rose-100/20" />
          
          {/* Animated background pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0" style={{
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(16, 185, 129, 0.1) 10px, rgba(16, 185, 129, 0.1) 20px)',
            }} />
          </div>

          <div className="relative px-6 py-8">
            <div className="relative h-20 overflow-hidden">
              <div className="absolute inset-0 flex items-center gap-6 animate-marquee will-change-transform">
                {[...SAMPLE_TX, ...SAMPLE_TX, ...SAMPLE_TX].map((t, i) => (
                  <Chip key={`${t.id}-${i}`} tx={t} />
                ))}
              </div>
            </div>
            
            {/* Gradient fades */}
            <div className="pointer-events-none absolute left-0 top-0 h-full w-32 bg-gradient-to-r from-emerald-50/50 via-white/50 to-transparent z-10" />
            <div className="pointer-events-none absolute right-0 top-0 h-full w-32 bg-gradient-to-l from-rose-50/50 via-white/50 to-transparent z-10" />
          </div>

          {/* Stats footer */}
          <div className="border-t border-emerald-200/30 bg-white/40 backdrop-blur-sm px-6 py-4">
            <div className="flex items-center justify-center gap-8 text-sm">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <span className="text-gray-700 font-medium">Credits</span>
                <span className="text-emerald-600 font-bold">+₹22,550</span>
              </div>
              <div className="h-4 w-px bg-gray-300" />
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-rose-600" />
                <span className="text-gray-700 font-medium">Debits</span>
                <span className="text-rose-600 font-bold">-₹5,500</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes marquee {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-33.333%);
          }
        }
        .animate-marquee {
          width: 300%;
          animation: marquee 40s linear infinite;
        }
      `}</style>
    </section>
  );
}

function Chip({ tx }: { tx: Tx }) {
  const isCredit = tx.type === 'credit';
  return (
    <div
      className={[
        'flex items-center gap-3 whitespace-nowrap rounded-xl border-2 px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-sm transition-all hover:scale-105',
        isCredit
          ? 'bg-gradient-to-r from-emerald-100 to-emerald-50 text-emerald-800 border-emerald-300 shadow-emerald-200/50'
          : 'bg-gradient-to-r from-rose-100 to-rose-50 text-rose-800 border-rose-300 shadow-rose-200/50',
      ].join(' ')}
    >
      <div className={`p-1.5 rounded-lg ${isCredit ? 'bg-emerald-200' : 'bg-rose-200'}`}>
        {isCredit ? (
          <ArrowUpRight className="h-4 w-4" />
        ) : (
          <ArrowDownLeft className="h-4 w-4" />
        )}
      </div>
      <span className="text-base font-bold">{tx.amount}</span>
      <div className="h-4 w-px bg-current opacity-30" />
      <span className="text-gray-700">{tx.label}</span>
      <div className="ml-1">
        {isCredit ? (
          <Wallet className="h-4 w-4 opacity-70" />
        ) : (
          <CreditCard className="h-4 w-4 opacity-70" />
        )}
      </div>
    </div>
  );
}



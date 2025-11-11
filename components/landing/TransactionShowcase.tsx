'use client';

import { ArrowDownLeft, ArrowUpRight, Banknote, CreditCard, IndianRupee, Wallet } from 'lucide-react';
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
];

export default function TransactionShowcase() {
  return (
    <section className="relative py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border bg-white/70 backdrop-blur px-4 py-6 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
            <Banknote className="h-5 w-5 text-emerald-600" />
            <h3 className="text-sm font-medium text-gray-700">Live transactions</h3>
          </div>

          <div className="relative h-16">
            <div className="absolute inset-0 flex items-center gap-4 animate-marquee will-change-transform">
              {[...SAMPLE_TX, ...SAMPLE_TX].map((t, i) => (
                <Chip key={`${t.id}-${i}`} tx={t} />
              ))}
            </div>
            <div className="pointer-events-none absolute left-0 top-0 h-full w-20 bg-gradient-to-r from-white to-transparent" />
            <div className="pointer-events-none absolute right-0 top-0 h-full w-20 bg-gradient-to-l from-white to-transparent" />
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes marquee {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-marquee {
          width: 200%;
          animation: marquee 30s linear infinite;
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
        'flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-2 text-sm shadow-sm',
        isCredit
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-rose-50 text-rose-700 border-rose-200',
      ].join(' ')}
    >
      {isCredit ? (
        <ArrowUpRight className="h-4 w-4" />
      ) : (
        <ArrowDownLeft className="h-4 w-4" />
      )}
      <span className="font-medium">{tx.amount}</span>
      <span className="text-gray-500">•</span>
      <span className="text-gray-700">{tx.label}</span>
      {isCredit ? (
        <Wallet className="ml-2 h-4 w-4 opacity-70" />
      ) : (
        <CreditCard className="ml-2 h-4 w-4 opacity-70" />
      )}
      <IndianRupee className="h-4 w-4 opacity-60" />
    </div>
  );
}



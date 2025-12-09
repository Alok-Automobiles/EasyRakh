'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { motion } from 'motion/react';

type Transaction = {
  name: string;
  note: string;
  amount: string;
  type: 'in' | 'out';
  time: string;
};

const leftTransactions: Transaction[] = [
  {
    name: 'Raj Traders',
    note: 'Payment received',
    amount: '+₹12,500',
    type: 'in',
    time: 'Today, 9:10 AM',
  },
  {
    name: 'Metro Supplies',
    note: 'Paid for inventory',
    amount: '-₹7,800',
    type: 'out',
    time: 'Yesterday, 5:42 PM',
  },
  {
    name: 'GST Payment',
    note: 'Quarterly tax',
    amount: '-₹3,200',
    type: 'out',
    time: '12 May, 10:00 AM',
  },
];

const rightTransactions: Transaction[] = [
  {
    name: 'Online Orders',
    note: 'Settlement received',
    amount: '+₹18,940',
    type: 'in',
    time: 'Today, 7:55 AM',
  },
  {
    name: 'Rent (March)',
    note: 'Office & warehouse',
    amount: '-₹14,000',
    type: 'out',
    time: '01 Mar, 9:00 AM',
  },
  {
    name: 'UPI - Arjun',
    note: 'Short-term advance',
    amount: '+₹2,500',
    type: 'in',
    time: '28 Feb, 6:20 PM',
  },
];

function TransactionCard({ tx, align }: { tx: Transaction; align?: 'left' | 'right' }) {
  const isIn = tx.type === 'in';
  return (
    <div
      className={`w-full max-w-[280px] rounded-2xl border border-gray-100 bg-white/90 px-4 py-3 shadow-md backdrop-blur-sm transition-transform ${align === 'left' ? 'origin-top-right' : 'origin-top-left'
        }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">{tx.name}</p>
          <p className="text-xs text-gray-500">{tx.note}</p>
        </div>
        <span className={`text-sm font-semibold ${isIn ? 'text-emerald-600' : 'text-rose-600'}`}>
          {tx.amount}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-500">
        <span
          className={`inline-flex items-center rounded-full px-2 py-1 font-semibold ${isIn ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}
        >
          {isIn ? 'Money in' : 'Money out'}
        </span>
        <span className="text-gray-400">•</span>
        <span>{tx.time}</span>
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section className="relative min-h-screen w-full bg-white overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to right, #e7e5e4 1px, transparent 1px),linear-gradient(to bottom, #e7e5e4 1px, transparent 1px)`, backgroundSize: "20px 20px", backgroundPosition: "0 0, 0 0", maskImage: `repeating-linear-gradient(to right,black 0px,black 3px,transparent 3px,transparent 8px),repeating-linear-gradient(to bottom,black 0px,black 3px,transparent 3px,transparent 8px),radial-gradient(ellipse 80% 80% at 100% 0%, #000 50%, transparent 90%)`, WebkitMaskImage: `repeating-linear-gradient(to right,black 0px,black 3px,transparent 3px,transparent 8px),repeating-linear-gradient(to bottom,black 0px,black 3px,transparent 3px,transparent 8px),radial-gradient(ellipse 80% 80% at 100% 0%, #000 50%, transparent 90%)`, maskComposite: "intersect", WebkitMaskComposite: "source-in",
        }}
      />
      <div className="z-10 flex min-h-screen items-center px-4 py-24 sm:px-6 lg:px-8">
        <div className="relative max-w-2/3 mx-auto items-center gap-10">
          {/* <div className="absolute bottom-0 left-0 flex flex-col items-center gap-6 lg:items-end">
            {leftTransactions.map((tx, idx) => (
              <motion.div
                key={tx.name}
                initial={{ opacity: 0, x: -60 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 + idx * 0.1 }}
                className={`w-full ${idx === 1 ? 'lg:-mr-4' : ''} ${idx === 2 ? 'lg:-mr-8' : ''}`}
              >
                <TransactionCard tx={tx} align="left" />
              </motion.div>
            ))}
          </div> */}

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="flex flex-col items-center text-center gap-6 px-4"
          >
            <div className="inline-flex items-center gap-3 rounded-full border border-gray-200 bg-white/90 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 shadow-sm backdrop-blur">
              Ledger-first
              <span className="text-gray-600 font-normal normal-case tracking-normal">Built for small Indian Businesses</span>
            </div>
            <h1 className="text-4xl font-bold leading-[1.08] text-gray-900 sm:text-5xl lg:text-6xl">
              Master your Cashflow with EasyRakh
            </h1>
            <p className="text-base text-gray-600 sm:text-lg w-4/5">
              Track credits, debits, and daily cash in minutes. No more messy spreadsheets—just a clean
              ledger that keeps your cashflow clear.
            </p>

            <Button
              asChild
              size="lg"
              className="text-base rounded-full px-8 py-6 bg-(--brand-green) hover:bg-[#059669] text-white shadow-lg shadow-emerald-200/60 transition-all hover:scale-105"
            >
              <Link href="/register">Get Started</Link>
            </Button>
          </motion.div>

          {/* <div className="absolute bottom-[-50%] right-[-25%] flex flex-col items-center gap-6 lg:items-start">
            {rightTransactions.map((tx, idx) => (
              <motion.div
                key={tx.name}
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 + idx * 0.1 }}
                className={`w-full ${idx === 1 ? 'lg:-ml-4' : ''} ${idx === 2 ? 'lg:-ml-8' : ''}`}
              >
                <TransactionCard tx={tx} align="right" />
              </motion.div>
            ))}
          </div> */}
        </div>
      </div>
    </section>
  );
}

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
    <section className="relative min-h-screen w-full bg-white overflow-hidden pt-10 sm:pt-14">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to right, #e7e5e4 1px, transparent 1px),linear-gradient(to bottom, #e7e5e4 1px, transparent 1px)`,
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 0',
          maskImage: `repeating-linear-gradient(to right,black 0px,black 3px,transparent 3px,transparent 8px),repeating-linear-gradient(to bottom,black 0px,black 3px,transparent 3px,transparent 8px),radial-gradient(ellipse 80% 80% at 100% 0%, #000 50%, transparent 90%)`,
          WebkitMaskImage: `repeating-linear-gradient(to right,black 0px,black 3px,transparent 3px,transparent 8px),repeating-linear-gradient(to bottom,black 0px,black 3px,transparent 3px,transparent 8px),radial-gradient(ellipse 80% 80% at 100% 0%, #000 50%, transparent 90%)`,
          maskComposite: 'intersect',
          WebkitMaskComposite: 'source-in',
        }}
      />
      <div className="z-10 flex min-h-screen items-center px-4 py-16 sm:px-6 lg:px-10">
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-12 lg:gap-16">
          <div className="grid items-center justify-items-center gap-12 lg:gap-16 md:grid-cols-[1.05fr,0.95fr]">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="flex flex-col items-center gap-6 text-center"
            >
              <div className="inline-flex items-center justify-center self-center rounded-full border border-gray-200 bg-white/90 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 shadow-sm backdrop-blur">
                Whole business, one place
              </div>
              <h1 className="text-4xl font-bold leading-[1.08] text-gray-900 sm:text-5xl lg:text-6xl">
                See your entire business at a glance with EasyRakh
              </h1>
              <p className="text-base text-gray-600 sm:text-lg md:max-w-2xl leading-relaxed">
                Khata, daily cash, GST invoices, and your dashboard—together in one workspace, so you always know how the business stands.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <Button
                  asChild
                  size="lg"
                  className="text-base rounded-full px-8 py-6 bg-(--brand-green) hover:bg-[#0d9488] text-primary-foreground shadow-lg shadow-emerald-200/60 transition-all hover:scale-105"
                >
                  <Link href="/register">Get Started</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="text-base rounded-full px-8 py-6 border-gray-200 text-gray-800 hover:bg-gray-100"
                >
                  <Link href="#contact">Talk to us</Link>
                </Button>
              </div>
              <div className="grid w-full max-w-3xl gap-3 text-left sm:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-sm backdrop-blur">
                  <p className="text-xs uppercase text-gray-500">Satisfied customers</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">10+</p>
                  <p className="text-xs text-emerald-700 font-semibold">Growing weekly</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-sm backdrop-blur">
                  <p className="text-xs uppercase text-gray-500">Tracked this month</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">₹18.4 Cr</p>
                  <p className="text-xs text-gray-600">Cash in/out recorded</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-sm backdrop-blur">
                  <p className="text-xs uppercase text-gray-500">Setup time</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">Under 5 min</p>
                  <p className="text-xs text-gray-600">Import & start tracking</p>
                </div>
              </div>
            </motion.div>

            <div className="relative">
              <div className="absolute -left-8 -top-10 h-32 w-32 rounded-full bg-emerald-100 blur-3xl sm:-left-14 sm:-top-14" />
              <div className="absolute -right-6 bottom-10 h-28 w-28 rounded-full bg-blue-100 blur-3xl sm:-right-10" />
              <div className="relative rounded-3xl border border-gray-200/70 bg-white/85 p-5 shadow-xl backdrop-blur">
                <div className="flex items-center justify-between rounded-2xl bg-neutral-900 px-4 py-3 text-white shadow-md">
                  <div>
                    <p className="text-xs uppercase text-white/70">Today’s cash position</p>
                    <p className="text-2xl font-semibold mt-1">₹3,20,750</p>
                  </div>
                  <div className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-emerald-200">
                    +₹18,940 today
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {leftTransactions.map((tx, idx) => (
                    <motion.div
                      key={tx.name}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.1 + idx * 0.1 }}
                    >
                      <TransactionCard tx={tx} align="left" />
                    </motion.div>
                  ))}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {rightTransactions.map((tx, idx) => (
                    <motion.div
                      key={tx.name}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.25 + idx * 0.1 }}
                    >
                      <TransactionCard tx={tx} align="right" />
                    </motion.div>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white/90 px-4 py-3 text-sm text-gray-700 shadow-sm backdrop-blur">
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 font-semibold text-xs">
                    On-time payouts
                  </div>
                  <span className="text-gray-400">•</span>
                  <span>Attach bills & notes to every entry</span>
                  <span className="hidden sm:inline text-gray-400">•</span>
                  <span className="hidden sm:inline">Auto-reminders for dues</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

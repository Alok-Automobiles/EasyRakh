'use client';

import { Card, CardContent } from '@/components/ui/card';
import {
  PiggyBank,
  BarChart3,
  Shield,
  IndianRupee,
  Wallet,
  Calculator,
} from 'lucide-react';
import React from 'react';

const FEATURES = [
  {
    icon: PiggyBank,
    title: 'Profit-focused UI',
    color: 'bg-emerald-100 text-emerald-700',
    desc: 'Light green accents highlight credits so you always see gains first.',
  },
  {
    icon: Calculator,
    title: 'Auto running balance',
    color: 'bg-rose-100 text-rose-700',
    desc: 'Debits and credits netted automatically with clear per-entity logic.',
  },
  {
    icon: BarChart3,
    title: 'Insights that matter',
    color: 'bg-emerald-100 text-emerald-700',
    desc: 'At-a-glance stats of receivables, payables, and recent activity.',
  },
  {
    icon: Wallet,
    title: 'Fast entry workflows',
    color: 'bg-emerald-100 text-emerald-700',
    desc: 'Keyboard-friendly forms so recording transactions is frictionless.',
  },
  {
    icon: IndianRupee,
    title: 'Made for India',
    color: 'bg-emerald-100 text-emerald-700',
    desc: 'Rupee-first formatting and familiar terminology throughout.',
  },
  {
    icon: Shield,
    title: 'Secure & private',
    color: 'bg-rose-100 text-rose-700',
    desc: 'Account-level isolation with modern best practices.',
  },
];

export default function Features() {
  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900">Why choose our ledger?</h2>
          <p className="mt-3 text-gray-600">
            Everything you need to track transactions clearly and confidently.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <Card key={f.title} className="border-2 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center mb-4">
                  <div className={`p-3 rounded-lg mr-4 ${f.color}`}>
                    <f.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                </div>
                <p className="text-gray-600">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}



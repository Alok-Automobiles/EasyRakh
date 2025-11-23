'use client';

import { NotePencil, Money, CheckCircle } from '@phosphor-icons/react';
import { Card, CardContent } from '@/components/ui/card';

export default function DailyOperations() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl mb-4">
            Beyond Just Transactions
          </h2>
          <p className="text-lg text-gray-600">
            Capture the full context of your business day. Track cash flow separately and keep detailed notes for every important event.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Daily Cash Records */}
          <div className="relative group">
            <div className="absolute -inset-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-3xl blur-xl -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-lg h-full">
              <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mb-6">
                <Money weight="duotone" className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Daily Cash Records</h3>
              <p className="text-gray-600 mb-6">
                Keep a dedicated log of your physical cash flow. Reconcile your cash drawer at the end of the day without mixing it with your main ledger.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-gray-700">
                  <CheckCircle weight="fill" className="w-5 h-5 text-emerald-500" />
                  <span>Track opening & closing balances</span>
                </li>
                <li className="flex items-center gap-3 text-gray-700">
                  <CheckCircle weight="fill" className="w-5 h-5 text-emerald-500" />
                  <span>Record petty cash expenses</span>
                </li>
                <li className="flex items-center gap-3 text-gray-700">
                  <CheckCircle weight="fill" className="w-5 h-5 text-emerald-500" />
                  <span>Separate from bank transactions</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Notes & Context */}
          <div className="relative group">
            <div className="absolute -inset-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-3xl blur-xl -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-lg h-full">
              <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mb-6">
                <NotePencil weight="duotone" className="w-7 h-7 text-amber-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Smart Notes</h3>
              <p className="text-gray-600 mb-6">
                Don't rely on memory. Attach detailed notes to any transaction or day. Store images of bills, receipts, or important documents.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-gray-700">
                  <CheckCircle weight="fill" className="w-5 h-5 text-amber-500" />
                  <span>Attach photos of receipts</span>
                </li>
                <li className="flex items-center gap-3 text-gray-700">
                  <CheckCircle weight="fill" className="w-5 h-5 text-amber-500" />
                  <span>Add context to vague transactions</span>
                </li>
                <li className="flex items-center gap-3 text-gray-700">
                  <CheckCircle weight="fill" className="w-5 h-5 text-amber-500" />
                  <span>Searchable history</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

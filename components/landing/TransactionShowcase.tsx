'use client';

import { Money, Lightning, DeviceMobile, CurrencyInr } from '@phosphor-icons/react';
import React from 'react';
import { Iphone } from '@/components/ui/iphone';

export default function TransactionShowcase() {
  return (
    <section className="relative py-24 overflow-hidden bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Left Side: Content */}
          <div>
            <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 rounded-full bg-emerald-100 border border-emerald-200">
              <DeviceMobile weight="duotone" className="h-4 w-4 text-emerald-700" />
              <span className="text-xs font-medium text-emerald-700 uppercase tracking-wider">Mobile Optimized</span>
            </div>
            
            <h2 className="text-4xl font-bold text-gray-900 mb-6">
              Designed for Fast, <br />
              <span className="text-emerald-600">On-the-Go</span> Bookkeeping
            </h2>
            
            <p className="text-lg text-gray-600 mb-8">
              Business doesn't happen at a desk. EasyRakh is built to work perfectly on your phone, so you can record transactions the moment they happen.
            </p>

            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center">
                  <Lightning weight="duotone" className="w-6 h-6 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Fast Entry Workflows</h3>
                  <p className="text-gray-600">
                    Keyboard-friendly forms designed for speed. Record a transaction in seconds with minimal taps.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center">
                  <CurrencyInr weight="bold" className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Localized for India</h3>
                  <p className="text-gray-600">
                    Built with Indian business owners in mind. Rupee formatting (₹) and familiar terminology throughout.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: iPhone Showcase */}
          <div className="flex justify-center items-center relative z-10">
            <div className="relative">
              {/* Glow effect behind the phone */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[100px] -z-10" />
              
              <Iphone 
                videoSrc="/App_Advertisement_Video_Generated.mp4"
                className="w-[300px] sm:w-[350px] shadow-2xl rounded-[3rem]"
              />
              
              {/* Floating Badge 1 */}
              <div className="absolute -right-8 top-1/4 bg-white p-4 rounded-2xl shadow-xl border border-gray-100 animate-bounce duration-[3000ms]">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Money weight="duotone" className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Daily Cash</p>
                    <p className="font-bold text-gray-900">₹ 12,400</p>
                  </div>
                </div>
              </div>

              {/* Floating Badge 2 */}
              <div className="absolute -left-8 bottom-1/4 bg-white p-4 rounded-2xl shadow-xl border border-gray-100 animate-bounce duration-[4000ms]">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-rose-100 rounded-lg">
                    <Lightning weight="duotone" className="w-5 h-5 text-rose-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Quick Expense</p>
                    <p className="font-bold text-gray-900">- ₹ 500</p>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}



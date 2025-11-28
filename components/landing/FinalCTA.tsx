'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

export default function FinalCTA() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-emerald-900">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 to-emerald-950" />
      </div>
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6 tracking-tight">
          Ready to simplify your business?
        </h2>
        <p className="text-xl text-emerald-100 mb-10 max-w-2xl mx-auto">
          Join thousands of Indian businesses using EasyRakh to track their cashflow and grow their profits.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
          <Button asChild size="lg" className="text-base px-8 py-6 bg-white text-emerald-900 hover:bg-emerald-50 shadow-xl shadow-emerald-900/20 transition-all hover:scale-105 font-bold cursor-none">
            <Link href="/register">
              Get Started Free
              <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
          </Button>
          
          <Button
            asChild
            size="lg"
            variant="outline"
            className="text-base px-8 py-6 bg-transparent border-emerald-700 text-white hover:bg-emerald-800 hover:text-white transition-all hover:scale-105 cursor-none"
          >
            <Link href="/login">Sign In</Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-emerald-200/80 text-sm border-t border-emerald-800/50 pt-8 max-w-2xl mx-auto">
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>Free forever plan</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>No credit card required</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>Secure & Private</span>
          </div>
        </div>
      </div>
    </section>
  );
}
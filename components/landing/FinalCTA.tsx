'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import React from 'react';

export default function FinalCTA() {
  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-500 via-emerald-400 to-rose-400 text-white">
            <div className="px-8 py-12 text-center">
              <h2 className="text-3xl font-bold">Ready to get started?</h2>
              <p className="mt-2 text-emerald-50">
                Join now and keep your books in the green.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild size="lg" variant="secondary" className="px-8 py-6">
                  <Link href="/register">Get started free</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="px-8 py-6 border-white text-white hover:bg-white hover:text-emerald-600"
                >
                  <Link href="/login">Sign in</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}



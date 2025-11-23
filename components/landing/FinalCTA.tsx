'use client';

import React from 'react';

export default function FinalCTA() {
  return (
    <section className="py-16 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl overflow-hidden shadow-2xl border-2 border-black">
          {/* White background with gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-white via-gray-50 to-gray-100"></div>
          
          {/* Decorative elements */}
          <div className="absolute top-0 left-0 w-64 h-64 bg-gray-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-gray-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{animationDelay: '1s'}}></div>
          
          {/* Content */}
          <div className="relative px-8 py-16 text-center">
            <div className="inline-block mb-4">
              <span className="px-4 py-2 rounded-full bg-black/5 backdrop-blur-sm text-black text-sm font-semibold border border-black/10">
                🎉 Limited Time Offer
              </span>
            </div>
            
            <h2 className="text-4xl md:text-5xl font-bold text-black mb-4">
              Ready to Transform Your Finances?
            </h2>
            
            <p className="mt-4 text-xl text-gray-700 max-w-2xl mx-auto leading-relaxed">
              Join thousands keeping their books perfectly balanced. 
              All your financial insights in one place.
            </p>
            
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a
                href="/register"
                className="group relative px-8 py-4 bg-black text-white rounded-xl font-bold text-lg shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-200 overflow-hidden"
              >
                <span className="relative z-10">Get Started Free</span>
                <div className="absolute inset-0 bg-gray-900 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </a>
              
              <a
                href="/login"
                className="group px-8 py-4 bg-transparent text-black rounded-xl font-bold text-lg border-2 border-black/80 hover:bg-black hover:text-white transform hover:scale-105 transition-all duration-200 shadow-lg"
              >
                Sign In
              </a>
            </div>
            
            <div className="mt-8 flex items-center justify-center gap-6 text-gray-400 text-sm">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Free forever plan</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
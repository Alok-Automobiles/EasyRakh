'use client';

import { ShieldCheck, Lock, Server } from 'lucide-react';

export default function SecuritySection() {
  return (
    <section className="py-24 bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl font-bold sm:text-4xl mb-4">
            Bank-Grade Security for Your Business Data
          </h2>
          <p className="text-lg text-gray-400">
            We take your financial data seriously. Your information is encrypted, isolated, and backed up securely.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div className="p-6 rounded-2xl bg-gray-800/50 border border-gray-700 hover:bg-gray-800 transition-colors">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Secure Authentication</h3>
            <p className="text-gray-400">
              Robust login and registration systems ensure only you have access to your ledger.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-gray-800/50 border border-gray-700 hover:bg-gray-800 transition-colors">
            <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldCheck className="w-8 h-8 text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Account Isolation</h3>
            <p className="text-gray-400">
              Your data is logically isolated from other users, ensuring complete privacy and confidentiality.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-gray-800/50 border border-gray-700 hover:bg-gray-800 transition-colors">
            <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Server className="w-8 h-8 text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Daily Backups</h3>
            <p className="text-gray-400">
              Never lose a transaction. Our systems automatically backup your data to prevent data loss.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

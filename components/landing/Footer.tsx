'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-200 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          {/* Logo */}
          <Link href="/" className="text-2xl font-bold text-gray-900">
            Easy<span className="text-emerald-600">Rakh</span>
          </Link>

          {/* Visit Site Section */}
          <div className="flex items-center gap-3">
            <div className="text-lg font-medium text-gray-900">Visit site</div>
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Search className="w-5 h-5 text-emerald-700" />
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 pt-8 border-t border-gray-200 text-center">
          <p className="text-sm text-gray-600">
            © EasyRakh {currentYear}
          </p>
        </div>
      </div>
    </footer>
  );
}




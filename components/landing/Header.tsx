'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'framer-motion';

export default function LandingHeader() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="text-2xl font-bold text-gray-900">
            Easy<span className="text-emerald-600">Rakh</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <Link href="/" className="text-gray-700 hover:text-gray-900 text-sm font-medium">
              Home
            </Link>
            <Link href="/about" className="text-gray-700 hover:text-gray-900 text-sm font-medium">
              About
            </Link>
          </nav>

          {/* CTA Button */}
          <div className="flex items-center space-x-4">
            <Button
              asChild
              className="hidden md:flex bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              <Link href="/register">Sign Up</Link>
            </Button>
            
            {/* Mobile Menu Button */}
            <button
              type="button"
              className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:bg-gray-100"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <motion.div
          initial={false}
          animate={{
            height: isMobileMenuOpen ? 'auto' : 0,
            opacity: isMobileMenuOpen ? 1 : 0,
          }}
          transition={{ duration: 0.2 }}
          className="md:hidden overflow-hidden"
        >
          <nav className="flex flex-col space-y-2 py-4 border-t border-gray-200">
            <Link
              href="/"
              className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Home
            </Link>
            <Link
              href="/about"
              className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              About
            </Link>
            <Button
              asChild
              className="mt-2 bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              <Link href="/register" onClick={() => setIsMobileMenuOpen(false)}>
                Sign Up
              </Link>
            </Button>
          </nav>
        </motion.div>
      </div>
    </header>
  );
}




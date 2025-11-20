'use client';

import Link from 'next/link';
import { ComicText } from '@/components/ui/comic-text';
import { Facebook, Twitter, Instagram, Linkedin, Mail, Phone, MapPin } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          
          {/* Brand Column */}
          <div>
            <div className="flex items-center gap-2 mb-6">
              <ComicText
                fontSize={2}
                style={{
                  backgroundColor: '#10b981',
                  backgroundImage: 'radial-gradient(circle at 1px 1px, #065f46 1px, transparent 0)',
                  WebkitTextStroke: '2px #000000',
                  filter: 'drop-shadow(3px 3px 0px #000000) drop-shadow(2px 2px 0px #065f46)',
                }}
              >
                Easy
              </ComicText>
              <ComicText
                fontSize={2}
                style={{
                  backgroundColor: '#f43f5e',
                  backgroundImage: 'radial-gradient(circle at 1px 1px, #be123c 1px, transparent 0)',
                  WebkitTextStroke: '2px #000000',
                  filter: 'drop-shadow(3px 3px 0px #000000) drop-shadow(2px 2px 0px #be123c)',
                }}
              >
                Rakh
              </ComicText>
            </div>
            <p className="text-gray-500 mb-6">
              Simple Ledger for Profits and Losses. Track every rupee with confidence and grow your business.
            </p>
            <div className="flex gap-4">
              <Link href="#" className="text-gray-400 hover:text-emerald-600 transition-colors">
                <Facebook className="h-5 w-5" />
              </Link>
              <Link href="#" className="text-gray-400 hover:text-emerald-600 transition-colors">
                <Twitter className="h-5 w-5" />
              </Link>
              <Link href="#" className="text-gray-400 hover:text-emerald-600 transition-colors">
                <Instagram className="h-5 w-5" />
              </Link>
              <Link href="#" className="text-gray-400 hover:text-emerald-600 transition-colors">
                <Linkedin className="h-5 w-5" />
              </Link>
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">Product</h3>
            <ul className="space-y-3">
              <li><Link href="#" className="text-gray-500 hover:text-emerald-600 transition-colors">Features</Link></li>
              <li><Link href="#" className="text-gray-500 hover:text-emerald-600 transition-colors">Pricing</Link></li>
              <li><Link href="#" className="text-gray-500 hover:text-emerald-600 transition-colors">Security</Link></li>
              <li><Link href="#" className="text-gray-500 hover:text-emerald-600 transition-colors">Mobile App</Link></li>
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">Company</h3>
            <ul className="space-y-3">
              <li><Link href="#" className="text-gray-500 hover:text-emerald-600 transition-colors">About Us</Link></li>
              <li><Link href="#" className="text-gray-500 hover:text-emerald-600 transition-colors">Careers</Link></li>
              <li><Link href="#" className="text-gray-500 hover:text-emerald-600 transition-colors">Blog</Link></li>
              <li><Link href="#" className="text-gray-500 hover:text-emerald-600 transition-colors">Contact</Link></li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">Contact</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-gray-500">
                <MapPin className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                <span>123 Business Park, Sector 62, Noida, India</span>
              </li>
              <li className="flex items-center gap-3 text-gray-500">
                <Phone className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                <span>+91 98765 43210</span>
              </li>
              <li className="flex items-center gap-3 text-gray-500">
                <Mail className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                <span>support@easyrakh.com</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-400">
            © {new Date().getFullYear()} EasyRakh. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-gray-400">
            <Link href="#" className="hover:text-emerald-600 transition-colors">Privacy Policy</Link>
            <Link href="#" className="hover:text-emerald-600 transition-colors">Terms of Service</Link>
            <Link href="#" className="hover:text-emerald-600 transition-colors">Cookie Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

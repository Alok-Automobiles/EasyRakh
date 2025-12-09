'use client';

import { Mail, MessageSquare } from 'lucide-react';
import Link from 'next/link';

export default function Contact() {
  return (
    <section
      id="contact"
      className="py-16 sm:py-20 bg-[var(--brand-bg)]"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-white/80 border border-gray-100 shadow-lg backdrop-blur-sm px-6 sm:px-10 py-10 sm:py-12 flex flex-col gap-6 sm:gap-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">Contact</p>
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
                Need to talk to us?
              </h3>
              <p className="text-gray-600 mt-2">
                We reply quickly with the details you share below.
              </p>
            </div>
            <Link
              href="mailto:hello@easyrakh.com"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-green)] text-white px-4 py-2 text-sm font-semibold shadow-md hover:bg-[#059669] transition-colors"
            >
              <Mail className="w-4 h-4" />
              hello@easyrakh.com
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <MessageSquare className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-gray-900">WhatsApp support</p>
                <p className="text-sm text-gray-600">Contact us on WhatsApp</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <Mail className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-gray-900">Email</p>
                <p className="text-sm text-gray-600">We respond within a business day.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


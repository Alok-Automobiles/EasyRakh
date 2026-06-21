'use client';

import { Mail, MessageSquare, Copy } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export default function Contact() {
  const [copied, setCopied] = useState(false);
  const email = 'support@easyrakh.com';

  const handleCopyEmail = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(email).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <section
      id="contact"
      className="py-20 sm:py-24 bg-(--brand-bg) scroll-mt-28"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10">
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
              href={`mailto:${email}`}
              className="inline-flex items-center gap-2 rounded-full bg-(--brand-green) text-primary-foreground px-4 py-2 text-sm font-semibold shadow-md hover:bg-[#0d9488] transition-colors"
            >
              <Mail className="w-4 h-4" />
              {email}
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="https://wa.me/919555213876"
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50 min-w-0"
            >
              <MessageSquare className="w-5 h-5 text-emerald-600" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">WhatsApp support</p>
                <p className="text-sm text-gray-600">Chat with us</p>
              </div>
            </Link>
            <Link
              href={`mailto:${email}`}
              className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50 min-w-0"
            >
              <Mail className="w-5 h-5 text-emerald-600" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">Email</p>
                <p className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                  <span className="break-all">{email}</span>
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="inline-flex items-center gap-1 rounded-full bg-(--brand-bg) px-2 py-1 text-xs font-semibold text-gray-700 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    aria-label="Copy email address"
                  >
                    <Copy className="w-3 h-3" />
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

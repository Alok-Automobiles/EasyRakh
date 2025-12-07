'use client';

import { Button } from '@/components/ui/button';
import {
  Users,
  Banknote,
  StickyNote,
  Zap,
  ArrowRight,
  CheckCircle2
} from 'lucide-react';
import React from 'react';
import { motion } from 'motion/react'
import Link from 'next/link';
import { Safari } from '@/components/ui/safari';

const FeatureBlock = ({
  icon: Icon,
  title,
  description,
  points,
  color,
  bgColor,
  url,
  image,
  imageFit = 'cover',
  align = 'left',
  delay = 0
}: {
  icon: any,
  title: string,
  description: string,
  points: string[],
  color: string,
  bgColor: string,
  url: string,
  image?: string,
  imageFit?: 'cover' | 'contain',
  align?: 'left' | 'right',
  delay?: number
}) => {
  return (
    <div className={`flex flex-col lg:flex-row items-center gap-12 lg:gap-20 py-16 ${align === 'right' ? 'lg:flex-row-reverse' : ''}`}>
      {/* Text Content */}
      <motion.div
        initial={{ opacity: 0, x: align === 'left' ? -50 : 50 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6, delay }}
        className="flex-1"
      >
        <div className={`inline-flex items-center justify-center p-3 rounded-xl ${bgColor} ${color} mb-6`}>
          <Icon className="w-6 h-6" />
        </div>
        <h3 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 leading-tight">
          {title}
        </h3>
        <p className="text-lg text-gray-600 mb-8 leading-relaxed">
          {description}
        </p>
        <ul className="space-y-4 mb-8">
          {points.map((point, i) => (
            <li key={i} className="flex items-start gap-3">
              <CheckCircle2 className={`w-5 h-5 ${color} mt-0.5 flex-shrink-0`} />
              <span className="text-gray-700">{point}</span>
            </li>
          ))}
        </ul>
      </motion.div>

      {/* Safari Component */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6, delay: delay + 0.2 }}
        className="flex-1 w-full"
      >
        <div className="relative">
          {/* Decorative blobs behind Safari */}
          <div className={`absolute -top-10 -right-10 w-40 h-40 rounded-full ${bgColor} blur-3xl opacity-50 -z-10`} />
          <div className={`absolute -bottom-10 -left-10 w-40 h-40 rounded-full ${bgColor} blur-3xl opacity-50 -z-10`} />

          <Safari
            url={url}
            className="shadow-2xl"
          >
            {/* Custom Content inside Safari Screen */}
            <div
              className={`absolute top-[6.9%] left-[0.1%] w-[99.8%] h-[93%] ${bgColor} bg-opacity-20 flex items-center justify-center overflow-hidden`}
            >
              {image ? (
                <img src={image} alt={title} className={`w-full h-full object-${imageFit} object-top`} />
              ) : (
                <>
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-sm" />
                  <div className="relative z-10 p-8 text-center">
                    <div className={`w-20 h-20 mx-auto rounded-full ${bgColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-500`}>
                      <Icon className={`w-10 h-10 ${color}`} />
                    </div>
                    <p className="font-medium text-gray-500">Interactive Preview</p>
                  </div>
                </>
              )}
            </div>
          </Safari>
        </div>
      </motion.div>
    </div>
  );
};

export default function Features() {
  return (
    <section className="py-24 bg-[var(--brand-bg)] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-24">
          <h2 className="text-base font-semibold text-[var(--brand-green)] tracking-wide uppercase mb-2">Powerful Features</h2>
          <p className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            Manage your entire business in one place
          </p>
          <p className="text-xl text-gray-600">
            From customers to cashflow, EasyRakh gives you the tools to stay in control.
          </p>
        </div>

        <div className="space-y-12">
          {/* 1. Management of Suppliers and Customers */}
          <FeatureBlock
            icon={Users}
            title="Manage Suppliers & Customers"
            description="Keep your business relationships organized. Track who owes you money and who you need to pay, all in distinct, dedicated views."
            points={[
              "Dedicated profiles for every customer and supplier",
              "Instant history of all transactions per person",
              "One-click reminders for pending payments"
            ]}
            color="text-[var(--brand-green)]"
            bgColor="bg-[var(--brand-green-light)]"
            url="easyrakh.com/customers"
            image="/cusotmerPreview.png"
            align="left"
          />

          {/* 2. Daily Cash Record Entry */}
          <FeatureBlock
            icon={Banknote}
            title="Daily Cash Record"
            description="Never lose track of loose cash again. Record your daily cash in and cash out to match your physical drawer with your digital records."
            points={[
              "Simple entry for petty cash expenses",
              "End-of-day tally to prevent mismatch",
              "Separate from credit/debit ledger for clarity"
            ]}
            color="text-[var(--brand-green)]"
            bgColor="bg-[var(--brand-green-light)]"
            url="easyrakh.com/cash-record"
            image="/dailyCashRecord.png"
            align="right"
          />

          {/* 3. Create Notes */}
          <FeatureBlock
            icon={StickyNote}
            title="Smart Notes & To-Dos"
            description="Your business brain, digitized. Jot down important reminders, order details, or future tasks right alongside your financial data."
            points={[
              "Quick sticky notes for immediate reminders",
              "Attach notes to specific transactions",
              "Never forget a promise to a customer"
            ]}
            color="text-[var(--brand-green)]"
            bgColor="bg-[var(--brand-green-light)]"
            url="easyrakh.com/notes"
            image="/notesPreview.png"
            imageFit="contain"
            align="left"
          />

          {/* 4. Fast and Easy UI */}
          <FeatureBlock
            icon={Zap}
            title="Blazing Fast Experience"
            description="Time is money. We designed EasyRakh to be the fastest ledger app you've ever used, with keyboard shortcuts and instant loading."
            points={[
              "Zero lag, instant page loads",
              "Keyboard-first design for rapid data entry",
              "Clean, clutter-free interface that anyone can use"
            ]}
            color="text-[var(--brand-green)]"
            bgColor="bg-[var(--brand-green-light)]"
            url="easyrakh.com/speed"
            image="/fastPreview.png"
            align="right"
          />
        </div>

        <div className="mt-24 text-center">
          <Button asChild size="lg" className="text-lg px-10 py-7 bg-[var(--brand-green)] hover:bg-[#059669] shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1">
            <Link href="/register">
              Start Managing Now
              <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}



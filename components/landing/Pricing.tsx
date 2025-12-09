'use client';

import React from 'react';
import { motion } from 'motion/react'
import { Check, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const features = [
    'Unlimited transactions',
    'Unlimited customers & suppliers',
    'Secure cloud backup',
    'Mobile & Desktop access',
    'Daily cash reports',
    'Payment reminders',
];

export default function Pricing() {
    return (
        <section className="py-24 bg-[var(--brand-bg)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-lg mx-auto">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100"
                    >
                        <div className="p-8 sm:p-10 text-center bg-[var(--brand-green-light)]/30">
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Free Forever</h2>
                            <p className="text-gray-600 mb-6">Everything you need to manage your business finances.</p>
                            <div className="flex items-baseline justify-center gap-1">
                                <span className="text-5xl font-bold text-[var(--brand-green)]">₹0</span>
                                <span className="text-gray-500">/month</span>
                            </div>
                        </div>

                        <div className="p-8 sm:p-10">
                            <ul className="space-y-4 mb-8">
                                {features.map((feature, index) => (
                                    <li key={index} className="flex items-center gap-3">
                                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--brand-green-light)] flex items-center justify-center">
                                            <Check className="w-4 h-4 text-[var(--brand-green)]" />
                                        </div>
                                        <span className="text-gray-700">{feature}</span>
                                    </li>
                                ))}
                            </ul>

                            <div className="bg-(--brand-red-light) rounded-xl p-4 mb-8 flex items-start gap-3">
                                <ShieldCheck className="w-5 h-5 text-rose-500 mt-0.5 shrink-0" />
                                <p className="text-sm text-rose-700">
                                    <strong>No hidden fees. No ads.</strong> Just simple, honest bookkeeping tool to help your business grow.
                                </p>
                            </div>

                            <Button asChild className="w-full rounded-full py-6 text-lg bg-(--brand-green) hover:bg-[#059669] shadow-lg hover:shadow-xl transition-all">
                                <Link href="/register">Get Started for Free</Link>
                            </Button>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

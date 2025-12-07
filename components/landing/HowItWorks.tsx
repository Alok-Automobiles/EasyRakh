'use client';

import React from 'react';
import { motion } from 'motion/react'
import { UserPlus, FileText, TrendingUp, ArrowRight } from 'lucide-react';

const steps = [
    {
        icon: UserPlus,
        title: 'Add Contacts',
        description: 'Add your customers and suppliers in seconds. Create profiles to keep track of everyone you do business with.',
    },
    {
        icon: FileText,
        title: 'Record Transactions',
        description: 'Log credits, debits, and daily cash entries. It’s as simple as writing it in a notebook, but safer.',
    },
    {
        icon: TrendingUp,
        title: 'Track Balance',
        description: 'See your net cashflow instantly. Know exactly how much you owe and how much is owed to you.',
    },
];

export default function HowItWorks() {
    return (
        <section className="py-24 bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <h2 className="text-base font-semibold text-[var(--brand-green)] tracking-wide uppercase mb-2">Simple Process</h2>
                    <p className="text-3xl sm:text-4xl font-bold text-gray-900">
                        How EasyRakh Works
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
                    {/* Connecting Line (Desktop) */}
                    <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-gray-100 -z-10" />

                    {steps.map((step, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.2 }}
                            className="flex flex-col items-center text-center group"
                        >
                            <div className="w-24 h-24 bg-[var(--brand-green-light)] rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 border-4 border-white shadow-sm">
                                <step.icon className="w-10 h-10 text-[var(--brand-green)]" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
                            <p className="text-gray-600 leading-relaxed max-w-xs mx-auto">
                                {step.description}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}

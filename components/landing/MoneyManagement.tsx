'use client';

import { motion } from 'framer-motion';
import { PiggyBank, Target, PieChart, BarChart3, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function MoneyManagement() {
  const steps = [
    {
      number: 1,
      icon: PiggyBank,
      title: 'Automated Savings',
      description: 'Set up automatic savings plans that work in the background to grow your wealth effortlessly.',
    },
    {
      number: 2,
      icon: Target,
      title: 'Track Your Goals',
      description: 'Define and monitor your financial goals with real-time progress tracking and insights.',
    },
    {
      number: 3,
      icon: PieChart,
      title: 'Smart Portfolio',
      description: 'Build a diversified investment portfolio with intelligent recommendations based on your risk profile.',
    },
    {
      number: 4,
      icon: BarChart3,
      title: 'Get Insights',
      description: 'Receive actionable insights and analytics to optimize your financial decisions and maximize returns.',
    },
  ];

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            Change The Way You Use Your Money
          </h2>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Side - Image Placeholder */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl p-12 aspect-square flex items-center justify-center">
              <div className="text-center">
                <div className="w-32 h-32 mx-auto mb-4 rounded-full bg-white/50 flex items-center justify-center">
                  <svg
                    className="w-16 h-16 text-emerald-700"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <p className="text-emerald-800 font-medium">Digital Interface</p>
              </div>
            </div>
          </motion.div>

          {/* Right Side - Steps */}
          <div className="space-y-6">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, x: 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="flex gap-4"
              >
                {/* Step Number & Icon */}
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <step.icon className="w-6 h-6 text-emerald-700" />
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-emerald-700">Step {step.number}:</span>
                    <h3 className="text-lg font-bold text-gray-900">{step.title}</h3>
                  </div>
                  <p className="text-gray-600 mb-3 leading-relaxed">{step.description}</p>
                  <Link
                    href="#"
                    className="text-emerald-700 hover:text-emerald-800 text-sm font-medium inline-flex items-center gap-1"
                  >
                    Read More
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}




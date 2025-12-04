'use client';

import { motion } from 'framer-motion';
import { Shield, TrendingUp, Target } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function WhyChooseUs() {
  const features = [
    {
      icon: Target,
      title: 'Robust Solutions',
      description: 'Comprehensive financial tools designed to handle all your wealth management needs with reliability and precision.',
      visual: 'progress',
    },
    {
      icon: TrendingUp,
      title: 'Long-term Vision',
      description: 'Strategic planning and investment solutions focused on building sustainable wealth for your future.',
      visual: 'graph',
    },
    {
      icon: Shield,
      title: 'Integrity First',
      description: 'Your financial security is our top priority. We maintain the highest standards of data protection and ethical practices.',
      visual: 'shield',
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
            Why Choose Us?
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            We provide the tools and expertise you need to achieve your financial goals.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
            >
              <Card className="p-8 border border-gray-200 hover:shadow-lg transition-shadow">
                {/* Visual Element */}
                <div className="mb-6">
                  {feature.visual === 'progress' && (
                    <div className="relative w-32 h-32 mx-auto">
                      <svg className="w-32 h-32 transform -rotate-90">
                        <circle
                          cx="64"
                          cy="64"
                          r="56"
                          stroke="#e5e7eb"
                          strokeWidth="8"
                          fill="none"
                        />
                        <circle
                          cx="64"
                          cy="64"
                          r="56"
                          stroke="#10b981"
                          strokeWidth="8"
                          fill="none"
                          strokeDasharray={`${2 * Math.PI * 56 * 0.75} ${2 * Math.PI * 56}`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl font-bold text-emerald-600">75%</span>
                      </div>
                    </div>
                  )}
                  {feature.visual === 'graph' && (
                    <Card className="p-4 bg-emerald-700 border-0">
                      <div className="h-24 bg-white rounded flex items-end justify-around p-2">
                        <div className="w-6 bg-emerald-300 rounded-t" style={{ height: '40%' }}></div>
                        <div className="w-6 bg-emerald-400 rounded-t" style={{ height: '60%' }}></div>
                        <div className="w-6 bg-emerald-500 rounded-t" style={{ height: '80%' }}></div>
                        <div className="w-6 bg-emerald-600 rounded-t" style={{ height: '100%' }}></div>
                      </div>
                    </Card>
                  )}
                  {feature.visual === 'shield' && (
                    <div className="w-32 h-32 mx-auto bg-emerald-100 rounded-full flex items-center justify-center">
                      <Shield className="w-16 h-16 text-emerald-700" />
                    </div>
                  )}
                </div>

                {/* Icon */}
                <div className="flex justify-center mb-4">
                  <div className="p-3 bg-emerald-100 rounded-lg">
                    <feature.icon className="w-6 h-6 text-emerald-700" />
                  </div>
                </div>

                {/* Content */}
                <h3 className="text-xl font-bold text-gray-900 mb-3 text-center">
                  {feature.title}
                </h3>
                <p className="text-gray-600 text-center leading-relaxed">
                  {feature.description}
                </p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}




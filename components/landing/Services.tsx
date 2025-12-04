'use client';

import { motion } from 'framer-motion';
import { Shield, UserCog, BarChart, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import Link from 'next/link';

export default function Services() {
  const services = [
    {
      icon: Shield,
      title: 'Advanced Data Protection',
      description: 'Bank-level encryption and security measures to keep your financial data safe and secure at all times.',
    },
    {
      icon: UserCog,
      title: 'Personalized Advice',
      description: 'Get tailored financial advice and recommendations based on your unique financial situation and goals.',
    },
    {
      icon: BarChart,
      title: 'Real-time Analytics',
      description: 'Access comprehensive analytics and insights to make informed decisions about your finances.',
    },
  ];

  return (
    <section id="services" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            Amazing Services
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Discover the comprehensive services we offer to help you achieve your financial goals.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
            >
              <Card className="p-8 bg-white border border-gray-200 hover:shadow-lg transition-shadow h-full flex flex-col">
                {/* Icon */}
                <div className="mb-6">
                  <div className="w-16 h-16 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <service.icon className="w-8 h-8 text-emerald-700" />
                  </div>
                </div>

                {/* Content */}
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  {service.title}
                </h3>
                <p className="text-gray-600 mb-6 leading-relaxed flex-grow">
                  {service.description}
                </p>

                {/* Read More Link */}
                <Link
                  href="#"
                  className="text-emerald-700 hover:text-emerald-800 text-sm font-medium inline-flex items-center gap-1"
                >
                  Read More
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}




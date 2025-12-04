'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

export default function GrowthTrust() {
  return (
    <section className="py-20 bg-green-900 relative overflow-hidden">
      {/* Abstract wavy patterns background */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Side - Text Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-white"
          >
            <h2 className="text-4xl sm:text-5xl font-bold mb-6 leading-tight">
              Designed for Growth,<br />
              Built for Trust
            </h2>
            <p className="text-lg text-emerald-100 mb-8 leading-relaxed">
              We understand that your financial future matters. That&apos;s why we&apos;ve built EasyRakh with a focus on growth and trust, ensuring your wealth is managed with the highest standards of security and transparency.
            </p>
            <Button
              asChild
              size="lg"
              className="bg-white text-emerald-800 hover:bg-gray-100 text-base px-8 py-6"
            >
              <Link href="/register">
                Learn More
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
            </Button>
          </motion.div>

          {/* Right Side - Image */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="relative rounded-2xl overflow-hidden aspect-square">
              <Image
                src="/growth.jpg"
                alt="Growth and Trust"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}




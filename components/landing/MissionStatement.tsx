'use client';

import { motion } from 'framer-motion';

export default function MissionStatement() {
  return (
    <section className="py-16 bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-lg sm:text-xl text-gray-700 leading-relaxed"
        >
          EasyRakh helps{' '}
          <span className="font-semibold text-emerald-700">track</span> every{' '}
<span className="font-semibold text-emerald-700">rupee</span> and{' '}
<span className="font-semibold text-emerald-700">organize</span> your business with smart{' '}
<span className="font-semibold text-emerald-700">ledger tools</span> and{' '}
<span className="font-semibold text-emerald-700">fast data sync</span>, ensuring{' '}
<span className="font-semibold text-emerald-700">accurate records</span> every time.

        </motion.p>
      </div>
    </section>
  );
}



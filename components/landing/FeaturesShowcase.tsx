'use client';

import { motion } from 'framer-motion';
import { Safari } from '@/components/ui/safari';
import { Iphone } from '@/components/ui/iphone';
import { Users, FolderTree, Upload, FileDown, Banknote, StickyNote, Layout, Sparkles, Smartphone, Zap, BarChart3 } from 'lucide-react';

interface Feature {
  title: string;
  description: string;
  icon: any;
  component: 'safari' | 'iphone';
  imageSrc?: string;
  align: 'left' | 'right';
}

const features: Feature[] = [
  {
    title: 'Create and Maintain Ledgers for Suppliers & Customers',
    description: 'Keep track of all your business relationships with dedicated ledgers for suppliers and customers. Manage credits, debits, and balances with ease.',
    icon: Users,
    component: 'safari',
    align: 'left',
  },
  {
    title: 'Create Custom Collections (Employees, Shopkeepers, etc.)',
    description: 'Organize your business data with custom collections. Create separate ledgers for employees, shopkeepers, or any other entity type you need.',
    icon: FolderTree,
    component: 'iphone',
    align: 'right',
  },
  {
    title: 'Upload Bill Images in Any Transaction',
    description: 'Attach bill images directly to transactions for easy reference. Keep all your documentation in one place and access it whenever you need.',
    icon: Upload,
    component: 'safari',
    align: 'left',
  },
  {
    title: 'Download Ledgers as Clean, Professional PDFs',
    description: 'Export your ledgers as beautifully formatted PDF documents. Perfect for sharing with accountants, partners, or keeping records.',
    icon: FileDown,
    component: 'iphone',
    align: 'right',
  },
  {
    title: 'Track Daily Cash Records + Monthly Summary',
    description: 'Monitor your daily cash flow with detailed records. Get monthly summaries to understand your financial patterns and make informed decisions.',
    icon: Banknote,
    component: 'safari',
    align: 'left',
  },
  {
    title: 'Save Important Notes',
    description: 'Never forget important details. Save notes related to transactions, customers, or any business matter right within the platform.',
    icon: StickyNote,
    component: 'iphone',
    align: 'right',
  },
  {
    title: 'Clean & Simple User Interface',
    description: 'Enjoy a clutter-free interface designed for productivity. Every feature is just a click away, without overwhelming complexity.',
    icon: Layout,
    component: 'safari',
    align: 'left',
  },
  {
    title: 'Easy to Use for Everyone',
    description: 'No accounting degree required. EasyRakh is designed to be intuitive and user-friendly, making financial management accessible to everyone.',
    icon: Sparkles,
    component: 'iphone',
    align: 'right',
  },
  {
    title: 'Multi-Device Sync',
    description: 'Access your data from any device, anywhere. Your ledgers sync automatically across desktop, tablet, and mobile devices.',
    icon: Smartphone,
    component: 'safari',
    align: 'left',
  },
  {
    title: 'Fast Performance',
    description: 'Experience lightning-fast performance with instant page loads and real-time updates. No waiting, no lag, just smooth operation.',
    icon: Zap,
    component: 'iphone',
    align: 'right',
  },
  {
    title: 'Smart Dashboard with Charts & Activity Summary',
    description: 'Get a comprehensive overview of your business finances with interactive charts and activity summaries. Make data-driven decisions with confidence.',
    icon: BarChart3,
    component: 'safari',
    align: 'left',
  },
];

export default function FeaturesShowcase() {
  return (
    <section className="py-24 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <h2 className="text-base font-semibold text-emerald-600 tracking-wide uppercase mb-2">
            Powerful Features
          </h2>
          <p className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            Everything you need to manage your business
          </p>
          <p className="text-xl text-gray-600">
            Discover the comprehensive features that make EasyRakh the perfect solution for your business.
          </p>
        </motion.div>

        <div className="space-y-24">
          {features.map((feature, index) => (
            <div
              key={index}
              className={`flex flex-col lg:flex-row items-center gap-12 lg:gap-20 ${
                feature.align === 'right' ? 'lg:flex-row-reverse' : ''
              }`}
            >
              {/* Text Content */}
              <motion.div
                initial={{ opacity: 0, x: feature.align === 'left' ? -50 : 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="flex-1"
              >
                <div className="inline-flex items-center justify-center p-3 rounded-xl bg-emerald-100 text-emerald-700 mb-6">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 leading-tight">
                  {feature.title}
                </h3>
                <p className="text-lg text-gray-600 leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>

              {/* Visual Component */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className={`flex-1 w-full ${feature.component === 'iphone' ? 'max-w-xs mx-auto' : 'max-w-2xl'}`}
              >
                <div className="relative">
                  {/* Decorative blobs */}
                  <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-emerald-100 blur-3xl opacity-50 -z-10" />
                  <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-emerald-100 blur-3xl opacity-50 -z-10" />

                  {feature.component === 'safari' ? (
                    <Safari
                      url="easyrakh.com"
                      className="shadow-2xl"
                      imageSrc={feature.imageSrc}
                    >
                      {!feature.imageSrc && (
                        <div className="absolute top-[6.9%] left-[0.1%] w-[99.8%] h-[93%] bg-emerald-50 flex items-center justify-center overflow-hidden">
                          <div className="text-center p-8">
                            <div className="w-20 h-20 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                              <feature.icon className="w-10 h-10 text-emerald-700" />
                            </div>
                            <p className="font-medium text-gray-500">Feature Preview</p>
                            <p className="text-sm text-gray-400 mt-2">Image will be added here</p>
                          </div>
                        </div>
                      )}
                    </Safari>
                  ) : (
                    <div className="relative w-full" style={{ maxWidth: '280px', margin: '0 auto' }}>
                      <Iphone
                        src={feature.imageSrc}
                        className="shadow-2xl w-full"
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


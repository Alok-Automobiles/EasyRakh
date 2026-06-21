'use client';

import { Button } from '@/components/ui/button';
import {
  Users,
  Banknote,
  StickyNote,
  LayoutDashboard,
  FileText,
  ArrowRight,
  CheckCircle2,
  UserPlus,
  PencilLine,
  ListOrdered,
  Link2,
  FolderCog,
  PanelLeft,
  LayoutTemplate,
  Share2,
  Cloud,
  Search,
  PlusCircle,
  Package,
  Sparkles,
} from 'lucide-react';
import React from 'react';
import { motion } from 'motion/react';
import Link from 'next/link';
import {
  ArtMainAskKhata,
  ArtMain01Ledger,
  ArtMain02Graphs,
  ArtMain03SimpleUi,
  ArtMain04DailyCash,
  ArtMain05Invoices,
  ArtMain06LedgerPdf,
  ArtMain07Notes,
  ArtMain08Cloud,
  ArtMini01Transaction,
  ArtMini02Parties,
  ArtMini03Search,
  ArtMini04Edit,
  ArtMini05Opening,
  ArtMini06InvoiceKhata,
  ArtMini07Collections,
  ArtMini08Counter,
  ArtMain09Inventory,
} from '@/components/landing/FeatureArtSvgs';

type ArtComponent = React.ComponentType<{ className?: string }>;

const FeatureBlock = ({
  icon: Icon,
  title,
  description,
  points,
  color,
  bgColor,
  Art,
  align = 'left',
  delay = 0,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  points: string[];
  color: string;
  bgColor: string;
  Art: ArtComponent;
  align?: 'left' | 'right';
  delay?: number;
}) => {
  return (
    <div
      className={`flex flex-col lg:flex-row items-center gap-10 lg:gap-16 py-14 lg:py-16 ${align === 'right' ? 'lg:flex-row-reverse' : ''}`}
    >
      <motion.div
        initial={{ opacity: 0, x: align === 'left' ? -40 : 40 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.55, delay }}
        className="flex-1 w-full min-w-0"
      >
        <div className={`inline-flex items-center justify-center p-3 rounded-xl ${bgColor} ${color} mb-5`}>
          <Icon className="w-6 h-6" />
        </div>
        <h3 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3 leading-tight">{title}</h3>
        <p className="text-lg text-gray-600 mb-6 leading-relaxed">{description}</p>
        <ul className="space-y-3 mb-2">
          {points.map((point, i) => (
            <li key={i} className="flex items-start gap-3">
              <CheckCircle2 className={`w-5 h-5 ${color} mt-0.5 shrink-0`} />
              <span className="text-gray-700">{point}</span>
            </li>
          ))}
        </ul>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.55, delay: delay + 0.12 }}
        className="flex-1 w-full max-w-xl lg:max-w-none"
      >
        <div className="relative rounded-2xl border border-slate-200/80 bg-white/90 shadow-lg shadow-slate-200/50 overflow-hidden ring-1 ring-black/3">
          <div className={`absolute -top-16 -right-16 w-48 h-48 rounded-full ${bgColor} blur-3xl opacity-40 pointer-events-none`} />
          <div className={`absolute -bottom-12 -left-12 w-40 h-40 rounded-full ${bgColor} blur-3xl opacity-35 pointer-events-none`} />
          <div className="relative p-4 sm:p-6">
            <Art className="w-full h-auto block rounded-lg bg-white" />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

function FeatureMiniCard({
  icon: Icon,
  title,
  description,
  Art,
  delay = 0,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  Art: ArtComponent;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay }}
      className="rounded-xl border border-slate-200/80 bg-white/80 overflow-hidden shadow-sm ring-1 ring-black/3"
    >
      <div className="border-b border-slate-200/60 bg-slate-50/80 p-2">
        <Art className="w-full h-auto block rounded-md" />
      </div>
      <div className="p-4 pt-3">
        <div className="mb-2 inline-flex rounded-lg bg-(--brand-green-light) p-2 text-(--brand-green)">
          <Icon className="h-5 w-5" />
        </div>
        <h4 className="font-semibold text-gray-900 mb-1.5">{title}</h4>
        <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}

const brandColor = 'text-(--brand-green)';
const brandBg = 'bg-(--brand-green-light)';

const MORE_FEATURES: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  Art: ArtComponent;
}[] = [
  {
    icon: PlusCircle,
    title: 'Single “new transaction” screen',
    description: 'Record credit or debit for any party from one place, with optional bill upload on the same save.',
    Art: ArtMini01Transaction,
  },
  {
    icon: UserPlus,
    title: 'Create parties on the fly',
    description: 'Add a customer, supplier, or collection entity mid-flow without losing the transaction you started.',
    Art: ArtMini02Parties,
  },
  {
    icon: Search,
    title: 'Global search',
    description: 'Jump straight to a customer, supplier, collection record, or invoice from the search bar.',
    Art: ArtMini03Search,
  },
  {
    icon: PencilLine,
    title: 'Fix ledger lines',
    description: 'Edit or remove incorrect entries when amounts or dates need a correction.',
    Art: ArtMini04Edit,
  },
  {
    icon: ListOrdered,
    title: 'Opening balances',
    description: 'Start each party with the right opening credit or debit before new entries roll in.',
    Art: ArtMini05Opening,
  },
  {
    icon: Link2,
    title: 'Invoice settles into khata',
    description: 'When an invoice is paid, push the amount into the customer ledger so balances stay honest.',
    Art: ArtMini06InvoiceKhata,
  },
  {
    icon: FolderCog,
    title: 'Collection types',
    description: 'Define your own buckets—then open each list from the sidebar and manage types in one place.',
    Art: ArtMini07Collections,
  },
  {
    icon: PanelLeft,
    title: 'Works at the counter',
    description: 'Mobile drawer navigation and a layout tuned for quick taps between ledger, cash, and invoices.',
    Art: ArtMini08Counter,
  },
];

export default function Features() {
  return (
    <section id="features" className="py-20 sm:py-24 bg-(--brand-bg) overflow-hidden scroll-mt-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10">
        <div className="text-center max-w-3xl mx-auto mb-14 sm:mb-16">
          <h2 className="text-base font-semibold text-(--brand-green) tracking-wide uppercase mb-2">Powerful features</h2>
          <p className="text-4xl sm:text-5xl font-bold text-gray-900 mb-5">Built for real shop bookkeeping</p>
          <p className="text-xl text-gray-600">
            Ask questions in plain language, keep ledgers and cash in sync, use charts and GST invoices, export PDFs, attach bills, and stay backed up in the cloud—without noisy clutter.
          </p>
        </div>

        <div className="divide-y divide-slate-200/60">
          <FeatureBlock
            icon={Sparkles}
            title="Ask your khata—instant answers from live data"
            description="Type in Hindi or English and get balances, today’s cash in and out, and who owes the most—without opening ledgers or running reports. Answers pull from your real books so you spend less time hunting numbers."
            points={[
              'Party balance with last entry context and invoice counts when it matters',
              'Daily cash summary: money in, money out, net, and how many lines make up the day',
              'Rankings like top outstanding parties on demand—same screen, no tab switching',
            ]}
            color={brandColor}
            bgColor={brandBg}
            Art={ArtMainAskKhata}
            align="right"
          />

          <FeatureBlock
            icon={Users}
            title="Ledger maintenance: customers, suppliers & custom parties"
            description="Run every khata in one system—buyers, vendors, and anything else you track as a party. Custom entities let you model real life: for example staff salary advances, a workshop vehicle account, or rent for a godown—each with its own running balance and history."
            points={[
              'Dedicated maintenance for customer and supplier ledgers with dated credit and debit lines',
              'Custom collection types and entities that behave like any other party on the books',
              'Attach bill images or PDFs to transactions so every movement has a paper trail',
            ]}
            color={brandColor}
            bgColor={brandBg}
            Art={ArtMain01Ledger}
            align="left"
            delay={0.04}
          />

          <FeatureBlock
            icon={LayoutDashboard}
            title="Graphs for better visualization"
            description="The dashboard turns your month into pictures: cash-in and cash-out trends, headline totals, and quick context like top movers—so you spot patterns faster than scrolling rows alone."
            points={[
              'Monthly trend chart for money in vs money out',
              'Summary tiles and net position for the current period',
              'Leaderboard-style views to see which customers or suppliers moved the most',
            ]}
            color={brandColor}
            bgColor={brandBg}
            Art={ArtMain02Graphs}
            align="right"
            delay={0.08}
          />

          <FeatureBlock
            icon={LayoutTemplate}
            title="Simpler UI everywhere—no fluff"
            description="Screens reuse the same patterns whether you are on ledger, cash, or invoices: clear labels, obvious primary actions, and no gimmicks. The goal is to enter data fast and get out—especially when customers are waiting."
            points={[
              'Consistent layouts across dashboard, lists, and forms',
              'Large touch targets and readable type on phone and desktop',
              'Straight paths to “add entry”, “open ledger”, and “download PDF” without digging',
            ]}
            color={brandColor}
            bgColor={brandBg}
            Art={ArtMain03SimpleUi}
            align="left"
            delay={0.12}
          />

          <FeatureBlock
            icon={Banknote}
            title="Daily cash record & past months"
            description="Track the physical drawer separately from party credit. Log each day’s cash in and out, attach bills to lines when needed, and page back through prior days and months to review spending and spot trends."
            points={[
              'Day-by-day cash in / out with running balance for the register',
              'Browse and open historical records so last month’s expenses stay visible',
              'Optional receipt upload on cash entries, same as the main ledger',
            ]}
            color={brandColor}
            bgColor={brandBg}
            Art={ArtMain04DailyCash}
            align="right"
            delay={0.16}
          />

          <FeatureBlock
            icon={FileText}
            title="Invoices with GST, firm details & PDF download"
            description="Capture your firm name, GST number, address, and contact details at registration (and refine them later). Invoices pull that context into a professional layout with line items, totals, and status—then you can download a ready-to-send PDF."
            points={[
              'Firm title, GST number, phone, email, and address for compliant-looking bills',
              'Line items, totals, and paid / partial / unpaid tracking per invoice',
              'Download invoice as PDF for printing or sending on WhatsApp, email, or any channel you use',
            ]}
            color={brandColor}
            bgColor={brandBg}
            Art={ArtMain05Invoices}
            align="left"
            delay={0.2}
          />

          <FeatureBlock
            icon={Share2}
            title="Ledger PDF: download, print & share"
            description="Any party ledger can be exported as a formatted PDF—complete with firm header when you fill it in. Save the file and share it the same way you would a photo: WhatsApp, email, drive, or print for the file cabinet."
            points={[
              'Print or download running-balance statements straight from the ledger screen',
              'PDF output you can hand to accountants or partners',
              'Works alongside bill attachments so proof and summary travel together',
            ]}
            color={brandColor}
            bgColor={brandBg}
            Art={ArtMain06LedgerPdf}
            align="right"
            delay={0.24}
          />

          <FeatureBlock
            icon={StickyNote}
            title="Notes for what you must not forget"
            description="Keep verbal promises, stock reminders, and follow-ups out of your head. Pin the urgent notes to the dashboard so they stay visible until you clear them."
            points={[
              'Dedicated notes space away from transaction noise',
              'Pin important items so they show on the dashboard at login',
              'Edit or archive as tasks move forward',
            ]}
            color={brandColor}
            bgColor={brandBg}
            Art={ArtMain07Notes}
            align="left"
            delay={0.28}
          />

          <FeatureBlock
            icon={Package}
            title="Inventory & stock tracking"
            description="Keep a live record of every part and product on your shelves. Add items, track quantities by location, upload bill and part images, and spot what needs restocking before you run out—all from one screen."
            points={[
              'Full item catalog with search, status filters, and pagination for quick lookups',
              'Inline quantity adjustment, duplicate detection, and bulk actions to manage stock efficiently',
              'Part and bill image uploads with PDF export to keep paperwork alongside inventory',
            ]}
            color={brandColor}
            bgColor={brandBg}
            Art={ArtMain09Inventory}
            align="left"
            delay={0.32}
          />

          <FeatureBlock
            icon={Cloud}
            title="Cloud data & protected passwords"
            description="Your ledgers, invoices, and uploads live in the cloud—not only on one phone—so you can sign in from another device and pick up where you left off. Passwords are never stored in readable form: they are protected with secure one-way hashing."
            points={[
              'Access the same books from mobile or desktop with a single account',
              'Data hosted in the cloud—your books are not trapped on one handset or PC',
              'Sign-in secrets are hashed, not saved as plain text—so a database read never exposes your password',
            ]}
            color={brandColor}
            bgColor={brandBg}
            Art={ArtMain08Cloud}
            align="right"
            delay={0.36}
          />
        </div>

        <div className="mt-16 sm:mt-20 pt-12 border-t border-slate-200/60">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">Also included</h3>
            <p className="text-gray-600 text-lg">Shortcuts and workflows that make the core features faster day to day.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {MORE_FEATURES.map((item, i) => (
              <FeatureMiniCard key={item.title} {...item} delay={0.02 * i} />
            ))}
          </div>
        </div>

        <div className="mt-14 sm:mt-16 text-center pt-4">
          <Button
            asChild
            size="lg"
            className="text-lg px-12 py-6 rounded-full bg-(--brand-green) hover:bg-[#0d9488] shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1"
          >
            <Link href="/register">
              Start managing now
              <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

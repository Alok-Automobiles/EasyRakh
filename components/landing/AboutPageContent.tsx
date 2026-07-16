'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { CardSpotlight } from '@/components/ui/card-spotlight';
import { Globe } from '@/components/ui/globe';
import { Highlighter } from '@/components/ui/highlighter';
import { MovingBorder } from '@/components/ui/moving-border';
import {
  ArrowRight,
  BookOpen,
  Cloud,
  FileText,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Shield,
  Sparkles,
  Store,
  Truck,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';

const audienceTabs = [
  {
    id: 'retail',
    label: 'Retail & kirana',
    icon: Store,
    body: 'Counter-speed entries, clear party khata, and cash that matches the drawer at closing time.',
  },
  {
    id: 'trade',
    label: 'Distributors',
    icon: Truck,
    body: 'Track what each dealer owes, settle against invoices, and export statements when accounts ask.',
  },
  {
    id: 'service',
    label: 'Workshops & services',
    icon: Wrench,
    body: 'Custom parties for advances and jobs, notes for follow-ups, and PDFs you can hand to customers.',
  },
] as const;

const stats = [
  { value: '10+', label: 'Active businesses', hint: 'Growing weekly' },
  { value: '₹18.4 Cr+', label: 'Movement tracked', hint: 'Cash & ledger combined' },
  { value: '< 5 min', label: 'Typical setup', hint: 'Start same day' },
];

const marqueeItems = [
  'Party khata',
  'Daily cash',
  'Simple invoices',
  'Dashboard charts',
  'Ask your khata',
  'PDF export',
  'Cloud sync',
  'Bill attachments',
  'Notes & pins',
  'Multi-device',
];

export default function AboutPageContent() {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <main className="gradient-bg relative z-10 min-h-screen overflow-hidden bg-(--brand-bg) pt-24 sm:pt-28">
      <div className="orb orb-1" aria-hidden />
      <div className="orb orb-2" aria-hidden />
      <div className="orb orb-3" aria-hidden />

      {/* Hero */}
      <section className="relative px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pb-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          aria-hidden
          style={{
            backgroundImage: `linear-gradient(to right, #e7e5e4 1px, transparent 1px),linear-gradient(to bottom, #e7e5e4 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
            maskImage: 'radial-gradient(ellipse 70% 70% at 50% 20%, black 20%, transparent 70%)',
          }}
        />
        <div className="relative mx-auto max-w-7xl">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="text-center lg:text-left"
            >
              <div className="mb-6 inline-flex items-center gap-2 self-center rounded-full border border-emerald-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-800 shadow-sm backdrop-blur-sm lg:mx-0 mx-auto">
                <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-(--brand-green)" />
                About EasyRakh
              </div>
              <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-gray-900 sm:text-5xl lg:text-6xl xl:text-[3.5rem]">
                Your whole business,{' '}
                <Highlighter type="highlight" color="rgb(209 250 229)">
                  summarized in one place
                </Highlighter>
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-gray-600 lg:mx-0 lg:max-w-lg">
                We built EasyRakh for Indian shops and teams who outgrow notebooks and scattered
                chats—khata, cash, simple invoices, charts, and answers from your books, without the
                clutter of generic accounting software.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Button
                  asChild
                  size="lg"
                  className="h-12 rounded-full bg-(--brand-green) px-8 text-base text-primary-foreground shadow-lg shadow-emerald-200/50 transition-transform hover:scale-[1.02] hover:bg-[#0d9488]"
                >
                  <Link href="/register">
                    Create free account
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-gray-200 px-8 text-base">
                  <Link href="/#features">Explore product</Link>
                </Button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="relative mx-auto w-full max-w-md lg:max-w-none"
            >
              <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-emerald-300/25 via-transparent to-cyan-300/20 blur-3xl" aria-hidden />
              <MovingBorder className="p-8 shadow-xl" duration={6}>
                <div className="flex items-center gap-4 border-b border-gray-100/90 pb-6">
                  <div className="relative">
                    <Image
                      src="/logo.png"
                      alt="EasyRakh logo"
                      width={64}
                      height={64}
                      className="theme-logo-surface rounded-2xl p-1 shadow-md ring-1 ring-gray-100"
                    />
                    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-(--brand-green) text-[10px] font-bold text-primary-foreground shadow">
                      ✓
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">EasyRakh</p>
                    <p className="text-xs text-gray-500">Shop finance · Cloud · India</p>
                  </div>
                </div>
                <ul className="mt-6 space-y-3 text-sm text-gray-600">
                  {[
                    'Party khata with running balance & bill attachments',
                    'Daily cash register with history by month',
                    'Simple invoices & PDFs you can share instantly',
                    'Ask your khata in Hindi or English',
                  ].map((line, i) => (
                    <motion.li
                      key={line}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.35 + i * 0.08 }}
                      className="flex items-start gap-2"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                        {i + 1}
                      </span>
                      {line}
                    </motion.li>
                  ))}
                </ul>
              </MovingBorder>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Marquee */}
      <div className="relative border-y border-gray-200/70 bg-transparent">
        <div className="overflow-hidden py-3">
          <div className="about-marquee-track gap-10 pr-10">
            {[...marqueeItems, ...marqueeItems].map((label, i) => (
              <span
                key={`${label}-${i}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-500"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-(--brand-green)" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <section className="relative border-b border-gray-200/60 bg-transparent py-12">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:grid-cols-3 sm:gap-8 sm:px-6 lg:px-10">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="glass-hover group rounded-2xl border border-gray-100 bg-white/90 p-6 text-center shadow-sm sm:text-left"
            >
              <p className="text-3xl font-bold tracking-tight text-gray-900 transition-colors group-hover:text-(--brand-green) sm:text-4xl">
                {s.value}
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-800">{s.label}</p>
              <p className="text-xs text-gray-500">{s.hint}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Bento */}
      <section className="relative px-4 py-20 sm:px-6 lg:px-10 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
            className="mb-12 max-w-2xl"
          >
            <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl lg:text-4xl">
              Everything connected—not a pile of separate tools
            </h2>
            <p className="mt-3 text-lg text-gray-600">
              Hover tiles for spotlight and particle trails (GPU canvas on the hero feature card).
            </p>
          </motion.div>

          <div className="grid auto-rows-[minmax(140px,auto)] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-3 lg:gap-5">
            <CardSpotlight
              variant="light"
              className="group relative overflow-hidden lg:col-span-2 lg:row-span-2 lg:min-h-[280px]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 transition-transform duration-300 group-hover/spotlight:scale-110">
                <Sparkles className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mt-5 text-xl font-semibold text-gray-900">Ask your khata</h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-600 lg:text-base">
                Balances, today&apos;s cash, and who owes the most—instant answers in plain language
                so you don&apos;t hunt through screens.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {['Hindi & English', 'Live data', 'No tab hopping'].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-100"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </CardSpotlight>

            <motion.article
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="group rounded-3xl border border-gray-200/80 bg-white/95 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-sky-200 hover:shadow-lg hover:shadow-sky-100/50 lg:col-span-2"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700 transition-transform group-hover:rotate-3 group-hover:scale-110">
                <LayoutDashboard className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">Dashboard & trends</h3>
              <p className="mt-2 text-sm text-gray-600">
                See money in, money out, and patterns at a glance—built for decisions, not just
                record-keeping.
              </p>
            </motion.article>

            <motion.article
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="group rounded-3xl border border-gray-200/80 bg-white/95 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-violet-200 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700 transition-transform group-hover:scale-110">
                <BookOpen className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">Party khata</h3>
              <p className="mt-2 text-sm text-gray-600">
                Customers, suppliers, and custom collections—with history and exports when you need
                them.
              </p>
            </motion.article>

            <motion.article
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.12 }}
              className="group rounded-3xl border border-gray-200/80 bg-white/95 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-200 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800 transition-transform group-hover:scale-110">
                <Wallet className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">Daily cash</h3>
              <p className="mt-2 text-sm text-gray-600">
                Drawer in, drawer out, and past months—aligned with your ledger story.
              </p>
            </motion.article>

            <motion.article
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.14 }}
              className="group rounded-3xl border border-gray-200/80 bg-white/95 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-rose-200 hover:shadow-md lg:col-span-2"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700 transition-transform group-hover:scale-110">
                <FileText className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">Simple invoices & PDFs</h3>
              <p className="mt-2 text-sm text-gray-600">
                Firm details on bills, professional layout, download and share like any other
                document.
              </p>
            </motion.article>

            <motion.article
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.16 }}
              className="group rounded-3xl border border-gray-200/80 bg-white/95 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition-transform group-hover:scale-110">
                <Cloud className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">Cloud & security</h3>
              <p className="mt-2 text-sm text-gray-600">
                Access from phone or desktop; passwords stored with secure hashing.
              </p>
            </motion.article>

            <motion.article
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.18 }}
              className="group rounded-3xl border border-gray-200/80 bg-white/95 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 transition-transform group-hover:scale-110">
                <MessageSquare className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">Notes & reminders</h3>
              <p className="mt-2 text-sm text-gray-600">
                Pin what matters on the dashboard so promises and follow-ups don&apos;t slip.
              </p>
            </motion.article>
          </div>
        </div>
      </section>

      {/* Audience + moving border panel */}
      <section className="relative px-4 py-20 sm:px-6 lg:px-10 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45 }}
            >
              <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">Who it&apos;s for</h2>
              <p className="mt-3 text-gray-600">
                Pick a profile—the story updates. Same product, different day-to-day rhythm.
              </p>
              <div className="mt-8 flex flex-col gap-2">
                {audienceTabs.map((tab, i) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === i;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(i)}
                      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? 'border-(--brand-green) bg-(--brand-green-light) text-emerald-900 shadow-md shadow-emerald-100'
                          : 'border-gray-200/80 bg-white/80 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm'
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                          isActive ? 'bg-white text-(--brand-green)' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>

            <MovingBorder key={activeTab} className="p-8 lg:min-h-[280px] lg:p-10" duration={7}>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <Users className="mb-4 h-10 w-10 text-(--brand-green)" aria-hidden />
                <p className="text-lg leading-relaxed text-gray-800">{audienceTabs[activeTab].body}</p>
                <p className="mt-6 text-sm text-gray-500">
                  If you have been juggling registers, WhatsApp forwards, and half-finished sheets,
                  EasyRakh is meant to replace that noise with one calm workspace.
                </p>
              </motion.div>
            </MovingBorder>
          </div>
        </div>
      </section>

      {/* Trust + Globe (COBE) */}
      <section className="relative px-4 pb-20 sm:px-6 lg:px-10">
        <CardSpotlight
          variant="dark"
          className="mx-auto max-w-7xl !rounded-[2rem] !border-gray-800 !bg-gray-950 !p-0 shadow-2xl"
        >
          <div className="grid overflow-hidden rounded-[2rem] lg:grid-cols-2">
            <div className="flex flex-col justify-center p-8 sm:p-10 lg:p-14">
              <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">
                <Shield className="h-3.5 w-3.5" aria-hidden />
                Trust by design
              </div>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Clarity over feature bloat</h2>
              <p className="mt-4 text-white/75">
                Your books stay tied to your account. We focus on reliable flows—record, review,
                export—so you spend less time fighting the software and more time running the shop.
              </p>
              <ul className="mt-8 space-y-3 text-sm text-white/85">
                {['Hashed passwords', 'Cloud sync across devices', 'Bill & receipt attachments'].map(
                  (item) => (
                    <li key={item} className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
                        ✓
                      </span>
                      {item}
                    </li>
                  ),
                )}
              </ul>
              <div className="mt-10 flex flex-wrap gap-3">
                <Button
                  asChild
                  className="rounded-full bg-(--brand-green) px-6 text-primary-foreground hover:bg-[#0d9488]"
                >
                  <Link href="/register">Sign up free</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="rounded-full border-white/30 bg-transparent text-white hover:bg-white/10"
                >
                  <Link href="/login">Log in</Link>
                </Button>
              </div>
            </div>
            <div className="relative min-h-[300px] border-t border-white/10 lg:min-h-[420px] lg:border-l lg:border-t-0">
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-emerald-950/20 lg:bg-gradient-to-l" />
              <div className="relative flex h-full min-h-[300px] flex-col items-center justify-center lg:min-h-[420px]">
                <Globe className="max-w-[min(100%,520px)] opacity-95" />
                <div className="pointer-events-none absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/40 px-4 py-2 text-xs font-medium text-white/90 backdrop-blur-md">
                  <MapPin className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                  Trade from anywhere—books stay in sync
                </div>
              </div>
            </div>
          </div>
        </CardSpotlight>
      </section>

      <section className="relative px-4 pb-24 pt-4 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm text-gray-500">
            No payment to get started. See the full story on the{' '}
            <Link href="/" className="font-medium text-(--brand-green) underline underline-offset-2 hover:text-[#0d9488]">
              home page
            </Link>{' '}
            or{' '}
            <Link href="/#contact" className="font-medium text-(--brand-green) underline underline-offset-2 hover:text-[#0d9488]">
              talk to us
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}

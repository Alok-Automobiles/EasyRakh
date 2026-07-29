'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Bell,
  BookOpen,
  Boxes,
  Check,
  Download,
  FileText,
  FolderKanban,
  Mic2,
  NotebookPen,
  Package,
  ReceiptIndianRupee,
  ScanLine,
  Search,
  Sparkles,
  Users,
  WalletCards,
} from 'lucide-react';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import type { MotionValue } from 'motion/react';
import type { CSSProperties } from 'react';
import { useRef, useState } from 'react';
import LandingNavbar from '@/components/landing/LandingNavbar';
import LandingParticleMark from '@/components/landing/LandingParticleMark';

const problems = [
  {
    icon: BookOpen,
    label: 'Scattered ledgers',
    title: 'Balances hide between pages',
    copy: 'The last credit, debit, and promise should not depend on finding the right notebook.',
    colors: ['#45d49e', '#b8ef4d'],
  },
  {
    icon: Banknote,
    label: 'Cash by memory',
    title: 'Today stops matching yesterday',
    copy: 'Cash in and cash out move all day, but the reason behind each movement gets lost.',
    colors: ['#63dfb1', '#75b8ff'],
  },
  {
    icon: Boxes,
    label: 'Silent shelves',
    title: 'Inventory speaks too late',
    copy: 'Low stock and inactive products become visible only after the shelf creates a problem.',
    colors: ['#b8ef4d', '#f5d65b'],
  },
  {
    icon: ReceiptIndianRupee,
    label: 'Unfinished invoices',
    title: 'Bills leave without closing the loop',
    copy: 'An invoice, its payment, and the party balance often live in three different places.',
    colors: ['#f5d65b', '#ff9d66'],
  },
  {
    icon: Bell,
    label: 'Missed follow-ups',
    title: 'Important dues wait quietly',
    copy: 'A follow-up delayed by one busy day can become another week of waiting.',
    colors: ['#ff9d66', '#f06e9b'],
  },
  {
    icon: NotebookPen,
    label: 'Loose context',
    title: 'Notes separate from the numbers',
    copy: 'The reason behind an entry is as important as the amount, but rarely stays beside it.',
    colors: ['#f06e9b', '#b26bff'],
  },
  {
    icon: Search,
    label: 'Slow answers',
    title: 'Every question becomes a search',
    copy: 'Finding one customer, bill, or stock position should take seconds—not a tour of every register.',
    colors: ['#b26bff', '#5f9dff'],
  },
];

const frictionLedgers = [
  {
    icon: Banknote,
    label: 'Daily cash',
    value: '₹24,680',
    detail: 'Today in hand',
    color: '#52dca6',
  },
  {
    icon: FileText,
    label: 'Invoices',
    value: '₹18.4K',
    detail: '05 still pending',
    color: '#d2ff73',
  },
  {
    icon: Boxes,
    label: 'Low stock',
    value: '06 items',
    detail: 'Restock soon',
    color: '#75b8ff',
  },
  {
    icon: Bell,
    label: 'Follow-ups',
    value: '04 due',
    detail: 'Calls waiting',
    color: '#ffb36b',
  },
];

const features = [
  {
    number: '01',
    icon: BookOpen,
    title: 'Ledger maintenance',
    copy: 'Every credit, debit, attachment, and running balance in one readable history.',
  },
  {
    number: '02',
    icon: Users,
    title: 'Customers & suppliers',
    copy: 'Contacts, balances, and recent movement stay together and ready to act on.',
  },
  {
    number: '03',
    icon: WalletCards,
    title: 'Credit & debit entries',
    copy: 'Record money in familiar language and update every balance immediately.',
  },
  {
    number: '04',
    icon: Banknote,
    title: 'Daily cash',
    copy: 'See cash in, cash out, and the real register position for any day.',
  },
  {
    number: '05',
    icon: FileText,
    title: 'Invoices',
    copy: 'Create, share, track, and settle every bill back into the customer khata.',
  },
  {
    number: '06',
    icon: Package,
    title: 'Inventory & stock tracking',
    copy: 'Track quantities, value, low stock, inactive items, and restock work.',
  },
  {
    number: '07',
    icon: ScanLine,
    title: 'Business overview',
    copy: 'Sales, profit, cash, and trends move from the same version of the truth.',
  },
  {
    number: '08',
    icon: NotebookPen,
    title: 'Notes',
    copy: 'Keep reminders, decisions, and context beside the work they belong to.',
  },
  {
    number: '09',
    icon: Download,
    title: 'PDFs & files',
    copy: 'Download clean records and keep bills or receipts attached to their entries.',
  },
  {
    number: '10',
    icon: ReceiptIndianRupee,
    title: 'Profitability',
    copy: 'See sales, COGS, gross profit, and margin for the period you choose.',
  },
  {
    number: '11',
    icon: FolderKanban,
    title: 'Custom collections',
    copy: 'Create the party types and working lists that match the way your trade runs.',
  },
  {
    number: '12',
    icon: Mic2,
    title: 'Ask EasyRakh',
    copy: 'Ask in Hindi or English and get answers directly from your business records.',
  },
];

const productScenes = [
  {
    number: '01',
    label: 'Balances',
    title: 'Know every balance before the conversation starts.',
    copy: 'Customers, suppliers, ledgers, and new entries stay connected, so the latest position is always the one in front of you.',
    features: ['Ledger', 'Parties', 'Transactions'],
    icon: BookOpen,
    primaryImage: '/product-screens/parties.png',
    primaryAlt: 'EasyRakh customer directory showing receivable and payable balances',
    primaryPosition: '50% 34%',
    primaryScale: 1.08,
    secondaryImage: '/product-screens/transactions.png',
    secondaryAlt: 'EasyRakh transaction form for recording a customer debit or credit',
    insetRatio: '2532 / 1548',
    proof: '13 parties · balances live',
    tone: 'mint',
    insetShape: 'landscape',
  },
  {
    number: '02',
    label: 'Daily rhythm',
    title: 'Close the day with numbers that explain themselves.',
    copy: 'Daily cash, the business overview, and working notes move together instead of becoming three separate versions of the day.',
    features: ['Daily cash', 'Overview', 'Notes'],
    icon: Banknote,
    primaryImage: '/product-screens/daily-cash.png',
    primaryAlt: 'EasyRakh daily cash records arranged by date',
    primaryPosition: '50% 26%',
    primaryScale: 1.08,
    secondaryImage: '/product-screens/overview.png',
    secondaryAlt: 'EasyRakh filtered overview with cash flow and cash summary',
    insetRatio: '2284 / 1472',
    proof: 'Cash in · cash out · net',
    tone: 'lime',
    insetShape: 'landscape',
  },
  {
    number: '03',
    label: 'Profit',
    title: 'Know what every sale actually earns.',
    copy: 'Invoices finish the job with payment history, shareable records, automatic COGS, gross profit, and a margin you can act on.',
    features: ['Invoices', 'PDFs & files', 'Profitability'],
    icon: ReceiptIndianRupee,
    primaryImage: '/product-screens/invoices.png',
    primaryAlt: 'EasyRakh paid invoice with items, payment history, and private profit details',
    primaryPosition: '50% 56%',
    primaryScale: 1.08,
    secondaryImage: '/product-screens/profitability.png',
    secondaryAlt: 'EasyRakh profit summary showing sales, COGS, gross profit, and margin',
    insetRatio: '2268 / 590',
    proof: 'Sales − COGS = profit',
    tone: 'teal',
    insetShape: 'strip',
  },
  {
    number: '04',
    label: 'Stock',
    title: 'See the empty shelf before it becomes a problem.',
    copy: 'Stock health, buying value, restock signals, and custom working lists keep the operation ready for what comes next.',
    features: ['Inventory', 'Custom collections'],
    icon: Package,
    primaryImage: '/product-screens/inventory.png',
    primaryAlt: 'EasyRakh inventory dashboard with stock health and restock queue',
    primaryPosition: '50% 31%',
    primaryScale: 1.08,
    secondaryImage: '/product-screens/custom-lists.png',
    secondaryAlt: 'EasyRakh custom collection creation dialog',
    insetRatio: '2118 / 1190',
    proof: '23 items · 4 to restock',
    tone: 'forest',
    insetShape: 'landscape',
  },
  {
    number: '05',
    label: 'Answers',
    title: 'Ask the business and keep moving.',
    copy: 'EasyRakh turns everyday Hindi or English questions into useful answers wherever the counter, office, or owner happens to be.',
    features: ['Ask EasyRakh', 'Everywhere'],
    icon: Mic2,
    primaryImage: '/product-screens/ask-easyrakh.png',
    primaryAlt: 'EasyRakh Assistant open beside the business dashboard',
    primaryPosition: '72% 43%',
    primaryScale: 1.06,
    secondaryImage: '/product-screens/everywhere.png',
    secondaryAlt: 'EasyRakh dashboard with fast search and business totals',
    insetRatio: '2330 / 1290',
    proof: 'Hindi · English · voice',
    tone: 'night',
    insetShape: 'landscape',
  },
];

const faqs = [
  {
    question: 'Is EasyRakh really free?',
    answer:
      'Yes. EasyRakh is free for small businesses, with no hidden fees or advertising inside your books.',
  },
  {
    question: 'Do I need accounting knowledge?',
    answer:
      'No. The product follows familiar ideas—khata, cash in, cash out, bills, and stock—without accounting jargon.',
  },
  {
    question: 'Can I use it on my phone?',
    answer:
      'Yes. Every core workflow is designed for mobile and desktop, so the counter and the office stay in sync.',
  },
  {
    question: 'Can I download and share records?',
    answer:
      'Yes. Invoices and party ledgers can be downloaded as PDFs for WhatsApp, email, printing, or your accountant.',
  },
];

const manifestoPixelHeights = [
  0, 0, 24, 24, 10, 10, 0, 36, 58, 28, 28, 28, 0, 14, 0, 0,
];

function ManifestoFillColumn({
  index,
  initialTop,
  progress,
}: {
  index: number;
  initialTop: number;
  progress: MotionValue<number>;
}) {
  const distanceFromCenter = Math.abs(index - 7.5) / 7.5;
  const start = distanceFromCenter * 0.1;
  const clipPath = useTransform(
    progress,
    [start, 1],
    [`inset(${initialTop}% 0 0 0)`, 'inset(0% 0 0 0)'],
  );

  return (
    <motion.span
      className="kinetic-manifesto-column"
      style={{
        backgroundPosition: `${(index / 15) * 100}% 50%`,
        clipPath,
      }}
    />
  );
}

function HeroScene() {
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });
  const copyY = useTransform(scrollYProgress, [0, 0.68], ['0%', '-4%']);
  const copyOpacity = useTransform(
    scrollYProgress,
    [0, 0.58, 0.86],
    [1, 1, 0],
  );
  const cueOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0]);

  return (
    <section ref={sectionRef} className="kinetic-hero relative h-[155svh]">
      <div className="sticky top-0 h-svh overflow-hidden">
        <div className="kinetic-grid absolute inset-0" />
        <div className="kinetic-hero-glow absolute inset-0" />
        <LandingParticleMark />

        <motion.div
          style={
            reducedMotion
              ? undefined
              : { opacity: copyOpacity, y: copyY }
          }
          className="kinetic-hero-copy relative z-10 mx-auto flex h-full w-full max-w-[1600px] flex-col justify-end px-5 pb-16 pt-32 sm:px-8 md:justify-start md:px-12 md:pb-10 md:pt-28 lg:px-16"
        >
          <div className="kinetic-hero-copy-inner max-w-[820px] md:flex md:h-[calc(100svh-10rem)] md:max-w-[48%] md:flex-col md:justify-between">
            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="kinetic-kicker"
            >
              One living system for your business
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.85, delay: 0.18 }}
              className="kinetic-display kinetic-hero-heading mt-5 max-w-[800px] text-[clamp(3.35rem,6.2vw,7rem)] md:mt-0"
            >
              See your entire business at a glance with{' '}
              <span className="kinetic-gradient-text kinetic-hero-wordmark inline-block">
                EasyRakh.
              </span>
            </motion.h1>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.34 }}
              className="mt-7 flex max-w-xl flex-col gap-6 md:mt-0"
            >
              <p className="kinetic-body text-base sm:text-lg">
                Khata, daily cash, invoices, stock, and answers—moving
                together in one clear workspace built for growing Indian
                businesses.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/register" className="kinetic-button-primary">
                  Get Started
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
                <Link href="#features" className="kinetic-button-ghost">
                  Explore the system
                  <ArrowDown className="h-4 w-4" />
                </Link>
              </div>
            </motion.div>
          </div>
        </motion.div>

        <motion.div
          style={reducedMotion ? undefined : { opacity: cueOpacity }}
          className="kinetic-scroll-cue absolute bottom-6 right-5 z-10 hidden items-center gap-3 text-xs uppercase tracking-[0.22em] md:flex lg:right-10"
        >
          Scroll to see the books move
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-current/30">
            <ArrowDown className="h-4 w-4" />
          </span>
        </motion.div>
      </div>
    </section>
  );
}

function ProblemCard({
  index,
  problem,
}: {
  index: number;
  problem: (typeof problems)[number];
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ amount: 0.18, once: true }}
      transition={{ duration: 0.46, delay: (index % 3) * 0.06 }}
      tabIndex={0}
      style={
        {
          '--problem-from': problem.colors[0],
          '--problem-to': problem.colors[1],
        } as CSSProperties
      }
      className="kinetic-problem-card group relative flex min-h-[260px] flex-col overflow-hidden p-6 sm:p-7"
    >
      <span className="kinetic-problem-index">0{index + 1}</span>
      <div className="relative z-10 flex items-center justify-between gap-5 pl-10">
        <span className="kinetic-problem-label">{problem.label}</span>
        <span className="kinetic-problem-icon">
          <problem.icon className="h-6 w-6" />
        </span>
      </div>
      <div className="relative z-10 mt-auto pt-12">
        <h3 className="kinetic-problem-title text-[clamp(2rem,3vw,3.35rem)] font-semibold leading-[0.94] tracking-[-0.055em]">
          {problem.title}
        </h3>
        <p className="kinetic-problem-copy mt-5 max-w-md text-sm leading-relaxed">
          {problem.copy}
        </p>
      </div>
    </motion.article>
  );
}

function FrictionLedgerStack() {
  const reducedMotion = useReducedMotion();

  return (
    <div className="kinetic-ledger-stack" aria-hidden="true">
      <div className="kinetic-ledger-stack-header">
        <span>Loose records / live pressure</span>
        <span>04 sources</span>
      </div>

      <div className="kinetic-ledger-stack-stage">
        {frictionLedgers.map((ledger, index) => (
          <motion.div
            key={ledger.label}
            initial={
              reducedMotion
                ? false
                : { opacity: 0, y: 24, scale: 0.96 }
            }
            whileInView={
              reducedMotion
                ? undefined
                : { opacity: 1, y: 0, scale: 1 }
            }
            viewport={{ amount: 0.35, once: true }}
            transition={{
              duration: 0.52,
              delay: index * 0.08,
              ease: [0.22, 1, 0.36, 1],
            }}
            className={`kinetic-ledger-slot kinetic-ledger-slot-${index + 1}`}
          >
            <div
              className="kinetic-ledger-slip"
              style={
                {
                  '--ledger-accent': ledger.color,
                } as CSSProperties
              }
            >
              <div className="kinetic-ledger-slip-head">
                <span className="kinetic-ledger-slip-icon">
                  <ledger.icon className="h-4 w-4" />
                </span>
                <span>{ledger.label}</span>
                <span>0{index + 1}</span>
              </div>
              <strong>{ledger.value}</strong>
              <div className="kinetic-ledger-slip-foot">
                <span>{ledger.detail}</span>
                <span className="kinetic-ledger-status-dot" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="kinetic-ledger-stack-footer">
        <span>One counter</span>
        <span />
        <span>Four answers</span>
      </div>
    </div>
  );
}

function FrictionScene() {
  return (
    <section className="kinetic-friction relative overflow-hidden py-24 sm:py-32">
      <div className="kinetic-grid absolute inset-0 opacity-50" />
      <div className="relative z-10 mx-auto w-full max-w-[1500px] px-5 sm:px-8 lg:px-14">
        <div className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-stretch">
          <div>
            <p className="kinetic-kicker">Your business is already moving</p>
            <h2 className="kinetic-editorial-heading mt-6 max-w-[820px]">
              <span className="block">BUILDING WHAT YOU</span>
              <span className="flex flex-wrap items-center gap-x-[0.14em]">
                <span className="kinetic-editorial-highlight">LOVE</span>
                <span>— NOT</span>
              </span>
              <span className="block">CHASING BOOKS</span>
            </h2>
            <span className="kinetic-editorial-tag mt-3">
              The work behind the counter
            </span>
          </div>
          <div className="flex h-full flex-col lg:pb-3">
            <FrictionLedgerStack />
            <div className="mt-10 lg:mt-auto lg:pt-8">
              <p className="kinetic-body max-w-xl text-lg">
                The problem is not a lack of numbers. It is that the numbers
                live in different places and arrive at different times.
              </p>
              <div className="mt-7 flex items-center gap-4">
                <span className="kinetic-kicker">Hover to reveal the pressure</span>
                <span className="h-px flex-1 bg-current/15" />
              </div>
            </div>
          </div>
        </div>

        <div className="kinetic-problem-grid mt-16 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {problems.map((problem, index) => (
            <ProblemCard
              key={problem.title}
              index={index}
              problem={problem}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ManifestoScene() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeStatement, setActiveStatement] = useState(0);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });
  const statements = [
    ['BOOKS', 'BROUGHT', 'TOGETHER'],
    ['CASH', 'MADE', 'CLEAR'],
    ['SALES', 'KEPT', 'VISIBLE'],
    ['STOCK', 'KEPT', 'READY'],
    ['FOLLOW-UPS', 'NEVER', 'LOST'],
    ['DECISIONS', 'MADE', 'FASTER'],
    ['GROWTH', 'KEPT', 'MOVING'],
  ];
  const fillProgress = useSpring(
    useTransform(scrollYProgress, [0, 0.38], [0, 1]),
    { stiffness: 68, damping: 20, mass: 0.74 },
  );
  const headlineY = useTransform(fillProgress, [0, 1], ['52%', '0%']);
  const headlineOpacity = useTransform(fillProgress, [0, 0.12, 1], [0, 1, 1]);
  const textureOpacity = useTransform(fillProgress, [0, 0.72, 1], [0, 0.04, 0.18]);
  const captionOpacity = useTransform(fillProgress, [0, 0.82, 1], [0, 0, 1]);
  useMotionValueEvent(scrollYProgress, 'change', (latest) => {
    const nextStatement =
      latest < 0.44
        ? 0
        : Math.min(
            statements.length - 1,
            1 +
              Math.floor(
                ((latest - 0.44) / 0.56) * (statements.length - 1),
              ),
          );
    setActiveStatement((current) =>
      current === nextStatement ? current : nextStatement,
    );
  });

  return (
    <section ref={sectionRef} className="relative h-[500svh]">
      <div className="kinetic-manifesto sticky top-0 h-svh overflow-hidden">
        <div
          className="kinetic-manifesto-curtain absolute inset-0"
          data-manifesto-curtain
        >
          <div className="kinetic-manifesto-pixel-fill" aria-hidden="true">
            {manifestoPixelHeights.map((height, index) => (
              <ManifestoFillColumn
                key={`${height}-${index}`}
                index={index}
                initialTop={Math.max(0, 58 - height)}
                progress={fillProgress}
              />
            ))}
          </div>
          <motion.div
            style={{ opacity: textureOpacity }}
            className="kinetic-manifesto-noise absolute inset-0"
          />
          <motion.div
            style={{ opacity: headlineOpacity, y: headlineY }}
            className="relative z-10 flex h-full items-center justify-center px-5"
          >
            <AnimatePresence initial={false}>
              <motion.h2
                key={statements[activeStatement].join('-')}
                initial={{ opacity: 0, y: 34, scale: 0.975, filter: 'blur(9px)' }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -26, scale: 1.018, filter: 'blur(9px)' }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="kinetic-manifesto-line absolute text-center text-[clamp(4rem,10vw,9.5rem)]"
              >
                {statements[activeStatement].map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </motion.h2>
            </AnimatePresence>
          </motion.div>
          <motion.div
            style={{ opacity: captionOpacity }}
            className="kinetic-manifesto-caption absolute bottom-7 left-1/2 z-10 -translate-x-1/2 text-center text-xs uppercase tracking-[0.25em]"
          >
            One source of truth. Every day.
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function ProductSceneVisual({
  scene,
  priority = false,
}: {
  scene: (typeof productScenes)[number];
  priority?: boolean;
}) {
  return (
    <div className={`kinetic-product-visual kinetic-tone-${scene.tone}`}>
      <div className="kinetic-product-glow" />
      <div className="kinetic-product-window">
        <div className="kinetic-product-window-bar">
          <span />
          <span />
          <span />
          <p>EasyRakh / {scene.label}</p>
          <span className="kinetic-product-live">Live</span>
        </div>
        <div className="kinetic-product-primary">
          <Image
            src={scene.primaryImage}
            alt={scene.primaryAlt}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 58vw, calc(100vw - 2.5rem)"
            className="kinetic-product-image"
            style={{
              objectPosition: scene.primaryPosition,
              transform: `scale(${scene.primaryScale})`,
            }}
          />
        </div>
      </div>

      <div
        className={`kinetic-product-inset kinetic-product-inset-${scene.insetShape}`}
        style={{ aspectRatio: scene.insetRatio }}
      >
        <Image
          src={scene.secondaryImage}
          alt={scene.secondaryAlt}
          fill
          sizes="(min-width: 1024px) 28vw, 58vw"
          className="kinetic-product-image kinetic-product-inset-image"
        />
      </div>

      <div className="kinetic-product-proof">
        <span />
        {scene.proof}
      </div>
    </div>
  );
}

function FeatureRail() {
  const theatreRef = useRef<HTMLDivElement>(null);
  const [activeScene, setActiveScene] = useState(0);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: theatreRef,
    offset: ['start start', 'end end'],
  });
  const progressWidth = useSpring(
    useTransform(scrollYProgress, [0, 1], ['20%', '100%']),
    { stiffness: 120, damping: 28, mass: 0.45 },
  );

  useMotionValueEvent(scrollYProgress, 'change', (latest) => {
    const nextScene = Math.min(
      productScenes.length - 1,
      Math.max(0, Math.round(latest * (productScenes.length - 1))),
    );
    setActiveScene((current) => (current === nextScene ? current : nextScene));
  });

  const selectScene = (index: number) => {
    setActiveScene(index);
    const theatre = theatreRef.current;
    if (!theatre || !window.matchMedia('(min-width: 1024px)').matches) {
      return;
    }

    const availableScroll = Math.max(0, theatre.offsetHeight - window.innerHeight);
    const sceneProgress =
      productScenes.length > 1 ? index / (productScenes.length - 1) : 0;
    const theatreTop = theatre.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: theatreTop + availableScroll * sceneProgress,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  };

  const sceneTransition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.48, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <section
      id="features"
      className="kinetic-feature-section relative scroll-mt-20"
    >
      <div ref={theatreRef} className="kinetic-product-theatre">
        <div className="kinetic-product-sticky">
          <div className="kinetic-grid absolute inset-0 opacity-45" />
          <div className="kinetic-product-header relative z-10">
            <div>
              <p className="kinetic-kicker">The EasyRakh system</p>
              <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">
                Five business moments. One continuous view.
              </h2>
            </div>
            <p className="kinetic-body hidden max-w-sm text-right xl:block">
              The whole product, shown through the moments that matter at the
              counter and after the shutters come down.
            </p>
          </div>

          <div className="kinetic-product-shell relative z-10">
            <div className="kinetic-product-copy-panel">
              <nav
                aria-label="Product story chapters"
                className="kinetic-product-nav"
              >
                {productScenes.map((scene, index) => (
                  <button
                    key={scene.number}
                    type="button"
                    onClick={() => selectScene(index)}
                    aria-current={activeScene === index ? 'step' : undefined}
                    className="kinetic-product-nav-item"
                  >
                    <span>{scene.number}</span>
                    <span>{scene.label}</span>
                    <span />
                  </button>
                ))}
              </nav>

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={productScenes[activeScene].number}
                  initial={
                    reducedMotion
                      ? false
                      : { opacity: 0, y: 18, filter: 'blur(7px)' }
                  }
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={
                    reducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: -14, filter: 'blur(7px)' }
                  }
                  transition={sceneTransition}
                  className="kinetic-product-copy"
                >
                  <div className="flex items-center justify-between">
                    <span className="kinetic-kicker">
                      {productScenes[activeScene].number} /{' '}
                      {productScenes[activeScene].label}
                    </span>
                    {(() => {
                      const SceneIcon = productScenes[activeScene].icon;
                      return <SceneIcon className="h-6 w-6" />;
                    })()}
                  </div>
                  <h3>{productScenes[activeScene].title}</h3>
                  <p>{productScenes[activeScene].copy}</p>
                  <ul>
                    {productScenes[activeScene].features.map((feature) => (
                      <li key={feature}>
                        <Check className="h-3.5 w-3.5" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="kinetic-product-stage">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={productScenes[activeScene].number}
                  initial={
                    reducedMotion
                      ? false
                      : { opacity: 0, y: 22, scale: 0.985 }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={
                    reducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: -18, scale: 1.012 }
                  }
                  transition={sceneTransition}
                  className="absolute inset-0"
                >
                  <ProductSceneVisual
                    scene={productScenes[activeScene]}
                    priority={activeScene === 0}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="kinetic-product-progress relative z-10">
            <motion.div style={{ width: progressWidth }} />
            <span>
              {String(activeScene + 1).padStart(2, '0')} /{' '}
              {String(productScenes.length).padStart(2, '0')}
            </span>
          </div>
        </div>
      </div>

      <div className="kinetic-product-mobile">
        <div className="kinetic-product-mobile-header">
          <p className="kinetic-kicker">The EasyRakh system</p>
          <h2>Five business moments. One continuous view.</h2>
          <p className="kinetic-body">
            The product shown through the moments that matter most.
          </p>
        </div>
        <div className="kinetic-product-mobile-list">
          {productScenes.map((scene, index) => (
            <article key={scene.number} className="kinetic-product-mobile-scene">
              <div className="kinetic-product-mobile-copy">
                <div className="flex items-center justify-between">
                  <span className="kinetic-kicker">
                    {scene.number} / {scene.label}
                  </span>
                  <scene.icon className="h-5 w-5" />
                </div>
                <h3>{scene.title}</h3>
                <p>{scene.copy}</p>
                <ul>
                  {scene.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </div>
              <ProductSceneVisual scene={scene} priority={index === 0} />
            </article>
          ))}
        </div>
      </div>

      <div className="kinetic-feature-index">
        <div className="kinetic-feature-index-heading">
          <div>
            <p className="kinetic-kicker">Everything connected</p>
            <h3>All twelve tools, still one system.</h3>
          </div>
          <p className="kinetic-body">
            Every feature shares the same parties, money, documents, and
            business context.
          </p>
        </div>
        <div className="kinetic-feature-index-grid">
          {features.map((feature) => (
            <article key={feature.number} className="kinetic-feature-index-card">
              <div className="kinetic-feature-index-top">
                <span>{feature.number}</span>
                <feature.icon className="h-5 w-5" />
              </div>
              <h4>{feature.title}</h4>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProofAndPricing() {
  return (
    <section id="pricing" className="kinetic-proof relative overflow-hidden py-24 sm:py-32">
      <div className="kinetic-grid absolute inset-0 opacity-30" />
      <div className="relative z-10 mx-auto max-w-[1500px] px-5 sm:px-8 lg:px-14">
        <div className="grid gap-14 lg:grid-cols-[1fr_0.82fr] lg:items-start">
          <div className="kinetic-language-field relative">
            <p className="kinetic-kicker relative z-10">
              Built for the next milestone
            </p>
            <h2 className="sr-only">
              EasyRakh is built for business owners reaching their next
              milestone.
            </h2>
            <LandingParticleMark variant="language" />
          </div>

          <div className="kinetic-price-card lg:mt-20">
            <div className="flex items-start justify-between">
              <div>
                <p className="kinetic-kicker">Everything included</p>
                <h3 className="mt-5 text-4xl font-semibold">Free forever.</h3>
              </div>
              <Sparkles className="h-7 w-7" />
            </div>
            <div className="my-9 flex items-end gap-2 border-y border-current/15 py-8">
              <span className="text-7xl font-semibold tracking-[-0.06em]">₹0</span>
              <span className="kinetic-body pb-2">/ month</span>
            </div>
            <ul className="grid gap-4">
              {[
                'Unlimited transactions and parties',
                'Daily cash and business dashboard',
                'Invoices, PDFs, and attachments',
                'Inventory and stock tracking',
                'Secure cloud access on mobile and desktop',
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <Check className="h-4 w-4 text-(--kinetic-accent)" />
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/register" className="kinetic-button-primary mt-9 w-full justify-between">
              Start building a clearer business
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function FaqAndContact() {
  return (
    <section id="faq" className="kinetic-faq relative py-24 sm:py-32">
      <div className="mx-auto grid max-w-[1500px] gap-14 px-5 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:px-14">
        <div>
          <p className="kinetic-kicker">Questions, made simple</p>
          <h2 className="mt-5 text-5xl font-semibold tracking-[-0.05em] sm:text-7xl">
            Before you begin.
          </h2>
          <p className="kinetic-body mt-6 max-w-md">
            EasyRakh is designed to feel familiar from the first entry. If
            something is unclear, talk to a real person.
          </p>
          <a
            href="mailto:support@easyrakh.com"
            className="kinetic-button-ghost mt-8"
          >
            support@easyrakh.com
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
        <div className="divide-y divide-current/15 border-y border-current/15">
          {faqs.map((faq, index) => (
            <details key={faq.question} className="kinetic-faq-item group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-7 text-xl font-medium sm:text-2xl">
                <span className="flex items-center gap-5">
                  <span className="kinetic-kicker">0{index + 1}</span>
                  {faq.question}
                </span>
                <span className="relative h-7 w-7 shrink-0 rounded-full border border-current/25">
                  <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 bg-current" />
                  <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-y-1/2 bg-current transition-transform group-open:rotate-90" />
                </span>
              </summary>
              <p className="kinetic-body max-w-2xl pb-7 pl-0 sm:pl-14">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

const rupeeFloaters = [
  { left: 4, size: 46, duration: 13, delay: -8, drift: -24 },
  { left: 11, size: 25, duration: 10, delay: -3, drift: 34 },
  { left: 19, size: 58, duration: 15, delay: -11, drift: 18 },
  { left: 28, size: 31, duration: 11, delay: -6, drift: -30 },
  { left: 37, size: 43, duration: 14, delay: -1, drift: 28 },
  { left: 45, size: 23, duration: 9, delay: -7, drift: -18 },
  { left: 55, size: 52, duration: 16, delay: -12, drift: 36 },
  { left: 63, size: 29, duration: 12, delay: -4, drift: -34 },
  { left: 71, size: 62, duration: 15, delay: -9, drift: 22 },
  { left: 79, size: 35, duration: 11, delay: -2, drift: -26 },
  { left: 87, size: 48, duration: 14, delay: -10, drift: 32 },
  { left: 95, size: 27, duration: 10, delay: -5, drift: -20 },
];

function RupeeFloatField() {
  return (
    <div className="kinetic-rupee-field absolute inset-0" aria-hidden="true">
      {rupeeFloaters.map((floater, index) => (
        <span
          key={`${floater.left}-${floater.size}`}
          className="kinetic-floating-rupee"
          style={
            {
              '--rupee-delay': `${floater.delay}s`,
              '--rupee-drift': `${floater.drift}px`,
              '--rupee-duration': `${floater.duration}s`,
              '--rupee-left': `${floater.left}%`,
              '--rupee-size': `${floater.size}px`,
              '--rupee-end-tilt': `${index % 2 === 0 ? 7 : -8}deg`,
              '--rupee-tilt': `${index % 2 === 0 ? -7 : 8}deg`,
            } as CSSProperties
          }
        >
          ₹
        </span>
      ))}
    </div>
  );
}

function ClosingScene() {
  return (
    <section id="contact" className="kinetic-closing relative flex min-h-svh items-center overflow-hidden py-24">
      <div className="kinetic-grid absolute inset-0 opacity-40" />
      <div className="kinetic-closing-glow absolute inset-0" />
      <RupeeFloatField />
      <div className="relative z-10 mx-auto w-full max-w-[1500px] px-5 text-center sm:px-8 lg:px-14">
        <Image
          src="/logo.png"
          alt="EasyRakh logo"
          width={72}
          height={72}
          className="theme-logo-surface mx-auto rounded-full p-1"
        />
        <p className="kinetic-kicker mt-8">Your next clear decision starts here</p>
        <h2 className="kinetic-display kinetic-closing-title mx-auto mt-5 max-w-6xl text-[clamp(4rem,9vw,10rem)]">
          GROW READY.
        </h2>
        <p className="kinetic-body mx-auto mt-7 max-w-xl text-lg">
          Give every rupee, relationship, and shelf a place to stay visible.
        </p>
        <Link href="/register" className="kinetic-button-primary mt-9">
          Create your free account
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

function KineticFooter() {
  return (
    <footer className="kinetic-footer border-t border-current/15 px-5 py-7 sm:px-8 lg:px-14">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt=""
            width={34}
            height={34}
            className="theme-logo-surface rounded-full p-0.5"
          />
          <span>EasyRakh — books that keep up.</span>
        </div>
        <div className="flex flex-wrap gap-5 text-(--kinetic-muted)">
          <Link href="/about">About</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href="mailto:support@easyrakh.com">Contact</a>
        </div>
      </div>
    </footer>
  );
}

export default function KineticLandingPage() {
  return (
    <div className="kinetic-landing">
      <LandingNavbar />
      <main>
        <HeroScene />
        <FrictionScene />
        <ManifestoScene />
        <FeatureRail />
        <ProofAndPricing />
        <FaqAndContact />
        <ClosingScene />
      </main>
      <KineticFooter />
    </div>
  );
}

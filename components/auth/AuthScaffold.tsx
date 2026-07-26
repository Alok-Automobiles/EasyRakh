'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import AuthParticleField from '@/components/auth/AuthParticleField';
import { cn } from '@/lib/utils';

type AuthScaffoldProps = {
  mode: 'login' | 'register';
  eyebrow: string;
  title: string;
  description: string;
  alternateText: string;
  alternateLabel: string;
  alternateHref: string;
  children: ReactNode;
};

function BrandMark() {
  return (
    <Link
      href="/"
      aria-label="EasyRakh home"
      className="auth-kinetic-brand inline-flex items-center justify-center outline-none transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-[#59dea7]/60"
    >
      <Image
        src="/logo.png"
        alt="EasyRakh logo"
        width={42}
        height={42}
        className="theme-logo-surface rounded-full p-1"
        priority
      />
    </Link>
  );
}

function VisualStage() {
  return (
    <section
      aria-label="EasyRakh kinetic business scene"
      className="auth-kinetic-stage relative min-h-[318px] overflow-hidden border-b lg:absolute lg:inset-0 lg:min-h-full lg:border-0"
    >
      <AuthParticleField />
      <div
        className="auth-particle-vignette pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <div className="absolute left-5 top-5 z-10 sm:left-8 sm:top-7 lg:left-10 lg:top-8">
        <BrandMark />
      </div>

      <span className="sr-only">A green particle field morphs between the rupee sign and EasyRakh.</span>
    </section>
  );
}

export default function AuthScaffold({
  mode,
  eyebrow,
  title,
  description,
  alternateText,
  alternateLabel,
  alternateHref,
  children,
}: AuthScaffoldProps) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="auth-kinetic-page min-h-screen">
        <VisualStage />

        <motion.section
          className="auth-kinetic-form relative z-20 flex min-h-[calc(100svh-318px)] w-full flex-col px-5 py-7 sm:px-9 sm:py-9 lg:ml-auto lg:min-h-screen lg:w-[min(680px,48vw)] lg:border-l lg:px-12 lg:py-10 lg:backdrop-blur-xl xl:px-16"
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.65, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="auth-form-topline flex items-center justify-between gap-4 border-b pb-5 pr-14">
            <span className="auth-form-meta font-mono text-[8px] uppercase tracking-[0.22em]">
              {mode === 'login' ? '01 / Sign in' : '02 / Create'}
            </span>
            <p className="auth-form-alternate text-right text-xs sm:text-sm">
              {alternateText}{' '}
              <Link
                href={alternateHref}
                className="auth-accent-link font-bold underline-offset-4 transition-colors hover:underline"
              >
                {alternateLabel}
              </Link>
            </p>
          </div>

          <motion.div
            className={cn(
              'my-auto w-full py-9 sm:py-12',
              mode === 'login' ? 'max-w-[460px]' : 'max-w-[580px]',
            )}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="auth-form-eyebrow mb-3 flex items-center gap-3 font-mono text-[9px] font-bold uppercase tracking-[0.22em]">
              <span className="auth-eyebrow-line h-px w-8" />
              {eyebrow}
            </div>
            <h1 className="text-[2.3rem] font-medium leading-[1.04] tracking-[-0.055em] sm:text-[3.1rem]">
              {title}
            </h1>
            <p className="auth-form-description mt-4 max-w-xl text-sm leading-6 sm:text-base">
              {description}
            </p>
            <div className="mt-8">{children}</div>
          </motion.div>

          <div className="auth-form-footer flex items-end justify-between gap-5 border-t pt-5">
            <p className="max-w-sm text-[10px] leading-5">
              By continuing, you agree to EasyRakh&apos;s{' '}
              <Link href="/terms" className="auth-footer-link underline underline-offset-2">
                Terms
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="auth-footer-link underline underline-offset-2">
                Privacy Policy
              </Link>
              .
            </p>
            <Link
              href="/"
              aria-label="Return to EasyRakh home"
              className="auth-home-link hidden size-9 shrink-0 items-center justify-center border transition-colors sm:flex"
            >
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </motion.section>
      </div>
    </MotionConfig>
  );
}

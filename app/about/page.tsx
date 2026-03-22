import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import LandingNavbar from '@/components/landing/LandingNavbar';
import Footer from '@/components/landing/Footer';
import { Button } from '@/components/ui/button';
import { BookOpen, Shield, Wallet, Users } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About EasyRakh | Simple ledger for Indian businesses',
  description:
    'EasyRakh is a simple, secure ledger for Indian businesses—track customers, suppliers, credits, debits, and daily cash in one place.',
};

export default function AboutPage() {
  return (
    <>
      <LandingNavbar />
      <main className="relative z-10 bg-(--brand-bg) min-h-screen shadow-xl pb-16 sm:pb-20 md:pb-24 pt-28 sm:pt-32">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 flex flex-col items-center text-center sm:mb-14">
            <Image
              src="/logo.png"
              alt="EasyRakh"
              width={72}
              height={72}
              className="mb-6 rounded-full bg-white/90 p-1 shadow-md"
            />
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl md:text-5xl">
              About EasyRakh
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-gray-600 sm:text-xl">
              The simplest ledger for Indian businesses—built so you can track money clearly without
              spreadsheets or messy notebooks.
            </p>
          </div>

          <div className="space-y-12 rounded-3xl border border-gray-200/80 bg-white/90 px-6 py-10 shadow-sm backdrop-blur-sm sm:px-10 sm:py-12">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">What we do</h2>
              <p className="mt-3 leading-relaxed text-gray-600">
                EasyRakh helps you run a clean digital ledger: record credits and debits for
                customers and suppliers, see balances at a glance, and log daily cash in and out so
                your drawer matches your books. It is purpose-built for how small and mid-sized
                teams in India actually work—not generic accounting software.
              </p>
            </section>

            <section className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-gray-100 bg-(--brand-bg) p-5">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <BookOpen className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="font-semibold text-gray-900">Clear ledger</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  One place for parties, transactions, and running balances—easy to search and
                  export when you need it.
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-(--brand-bg) p-5">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                  <Wallet className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="font-semibold text-gray-900">Daily cash</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  Track cash in, cash out, and today&apos;s position so end-of-day reconciliation is
                  straightforward.
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-(--brand-bg) p-5">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                  <Users className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="font-semibold text-gray-900">Customers & suppliers</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  Keep counterparties organised with history you can trust when you follow up on
                  collections or payouts.
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-(--brand-bg) p-5">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <Shield className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="font-semibold text-gray-900">Built for trust</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  Your data stays tied to your account; we focus on clarity and reliability over
                  feature bloat.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Who it&apos;s for</h2>
              <p className="mt-3 leading-relaxed text-gray-600">
                Shops, distributors, workshops, and service businesses that want a dependable
                ledger without a steep learning curve. If you have been juggling registers, WhatsApp
                notes, and half-filled Excel sheets, EasyRakh is meant to replace that with
                something simpler.
              </p>
            </section>

            <section className="rounded-2xl bg-gray-900 px-6 py-8 text-center text-white sm:px-8">
              <h2 className="text-lg font-semibold sm:text-xl">Ready to try it?</h2>
              <p className="mt-2 text-sm text-white/80 sm:text-base">
                Create a free account and set up your ledger in minutes.
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  asChild
                  className="rounded-full bg-(--brand-green) px-8 text-white hover:bg-[#059669]"
                >
                  <Link href="/register">Sign up free</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="rounded-full border-white/40 bg-transparent text-white hover:bg-white/10"
                >
                  <Link href="/login">Log in</Link>
                </Button>
              </div>
              <p className="mt-6 text-xs text-white/60">
                No payment required to get started. Explore features on the{' '}
                <Link href="/" className="underline underline-offset-2 hover:text-white">
                  home page
                </Link>
                .
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

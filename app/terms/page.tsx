import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import LandingNavbar from '@/components/landing/LandingNavbar';
import Footer from '@/components/landing/Footer';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Terms of Service | EasyRakh',
  description:
    'Terms and conditions for using the EasyRakh ledger and related services.',
};

export default function TermsPage() {
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
              Terms of service
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-gray-600 sm:text-xl">Last updated: 22 March 2026</p>
          </div>

          <div className="space-y-10 rounded-3xl border border-gray-200/80 bg-white/90 px-6 py-10 shadow-sm backdrop-blur-sm sm:px-10 sm:py-12">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Agreement</h2>
              <p className="mt-3 leading-relaxed text-gray-600">
                By creating an account or using EasyRakh&apos;s website and services, you agree to these
                terms. If you are using EasyRakh on behalf of a business, you confirm you have authority to
                bind that business. If you do not agree, do not use the service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">The service</h2>
              <p className="mt-3 leading-relaxed text-gray-600">
                EasyRakh provides tools to record and organise financial and operational information (such
                as ledgers, cash, and invoices). Features may change or be improved over time. We aim for
                high availability but do not guarantee uninterrupted or error-free operation.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Your account and content</h2>
              <p className="mt-3 leading-relaxed text-gray-600">
                You are responsible for keeping your login details confidential and for activity under your
                account. You retain ownership of data you submit. You grant us a licence to host, process,
                and display that data only as needed to run and improve the service for you.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Acceptable use</h2>
              <p className="mt-3 leading-relaxed text-gray-600">
                You agree not to misuse EasyRakh—for example, by attempting unauthorised access, disrupting
                the service, uploading malware, or using the product for unlawful purposes. We may suspend
                or terminate access if we reasonably believe these terms are violated.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Disclaimer</h2>
              <p className="mt-3 leading-relaxed text-gray-600">
                EasyRakh is a software tool to help you organise information. It is not a substitute for
                professional accounting, tax, or legal advice. You are responsible for the accuracy of
                entries and for compliance with applicable laws. The service is provided &quot;as is&quot;
                to the extent permitted by law, without warranties of merchantability or fitness for a
                particular purpose.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Limitation of liability</h2>
              <p className="mt-3 leading-relaxed text-gray-600">
                To the fullest extent permitted by applicable law, EasyRakh and its operators will not be
                liable for indirect, incidental, special, consequential, or punitive damages, or for loss
                of profits, data, or goodwill, arising from your use of the service. Our total liability
                for claims relating to the service is limited to the amount you paid us in the twelve
                months before the claim (or, if the service is free, to zero).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Termination</h2>
              <p className="mt-3 leading-relaxed text-gray-600">
                You may stop using EasyRakh at any time. We may suspend or end access if we need to comply
                with law, protect users, or wind down the service, with reasonable notice where practicable.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Changes</h2>
              <p className="mt-3 leading-relaxed text-gray-600">
                We may update these terms. We will post the new version on this page and update the
                &quot;Last updated&quot; date. Material changes may be communicated through the product or
                by email where appropriate. Continued use after changes constitutes acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Contact</h2>
              <p className="mt-3 leading-relaxed text-gray-600">
                Questions about these terms:{' '}
                <a
                  href="mailto:support@easyrakh.com"
                  className="font-medium text-(--brand-green) underline underline-offset-2 hover:text-[#059669]"
                >
                  support@easyrakh.com
                </a>
                .
              </p>
            </section>

            <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-8">
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/privacy">Privacy policy</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/">Back to home</Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

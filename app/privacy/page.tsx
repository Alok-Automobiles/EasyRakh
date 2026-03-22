import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import LandingNavbar from '@/components/landing/LandingNavbar';
import Footer from '@/components/landing/Footer';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Privacy Policy | EasyRakh',
  description:
    'How EasyRakh collects, uses, and protects your data when you use our ledger service.',
};

export default function PrivacyPage() {
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
              Privacy policy
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-gray-600 sm:text-xl">Last updated: 22 March 2026</p>
          </div>

          <div className="space-y-10 rounded-3xl border border-gray-200/80 bg-white/90 px-6 py-10 shadow-sm backdrop-blur-sm sm:px-10 sm:py-12">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Introduction</h2>
              <p className="mt-3 leading-relaxed text-gray-600">
                EasyRakh (&quot;we&quot;, &quot;us&quot;) provides a digital ledger and related tools for businesses.
                This policy explains what information we process when you use our website and service, and the
                choices you have. If you do not agree with this policy, please do not use EasyRakh.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Information we collect</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-gray-600">
                <li>
                  <strong className="text-gray-800">Account data:</strong> such as name, email address, and
                  credentials you provide when you register or sign in.
                </li>
                <li>
                  <strong className="text-gray-800">Business data you enter:</strong> ledgers, parties,
                  transactions, invoices, notes, file uploads, and other content you choose to store in the
                  product.
                </li>
                <li>
                  <strong className="text-gray-800">Technical data:</strong> such as device type, browser,
                  approximate location derived from IP, and logs needed to operate and secure the service.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">How we use information</h2>
              <p className="mt-3 leading-relaxed text-gray-600">
                We use the information above to provide and improve EasyRakh, authenticate users, prevent
                abuse, fix errors, analyse usage in aggregate, and communicate with you about the service
                (for example, security or account notices). We do not sell your personal information.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Storage and security</h2>
              <p className="mt-3 leading-relaxed text-gray-600">
                Your data is stored using infrastructure designed for cloud applications. Passwords are
                handled with industry-standard one-way hashing—we do not store readable passwords. No method
                of transmission or storage is perfectly secure; we work to protect your account and data with
                reasonable technical and organisational measures.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Sharing</h2>
              <p className="mt-3 leading-relaxed text-gray-600">
                We may share data with subprocessors that help us host, operate, or analyse the service
                (for example, cloud hosting), under contracts that require them to protect the data. We may
                also disclose information if required by law or to protect the rights, safety, or integrity
                of EasyRakh and our users.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Your choices</h2>
              <p className="mt-3 leading-relaxed text-gray-600">
                You can access and update much of your information from within the product. You may contact
                us to ask about deletion or export of your account data, subject to legal and operational
                requirements. You can stop using the service at any time.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Changes</h2>
              <p className="mt-3 leading-relaxed text-gray-600">
                We may update this policy from time to time. We will post the revised version on this page
                and adjust the &quot;Last updated&quot; date. Continued use after changes means you accept
                the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Contact</h2>
              <p className="mt-3 leading-relaxed text-gray-600">
                For privacy-related questions, reach us at{' '}
                <a
                  href="mailto:support@easyrakh.com"
                  className="font-medium text-(--brand-green) underline underline-offset-2 hover:text-[#059669]"
                >
                  support@easyrakh.com
                </a>
                , or visit the{' '}
                <Link href="/#contact" className="font-medium text-(--brand-green) underline underline-offset-2 hover:text-[#059669]">
                  contact section
                </Link>{' '}
                on the home page.
              </p>
            </section>

            <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-8">
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/terms">Terms of service</Link>
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

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Page not found',
};

export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-10 sm:px-6 sm:py-16">
      <div className="relative w-full max-w-2xl text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center"
        >
          <div className="h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl sm:h-96 sm:w-96" />
        </div>

        <div className="mx-auto mb-6 flex w-full max-w-sm justify-center sm:max-w-md">
          <NotFoundIllustration />
        </div>

        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
          Error 404
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Page not found
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-slate-600 sm:text-base">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          Check the URL or head back to a familiar place.
        </p>

        <div className="mt-7 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-3">
          <Button asChild className="h-10 w-full bg-slate-900 px-5 text-white hover:bg-slate-800 sm:w-auto">
            <Link href="/dashboard">
              <Home className="h-4 w-4" />
              Go to Dashboard
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-10 w-full border-slate-200 bg-white sm:w-auto">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function NotFoundIllustration() {
  return (
    <svg
      role="img"
      aria-label="Page not found illustration"
      viewBox="0 0 480 280"
      className="h-auto w-full text-slate-700"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id="notFoundDots"
          x="0"
          y="0"
          width="16"
          height="16"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1.5" cy="1.5" r="1.2" className="fill-slate-200" />
        </pattern>
        <linearGradient id="notFoundPaper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f8fafc" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="480" height="280" fill="url(#notFoundDots)" />

      <g transform="translate(240 150)">
        <ellipse
          cx="0"
          cy="92"
          rx="150"
          ry="14"
          className="fill-slate-900/5"
        />
      </g>

      <g transform="translate(120 60)">
        <rect
          x="0"
          y="0"
          width="200"
          height="160"
          rx="14"
          ry="14"
          fill="url(#notFoundPaper)"
          className="stroke-slate-200"
          strokeWidth="2"
        />
        <rect x="20" y="26" width="120" height="10" rx="5" className="fill-slate-200" />
        <rect x="20" y="50" width="160" height="8" rx="4" className="fill-slate-100" />
        <rect x="20" y="68" width="140" height="8" rx="4" className="fill-slate-100" />
        <rect x="20" y="86" width="150" height="8" rx="4" className="fill-slate-100" />
        <rect x="20" y="104" width="90" height="8" rx="4" className="fill-slate-100" />

        <text
          x="100"
          y="148"
          textAnchor="middle"
          className="fill-slate-900"
          style={{
            fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
            fontWeight: 800,
            fontSize: '28px',
            letterSpacing: '0.04em',
          }}
        >
          404
        </text>
      </g>

      <g transform="translate(300 110)">
        <circle
          cx="36"
          cy="36"
          r="34"
          className="fill-white stroke-emerald-500"
          strokeWidth="6"
        />
        <circle
          cx="36"
          cy="36"
          r="22"
          className="fill-emerald-50"
        />
        <line
          x1="60"
          y1="60"
          x2="92"
          y2="92"
          className="stroke-emerald-500"
          strokeWidth="10"
          strokeLinecap="round"
        />
      </g>

      <g className="fill-emerald-400">
        <circle cx="80" cy="70" r="3" />
        <circle cx="410" cy="80" r="2.5" />
        <circle cx="395" cy="200" r="3" />
        <circle cx="100" cy="220" r="2" />
      </g>
    </svg>
  );
}

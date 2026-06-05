import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "react-day-picker/dist/style.css";
import AppShell from "@/components/AppShell";
import { Toaster } from "react-hot-toast";
import VoiceAssistantWrapper from "@/components/VoiceAssistantWrapper";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "./providers";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import InstallPrompt from "@/components/InstallPrompt";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "EasyRakh - Simple Ledger Management",
  description: "Manage your customers, suppliers, and transactions with ease. Track credits, debits, and balances all in one place.",
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/icon-192x192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'EasyRakh',
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-x-hidden neo-brutalist`}
      >
        <Providers>
          <AppShell>
            {children}
          </AppShell>
          <Toaster position="top-right" />
          <VoiceAssistantWrapper />
        </Providers>
        <ServiceWorkerRegistration />
        <InstallPrompt />
        <Analytics />
      </body>
    </html>
  );
}

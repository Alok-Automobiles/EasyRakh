import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "react-day-picker/dist/style.css";
import Header from "@/components/Header";
import { Toaster } from "react-hot-toast";
import VoiceAssistantWrapper from "@/components/VoiceAssistantWrapper";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EasyRakh - Simple Ledger Management",
  description: "Manage your customers, suppliers, and transactions with ease. Track credits, debits, and balances all in one place.",
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Header />
        <main className="min-h-screen bg-gray-50">
          {children}
        </main>
        <Toaster position="top-right" />
        <VoiceAssistantWrapper />
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import LandingNavbar from '@/components/landing/LandingNavbar';
import Footer from '@/components/landing/Footer';
import AboutPageContent from '@/components/landing/AboutPageContent';

export const metadata: Metadata = {
  title: 'About EasyRakh | Your business in one place',
  description:
    'EasyRakh brings khata, daily cash, simple invoices, charts, and AI answers together for Indian shops and teams—learn what we build and who it is for.',
};

export default function AboutPage() {
  return (
    <>
      <LandingNavbar />
      <AboutPageContent />
      <Footer />
    </>
  );
}

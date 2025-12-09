import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import HowItWorks from "@/components/landing/HowItWorks";
import Pricing from "@/components/landing/Pricing";
import Testimonials from "@/components/landing/Testimonials";
import FAQ from "@/components/landing/FAQ";
import Footer from "@/components/landing/Footer";
import LandingNavbar from "@/components/landing/LandingNavbar";
import Contact from "@/components/landing/Contact";

export default function Home() {
  return (
    <>
      <LandingNavbar />
      <main className="relative z-10 bg-(--brand-bg) min-h-screen shadow-xl pb-16 sm:pb-20 md:pb-24">
        <Hero />
        <Features />
        <HowItWorks />
        <Pricing />
        <Testimonials />
        <FAQ />
        <Contact />
      </main>
      <Footer />
    </>
  );
}

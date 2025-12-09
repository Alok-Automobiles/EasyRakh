'use client';

import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from "@/components/ui/carousel";
import { Quote } from 'lucide-react';

const testimonials = [
    {
        quote: "EasyRakh has completely changed how I manage my shop's credit. No more lost notebooks or forgotten payments.",
        name: "Rajesh Kumar",
        role: "Kirana Shop Owner",
        initial: "R"
    },
    {
        quote: "The daily cash record feature is a lifesaver. I can finally tally my cash drawer in minutes instead of hours.",
        name: "Priya Sharma",
        role: "Boutique Owner",
        initial: "P"
    },
    {
        quote: "Simple, fast, and secure. Exactly what a small business needs without any complicated accounting jargon.",
        name: "Amit Patel",
        role: "Wholesale Trader",
        initial: "A"
    },
    {
        quote: "I love that I can access it from my phone. I can check balances even when I'm away from the shop.",
        name: "Suresh Reddy",
        role: "Hardware Store Owner",
        initial: "S"
    }
];

export default function Testimonials() {
    return (
        <section className="py-20 sm:py-24 bg-white">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10">
                <div className="text-center mb-14 sm:mb-16">
                    <h2 className="text-base font-semibold text-[var(--brand-green)] tracking-wide uppercase mb-2">Trusted by Businesses</h2>
                    <p className="text-3xl sm:text-4xl font-bold text-gray-900">
                        What our users say
                    </p>
                </div>

                <div className="max-w-4xl mx-auto">
                    <Carousel
                        opts={{
                            align: "start",
                            loop: true,
                        }}
                        className="w-full"
                    >
                        <CarouselContent>
                            {testimonials.map((testimonial, index) => (
                                <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/2 p-4">
                                    <div className="h-full p-8 rounded-2xl bg-[var(--brand-bg)] border border-gray-100 hover:shadow-md transition-shadow">
                                        <Quote className="w-8 h-8 text-[var(--brand-green)]/20 mb-4" />
                                        <p className="text-gray-700 text-lg mb-6 italic">
                                            "{testimonial.quote}"
                                        </p>
                                        <div className="flex items-center gap-4 mt-auto">
                                            <div className="w-10 h-10 rounded-full bg-[var(--brand-green-light)] flex items-center justify-center text-[var(--brand-green)] font-bold">
                                                {testimonial.initial}
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-gray-900">{testimonial.name}</h4>
                                                <p className="text-sm text-gray-500">{testimonial.role}</p>
                                            </div>
                                        </div>
                                    </div>
                                </CarouselItem>
                            ))}
                        </CarouselContent>
                        <div className="hidden md:block">
                            <CarouselPrevious className="-left-12 border-gray-200 hover:bg-[var(--brand-green-light)] hover:text-[var(--brand-green)]" />
                            <CarouselNext className="-right-12 border-gray-200 hover:bg-[var(--brand-green-light)] hover:text-[var(--brand-green)]" />
                        </div>
                    </Carousel>
                </div>
            </div>
        </section>
    );
}

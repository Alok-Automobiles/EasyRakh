'use client';

import React from 'react';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
    {
        question: "Is EasyRakh really free?",
        answer: "Yes! EasyRakh is completely free to use for small businesses. We believe in empowering small business owners with the right tools without any cost barrier."
    },
    {
        question: "Is my data secure?",
        answer: "Absolutely. We use industry-standard encryption to protect your data. Your financial information is private and only accessible by you."
    },
    {
        question: "Can I use it on my mobile phone?",
        answer: "Yes, EasyRakh is fully responsive and works perfectly on mobile browsers. You can manage your ledger on the go."
    },
    {
        question: "Do I need accounting knowledge to use it?",
        answer: "Not at all. EasyRakh is designed for non-accountants. If you can write in a notebook, you can use EasyRakh."
    },
    {
        question: "Can I download my reports?",
        answer: "Yes, you can generate and download reports of your transactions and cashflow for your records."
    },
    {
        question: "How do I backup my data?",
        answer: "Your data is automatically backed up to our secure cloud servers in real-time. You don't need to do anything manually."
    }
];

export default function FAQ() {
    return (
        <section id="faq" className="pt-16 sm:pt-20 pb-16 sm:pb-20 bg-(--brand-bg)">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-10">
                <div className="text-center mb-12 sm:mb-14">
                    <h2 className="text-base font-semibold text-(--brand-green) tracking-wide uppercase mb-2">Common Questions</h2>
                    <p className="text-3xl sm:text-4xl font-bold text-gray-900">
                        Frequently Asked Questions
                    </p>
                </div>

                <Accordion type="single" collapsible className="w-full space-y-4">
                    {faqs.map((faq, index) => (
                        <AccordionItem key={index} value={`item-${index}`} className="bg-white rounded-xl border border-gray-200 px-6">
                            <AccordionTrigger className="text-left text-lg font-medium text-gray-900 hover:text-(--brand-green) hover:no-underline py-6">
                                {faq.question}
                            </AccordionTrigger>
                            <AccordionContent className="text-gray-600 pb-6 leading-relaxed">
                                {faq.answer}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </div>
        </section>
    );
}

'use client';

import { Users, Truck, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function EntityManagement() {
  return (
    <section className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl mb-4">
            Unified Logic for All Your Relationships
          </h2>
          <p className="text-lg text-gray-600">
            Whether it's customers you sell to or suppliers you buy from, manage them all with the same consistent, easy-to-understand logic.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Customer Ledger */}
          <Card className="border-0 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group">
            <div className="h-2 bg-blue-500 w-full" />
            <CardContent className="p-8">
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Users className="w-7 h-7 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Customer Ledger</h3>
              <p className="text-gray-600 mb-6">
                Track individual accounts for your customers. Know exactly how much they owe you (receivables) at any given moment.
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3" />
                  Track Receivables
                </li>
                <li className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3" />
                  Individual Account History
                </li>
                <li className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-3" />
                  Payment Reminders
                </li>
              </ul>
              <Button variant="outline" className="group-hover:bg-blue-50 group-hover:text-blue-700 group-hover:border-blue-200">
                Learn more <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </CardContent>
          </Card>

          {/* Supplier Ledger */}
          <Card className="border-0 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group">
            <div className="h-2 bg-purple-500 w-full" />
            <CardContent className="p-8">
              <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Truck className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Supplier Ledger</h3>
              <p className="text-gray-600 mb-6">
                Manage accounts for your suppliers. Keep track of what you owe them (payables) and never miss a payment deadline.
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-purple-500 rounded-full mr-3" />
                  Track Payables
                </li>
                <li className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-purple-500 rounded-full mr-3" />
                  Purchase History
                </li>
                <li className="flex items-center text-gray-700">
                  <div className="w-2 h-2 bg-purple-500 rounded-full mr-3" />
                  Credit Period Tracking
                </li>
              </ul>
              <Button variant="outline" className="group-hover:bg-purple-50 group-hover:text-purple-700 group-hover:border-purple-200">
                Learn more <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

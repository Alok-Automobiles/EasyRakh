'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, PieChart, Activity } from 'lucide-react';

export default function DashboardPreview() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          
          {/* Visual Content - Dashboard Mockup */}
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-3xl blur-2xl -z-10" />
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
              {/* Header Mock */}
              <div className="border-b px-6 py-4 flex items-center justify-between bg-gray-50/50">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="text-xs font-medium text-gray-400">Dashboard Overview</div>
              </div>
              
              {/* Dashboard Content */}
              <div className="p-6 grid grid-cols-2 gap-4">
                <div className="col-span-2 bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                  <div className="text-sm text-indigo-600 font-medium mb-1">Total Net Worth</div>
                  <div className="text-3xl font-bold text-indigo-900">₹ 8,45,230</div>
                  <div className="text-xs text-indigo-500 mt-2">↑ 12% from last month</div>
                </div>
                
                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                  <div className="text-xs text-emerald-600 font-medium mb-1">Receivables</div>
                  <div className="text-xl font-bold text-emerald-900">₹ 2.4L</div>
                </div>
                
                <div className="bg-rose-50 rounded-xl p-4 border border-rose-100">
                  <div className="text-xs text-rose-600 font-medium mb-1">Payables</div>
                  <div className="text-xl font-bold text-rose-900">₹ 1.1L</div>
                </div>

                <div className="col-span-2 mt-2">
                  <div className="h-32 flex items-end gap-2 justify-between px-2">
                    {[40, 70, 45, 90, 60, 80, 50].map((h, i) => (
                      <div key={i} className="w-full bg-gray-100 rounded-t-md relative group">
                        <div 
                          className="absolute bottom-0 left-0 right-0 bg-indigo-500 rounded-t-md transition-all duration-500 group-hover:bg-indigo-600"
                          style={{ height: `${h}%` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Text Content */}
          <div>
            <h2 className="text-4xl font-bold text-gray-900 mb-6">
              Insights that Drive Decisions
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              Get a clear picture of your business health at a glance. Our dashboard aggregates all your data to show you exactly where you stand.
            </p>

            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Financial Overview</h3>
                  <p className="text-gray-600">
                    Instant access to Total Receivables and Payables. Know your liquidity position in seconds.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <Activity className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Recent Activity Feed</h3>
                  <p className="text-gray-600">
                    Stay on top of daily operations with a real-time feed of the most recent transactions.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <PieChart className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Business Health</h3>
                  <p className="text-gray-600">
                    Visualize gains vs. losses to track every rupee with confidence.
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

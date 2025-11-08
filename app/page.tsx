'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import BalanceCard from '@/components/BalanceCard';
import ActivityCard from '@/components/ActivityCard';
import { Transaction, Customer, Supplier, RecentActivity } from '@/lib/types';

interface DashboardStats {
  totalCredit: number;
  totalDebit: number;
  netBalance: number;
  totalCustomers: number;
  totalSuppliers: number;
  totalTransactions: number;
}

export default function Dashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    totalCredit: 0,
    totalDebit: 0,
    netBalance: 0,
    totalCustomers: 0,
    totalSuppliers: 0,
    totalTransactions: 0,
  });
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch customers, suppliers, transactions, and activities
      const [customersResponse, suppliersResponse, transactionsResponse, activitiesResponse] = await Promise.all([
        fetch('/api/customers'),
        fetch('/api/suppliers'),
        fetch('/api/transactions'),
        fetch('/api/activities'),
      ]);

      if (customersResponse.status === 401 || suppliersResponse.status === 401 || transactionsResponse.status === 401) {
        router.push('/login');
        return;
      }

      const customersData = await customersResponse.json();
      const suppliersData = await suppliersResponse.json();
      const transactionsData = await transactionsResponse.json();
      const activitiesData = await activitiesResponse.json();

      const customers = customersData.customers || [];
      const suppliers = suppliersData.suppliers || [];
      const transactions = transactionsData.transactions || [];

      // Calculate stats
      const totalCredit = transactions
        .filter((t: Transaction) => t.type === 'credit')
        .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

      const totalDebit = transactions
        .filter((t: Transaction) => t.type === 'debit')
        .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

      // Calculate net balance from customers' and suppliers' opening balances
      let netBalance = 0;
      for (const customer of customers) {
        if (customer.balanceType === 'credit') {
          netBalance -= customer.openingBalance;
        } else {
          netBalance += customer.openingBalance;
        }
      }
      for (const supplier of suppliers) {
        if (supplier.balanceType === 'credit') {
          netBalance -= supplier.openingBalance;
        } else {
          netBalance += supplier.openingBalance;
        }
      }

      // Add transactions to balance
      netBalance = netBalance - totalCredit + totalDebit;

      setStats({
        totalCredit,
        totalDebit,
        netBalance,
        totalCustomers: customers.length,
        totalSuppliers: suppliers.length,
        totalTransactions: transactions.length,
      });

      // Set recent activities
      setRecentActivities(activitiesData.activities || []);
    } catch (error) {
      toast.error('Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Overview of your ledger</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <BalanceCard
          title="Total Credit"
          amount={stats.totalCredit}
          type="credit"
        />
        <BalanceCard
          title="Total Debit"
          amount={stats.totalDebit}
          type="debit"
        />
        <BalanceCard
          title="Net Balance"
          amount={stats.netBalance}
          type="balance"
        />
        <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600 mb-2">
                Total Customers
              </p>
              <p className="text-3xl font-bold text-gray-900">
                {stats.totalCustomers}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600 mb-2">
                Total Suppliers
              </p>
              <p className="text-3xl font-bold text-gray-900">
                {stats.totalSuppliers}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/customers"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium"
          >
            Manage Customers
          </Link>
          <Link
            href="/suppliers"
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md font-medium"
          >
            Manage Suppliers
          </Link>
          <Link
            href="/transactions/new"
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium"
          >
            Add Transaction
          </Link>
        </div>
      </div>

      {/* Recent Activities */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Recent Activities
          </h2>
          <Link
            href="/transactions/new"
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            View All
          </Link>
        </div>
        {recentActivities.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No activities yet.</p>
            <p className="text-gray-400 mt-2">
              <Link
                href="/transactions/new"
                className="text-blue-600 hover:text-blue-800"
              >
                Add your first transaction
              </Link>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentActivities.slice(0, 10).map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

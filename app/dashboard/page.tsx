'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import BalanceCard from '@/components/BalanceCard';
import ActivityCard from '@/components/ActivityCard';
import { Transaction, Customer, Supplier, RecentActivity } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

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

      // Add transactions to balance with entity-specific logic:
      // Suppliers: Credit subtracts (you owe more, balance more negative), Debit adds (you owe less, balance less negative)
      // Customers: Credit subtracts (they owe less), Debit adds (they owe more)
      const customerTransactions = transactions.filter((t: Transaction) => t.entityType === 'customer');
      const supplierTransactions = transactions.filter((t: Transaction) => t.entityType === 'supplier');

      // Customer transactions: Credit subtracts, Debit adds
      for (const transaction of customerTransactions) {
        if (transaction.type === 'credit') {
          netBalance -= transaction.amount; // Credit subtracts (they owe less)
        } else {
          netBalance += transaction.amount; // Debit adds (they owe more)
        }
      }

      // Supplier transactions: Credit subtracts (you owe more), Debit adds (you owe less)
      for (const transaction of supplierTransactions) {
        if (transaction.type === 'credit') {
          netBalance -= transaction.amount; // Credit subtracts (you owe more, balance more negative)
        } else {
          netBalance += transaction.amount; // Debit adds (you owe less, balance less negative)
        }
      }

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
        <div className="space-y-8">
          <div>
            <Skeleton className="h-9 w-48 mb-2" />
            <Skeleton className="h-5 w-64" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
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
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  Total Customers
                </p>
                <p className="text-3xl font-bold text-foreground">
                  {stats.totalCustomers}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  Total Suppliers
                </p>
                <p className="text-3xl font-bold text-foreground">
                  {stats.totalSuppliers}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Button asChild>
              <Link href="/customers">Manage Customers</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/suppliers">Manage Suppliers</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/transactions/new">Add Transaction</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activities */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Recent Activities</CardTitle>
            <Button asChild variant="link">
              <Link href="/transactions/new">View All</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentActivities.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No activities yet.</p>
              <p className="text-muted-foreground mt-2">
                <Button asChild variant="link">
                  <Link href="/transactions/new">Add your first transaction</Link>
                </Button>
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
        </CardContent>
      </Card>
    </div>
  );
}


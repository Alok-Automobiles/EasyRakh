'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { format } from 'date-fns';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface LedgerEntry {
  date: Date;
  description: string;
  credit: number;
  debit: number;
  balance: number;
}

interface LedgerData {
  entity: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    openingBalance: number;
    balanceType: 'credit' | 'debit';
  };
  entityType: 'customer' | 'supplier';
  openingBalance: {
    amount: number;
    type: 'credit' | 'debit';
  };
  entries: LedgerEntry[];
  totals: {
    credit: number;
    debit: number;
    balance: number;
  };
}

export default function LedgerPage() {
  const router = useRouter();
  const params = useParams();
  const entityType = params.entityType as 'customer' | 'supplier';
  const entityId = params.entityId as string;
  const [ledgerData, setLedgerData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (entityId && entityType) {
      fetchLedger();
    }
  }, [entityId, entityType]);

  const fetchLedger = async () => {
    try {
      const response = await fetch(`/api/ledger/${entityType}/${entityId}`);
      if (response.ok) {
        const data = await response.json();
        setLedgerData(data);
      } else if (response.status === 401) {
        router.push('/login');
      } else {
        toast.error('Failed to fetch ledger');
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Skeleton className="h-9 w-48 mb-6" />
        <Skeleton className="h-32 mb-6" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!ledgerData) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">Ledger not found</div>
      </div>
    );
  }

  const { entity, openingBalance, entries, totals } = ledgerData;
  const finalBalanceColor = totals.balance >= 0 ? 'text-green-600' : 'text-red-600';
  const entityName = entityType === 'customer' ? 'Customers' : 'Suppliers';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href={`/${entityType === 'customer' ? 'customers' : 'suppliers'}`}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium mb-4 inline-block"
        >
          ← Back to {entityName}
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">{entity.name} - Ledger</h1>
        {entity.phone && (
          <p className="text-gray-600 mt-1">Phone: {entity.phone}</p>
        )}
        {entity.email && (
          <p className="text-gray-600">Email: {entity.email}</p>
        )}
        {entity.address && (
          <p className="text-gray-600 mt-1">{entity.address}</p>
        )}
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Opening Balance</CardTitle>
        </CardHeader>
        <CardContent>
        <div className="flex items-center space-x-4">
          <span className="text-gray-600">Amount:</span>
          <span
            className={`text-2xl font-bold ${
              openingBalance.type === 'credit' ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {openingBalance.type === 'credit' ? '+' : '-'}₹
            {openingBalance.amount.toLocaleString()}
          </span>
          <span className="text-sm text-gray-500">
            ({openingBalance.type === 'credit' ? 'You owe them' : 'They owe you'})
          </span>
        </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Credit
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Debit
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {/* Opening Balance Row */}
              <tr className="bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {format(new Date(), 'MMM dd, yyyy')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  Opening Balance
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                  {openingBalance.type === 'credit' ? `₹${openingBalance.amount.toLocaleString()}` : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                  {openingBalance.type === 'debit' ? `₹${openingBalance.amount.toLocaleString()}` : '-'}
                </td>
                <td
                  className={`px-6 py-4 whitespace-nowrap text-sm text-right font-semibold ${
                    openingBalance.type === 'credit' ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {openingBalance.type === 'credit' ? '-' : ''}₹
                  {openingBalance.amount.toLocaleString()}
                </td>
              </tr>

              {/* Transaction Entries */}
              {entries.map((entry, index) => {
                const balanceColor = entry.balance >= 0 ? 'text-green-600' : 'text-red-600';
                return (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(new Date(entry.date), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {entry.description || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600">
                      {entry.credit > 0 ? `₹${entry.credit.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600">
                      {entry.debit > 0 ? `₹${entry.debit.toLocaleString()}` : '-'}
                    </td>
                    <td
                      className={`px-6 py-4 whitespace-nowrap text-sm text-right font-semibold ${balanceColor}`}
                    >
                      {entry.balance >= 0 ? '' : '-'}₹{Math.abs(entry.balance).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-100">
              <tr>
                <td
                  colSpan={2}
                  className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900"
                >
                  Total
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-green-600">
                  ₹{totals.credit.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-red-600">
                  ₹{totals.debit.toLocaleString()}
                </td>
                <td
                  className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-lg ${finalBalanceColor}`}
                >
                  {totals.balance >= 0 ? '' : '-'}₹{Math.abs(totals.balance).toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button asChild>
          <Link href={`/transactions/new?entityType=${entityType}&entityId=${entityId}`}>
            Add Transaction
          </Link>
        </Button>
      </div>
    </div>
  );
}


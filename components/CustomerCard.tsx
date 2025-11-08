'use client';

import Link from 'next/link';
import { Customer } from '@/lib/types';
import { format } from 'date-fns';

interface CustomerCardProps {
  customer: Customer & { id: string };
  onDelete?: (id: string) => void;
}

export default function CustomerCard({ customer, onDelete }: CustomerCardProps) {
  const balanceColor =
    customer.balanceType === 'credit'
      ? 'text-green-600'
      : 'text-red-600';

  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <Link
            href={`/ledger/customer/${customer.id}`}
            className="text-xl font-semibold text-gray-900 hover:text-blue-600"
          >
            {customer.name}
          </Link>
          {customer.phone && (
            <p className="text-sm text-gray-600 mt-1">Phone: {customer.phone}</p>
          )}
          {customer.email && (
            <p className="text-sm text-gray-600">Email: {customer.email}</p>
          )}
          {customer.address && (
            <p className="text-sm text-gray-600 mt-1">{customer.address}</p>
          )}
          <div className="mt-3">
            <span className="text-sm text-gray-500">Opening Balance: </span>
            <span className={`font-semibold ${balanceColor}`}>
              {customer.balanceType === 'credit' ? '+' : '-'}₹
              {customer.openingBalance.toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Created: {format(new Date(customer.createdAt), 'MMM dd, yyyy')}
          </p>
        </div>
        {onDelete && (
          <button
            onClick={() => onDelete(customer.id)}
            className="ml-4 text-red-500 hover:text-red-700 text-sm font-medium"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}


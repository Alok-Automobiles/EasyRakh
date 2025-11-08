'use client';

import Link from 'next/link';
import { Supplier } from '@/lib/types';
import { format } from 'date-fns';

interface SupplierCardProps {
  supplier: Supplier & { id: string };
  onDelete?: (id: string) => void;
}

export default function SupplierCard({ supplier, onDelete }: SupplierCardProps) {
  const balanceColor =
    supplier.balanceType === 'credit'
      ? 'text-green-600'
      : 'text-red-600';

  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <Link
            href={`/ledger/supplier/${supplier.id}`}
            className="text-xl font-semibold text-gray-900 hover:text-blue-600"
          >
            {supplier.name}
          </Link>
          {supplier.phone && (
            <p className="text-sm text-gray-600 mt-1">Phone: {supplier.phone}</p>
          )}
          {supplier.email && (
            <p className="text-sm text-gray-600">Email: {supplier.email}</p>
          )}
          {supplier.address && (
            <p className="text-sm text-gray-600 mt-1">{supplier.address}</p>
          )}
          <div className="mt-3">
            <span className="text-sm text-gray-500">Opening Balance: </span>
            <span className={`font-semibold ${balanceColor}`}>
              {supplier.balanceType === 'credit' ? '+' : '-'}₹
              {supplier.openingBalance.toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Created: {format(new Date(supplier.createdAt), 'MMM dd, yyyy')}
          </p>
        </div>
        {onDelete && (
          <button
            onClick={() => onDelete(supplier.id)}
            className="ml-4 text-red-500 hover:text-red-700 text-sm font-medium"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}


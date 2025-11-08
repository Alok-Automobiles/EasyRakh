'use client';

import { Transaction } from '@/lib/types';
import { format } from 'date-fns';

interface TransactionCardProps {
  transaction: Transaction & { id: string; customerName?: string };
  onDelete?: (id: string) => void;
  onEdit?: (transaction: Transaction & { id: string }) => void;
}

export default function TransactionCard({
  transaction,
  onDelete,
  onEdit,
}: TransactionCardProps) {
  const isCredit = transaction.type === 'credit';
  const amountColor = isCredit ? 'text-green-600' : 'text-red-600';
  const bgColor = isCredit ? 'bg-green-50' : 'bg-red-50';

  return (
    <div className={`${bgColor} rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow`}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <span
              className={`px-2 py-1 rounded text-xs font-semibold ${
                isCredit ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
              }`}
            >
              {isCredit ? 'Credit' : 'Debit'}
            </span>
            {transaction.customerName && (
              <span className="text-sm font-medium text-gray-700">
                {transaction.customerName}
              </span>
            )}
          </div>
          {transaction.description && (
            <p className="text-sm text-gray-600 mt-1">{transaction.description}</p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            {format(new Date(transaction.date), 'MMM dd, yyyy')}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <span className={`text-lg font-bold ${amountColor}`}>
            {isCredit ? '+' : '-'}₹{transaction.amount.toLocaleString()}
          </span>
          <div className="flex space-x-2">
            {onEdit && (
              <button
                onClick={() => onEdit(transaction)}
                className="text-blue-500 hover:text-blue-700 text-sm font-medium"
              >
                Edit
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(transaction.id)}
                className="text-red-500 hover:text-red-700 text-sm font-medium"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


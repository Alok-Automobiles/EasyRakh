'use client';

import Link from 'next/link';
import { Customer } from '@/lib/types';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <Link
              href={`/ledger/customer/${customer.id}`}
              className="text-xl font-semibold text-foreground hover:text-primary"
            >
              {customer.name}
            </Link>
            {customer.phone && (
              <p className="text-sm text-muted-foreground mt-1">Phone: {customer.phone}</p>
            )}
            {customer.email && (
              <p className="text-sm text-muted-foreground">Email: {customer.email}</p>
            )}
            {customer.address && (
              <p className="text-sm text-muted-foreground mt-1">{customer.address}</p>
            )}
            <div className="mt-3">
              <span className="text-sm text-muted-foreground">Opening Balance: </span>
              <span className={`font-semibold ${balanceColor}`}>
                {customer.balanceType === 'credit' ? '+' : '-'}₹
                {customer.openingBalance.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Created: {format(new Date(customer.createdAt), 'MMM dd, yyyy')}
            </p>
          </div>
          {onDelete && (
            <Button
              onClick={() => onDelete(customer.id)}
              variant="ghost"
              size="sm"
              className="ml-4 text-destructive hover:text-destructive"
            >
              Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


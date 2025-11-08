'use client';

import Link from 'next/link';
import { Supplier } from '@/lib/types';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <Link
              href={`/ledger/supplier/${supplier.id}`}
              className="text-xl font-semibold text-foreground hover:text-primary"
            >
              {supplier.name}
            </Link>
            {supplier.phone && (
              <p className="text-sm text-muted-foreground mt-1">Phone: {supplier.phone}</p>
            )}
            {supplier.email && (
              <p className="text-sm text-muted-foreground">Email: {supplier.email}</p>
            )}
            {supplier.address && (
              <p className="text-sm text-muted-foreground mt-1">{supplier.address}</p>
            )}
            <div className="mt-3">
              <span className="text-sm text-muted-foreground">Opening Balance: </span>
              <span className={`font-semibold ${balanceColor}`}>
                {supplier.balanceType === 'credit' ? '+' : '-'}₹
                {supplier.openingBalance.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Created: {format(new Date(supplier.createdAt), 'MMM dd, yyyy')}
            </p>
          </div>
          {onDelete && (
            <Button
              onClick={() => onDelete(supplier.id)}
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


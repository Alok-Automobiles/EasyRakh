'use client';

import Link from 'next/link';
import { CustomEntity } from '@/lib/types';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface CustomEntityCardProps {
  entity: CustomEntity & { id: string };
  collectionTypeSlug: string;
  onDelete?: (id: string) => void;
}

export default function CustomEntityCard({ entity, collectionTypeSlug, onDelete }: CustomEntityCardProps) {
  const balanceColor =
    entity.balanceType === 'credit'
      ? 'text-green-600'
      : 'text-red-600';

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <Link
              href={`/ledger/${collectionTypeSlug}/${entity.id}`}
              className="text-xl font-semibold text-foreground hover:text-primary"
            >
              {entity.name}
            </Link>
            {entity.phone && (
              <p className="text-sm text-muted-foreground mt-1">Phone: {entity.phone}</p>
            )}
            {entity.email && (
              <p className="text-sm text-muted-foreground">Email: {entity.email}</p>
            )}
            {entity.address && (
              <p className="text-sm text-muted-foreground mt-1">{entity.address}</p>
            )}
            <div className="mt-3">
              <span className="text-sm text-muted-foreground">Opening Balance: </span>
              <span className={`font-semibold ${balanceColor}`}>
                {entity.balanceType === 'credit' ? '+' : '-'}₹
                {entity.openingBalance.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Created: {format(new Date(entity.createdAt), 'MMM dd, yyyy')}
            </p>
          </div>
          {onDelete && (
            <Button
              onClick={() => onDelete(entity.id)}
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


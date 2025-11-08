'use client';

import { Transaction } from '@/lib/types';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
    <Card className={`${bgColor} hover:shadow-lg transition-shadow`}>
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <Badge
                variant={isCredit ? 'default' : 'destructive'}
                className={isCredit ? 'bg-green-200 text-green-800 hover:bg-green-200' : 'bg-red-200 text-red-800 hover:bg-red-200'}
              >
                {isCredit ? 'Credit' : 'Debit'}
              </Badge>
              {transaction.customerName && (
                <span className="text-sm font-medium text-foreground">
                  {transaction.customerName}
                </span>
              )}
            </div>
            {transaction.description && (
              <p className="text-sm text-muted-foreground mt-1">{transaction.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {format(new Date(transaction.date), 'MMM dd, yyyy')}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <span className={`text-lg font-bold ${amountColor}`}>
              {isCredit ? '+' : '-'}₹{transaction.amount.toLocaleString()}
            </span>
            <div className="flex space-x-2">
              {onEdit && (
                <Button
                  onClick={() => onEdit(transaction)}
                  variant="ghost"
                  size="sm"
                  className="text-primary hover:text-primary"
                >
                  Edit
                </Button>
              )}
              {onDelete && (
                <Button
                  onClick={() => onDelete(transaction.id)}
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


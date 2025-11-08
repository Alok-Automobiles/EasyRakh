'use client';

import { Card, CardContent } from '@/components/ui/card';

interface BalanceCardProps {
  title: string;
  amount: number;
  type: 'credit' | 'debit' | 'balance';
  icon?: React.ReactNode;
}

export default function BalanceCard({
  title,
  amount,
  type,
  icon,
}: BalanceCardProps) {
  const getColor = () => {
    if (type === 'credit') return 'text-green-600 bg-green-50';
    if (type === 'debit') return 'text-red-600 bg-red-50';
    return amount >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
  };

  const getSign = () => {
    if (type === 'credit') return '+';
    if (type === 'debit') return '';
    return amount >= 0 ? '' : '-';
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground mb-2">{title}</p>
            <p className={`text-3xl font-bold ${getColor().split(' ')[0]}`}>
              {getSign()}₹{Math.abs(amount).toLocaleString()}
            </p>
          </div>
          {icon && (
            <div className={`p-3 rounded-full ${getColor().split(' ')[1]}`}>
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


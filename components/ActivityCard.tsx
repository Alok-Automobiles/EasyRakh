'use client';

import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { RecentActivity } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';

interface ActivityCardProps {
  activity: RecentActivity;
}

export default function ActivityCard({ activity }: ActivityCardProps) {
  const router = useRouter();

  const getActivityColor = () => {
    if (activity.type === 'customer_created') return 'bg-blue-50';
    if (activity.type === 'supplier_created') return 'bg-purple-50';
    return activity.transactionType === 'credit' ? 'bg-green-50' : 'bg-red-50';
  };

  const getActivityIcon = () => {
    if (activity.type === 'customer_created') {
      return (
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
          C
        </div>
      );
    }
    if (activity.type === 'supplier_created') {
      return (
        <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-semibold">
          S
        </div>
      );
    }
    return (
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold ${
        activity.transactionType === 'credit' ? 'bg-green-500' : 'bg-red-500'
      }`}>
        T
      </div>
    );
  };

  const handleNavigate = () => {
    if (activity.entityType && activity.entityId) {
      router.push(`/ledger/${activity.entityType}/${activity.entityId}`);
    }
  };

  const disabled = !(activity.entityType && activity.entityId);

  return (
    <button
      type="button"
      onClick={handleNavigate}
      disabled={disabled}
      className={`w-full text-left focus:outline-none ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <Card
        className={`${getActivityColor()} hover:shadow-lg transition-shadow ${
          disabled ? 'opacity-75' : 'focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500'
        }`}
      >
        <CardContent className="p-4">
          <div className="flex items-start space-x-4">
            {getActivityIcon()}
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground">{activity.entityName}</p>
                  <p className="text-sm text-muted-foreground mt-1">{activity.description}</p>
                </div>
                {activity.amount !== undefined && (
                  <span
                    className={`text-lg font-bold ${
                      activity.transactionType === 'credit' ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {activity.transactionType === 'credit' ? '+' : '-'}₹
                    {activity.amount.toLocaleString()}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {format(new Date(activity.createdAt), 'MMM dd, yyyy HH:mm')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}


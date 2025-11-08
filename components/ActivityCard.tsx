'use client';

import { format } from 'date-fns';
import { RecentActivity } from '@/lib/types';

interface ActivityCardProps {
  activity: RecentActivity;
}

export default function ActivityCard({ activity }: ActivityCardProps) {
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

  return (
    <div className={`${getActivityColor()} rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow`}>
      <div className="flex items-start space-x-4">
        {getActivityIcon()}
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">{activity.entityName}</p>
              <p className="text-sm text-gray-600 mt-1">{activity.description}</p>
            </div>
            {activity.amount !== undefined && (
              <span className={`text-lg font-bold ${
                activity.transactionType === 'credit' ? 'text-green-600' : 'text-red-600'
              }`}>
                {activity.transactionType === 'credit' ? '+' : '-'}₹{activity.amount.toLocaleString()}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {format(new Date(activity.createdAt), 'MMM dd, yyyy HH:mm')}
          </p>
        </div>
      </div>
    </div>
  );
}


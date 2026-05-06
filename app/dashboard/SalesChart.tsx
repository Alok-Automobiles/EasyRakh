'use client';

import { format } from 'date-fns';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

export type SalesChartPoint = {
  label: string;
  totalIn: number;
  totalOut: number;
  dateISO: string;
};

interface SalesTooltipProps {
  active?: boolean;
  payload?: { payload: SalesChartPoint }[];
}

const SalesTooltip = ({ active, payload }: SalesTooltipProps) => {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-xl p-4 shadow-xl border border-gray-200 bg-white">
      <p className="text-sm font-semibold text-gray-900 mb-3">
        {format(new Date(point.dateISO), 'EEEE, MMM d')}
      </p>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-700" />
          <span className="text-xs text-gray-600">Cash In:</span>
          <span className="text-xs font-semibold text-green-700">{formatCurrency(point.totalIn)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-700" />
          <span className="text-xs text-gray-600">Cash Out:</span>
          <span className="text-xs font-semibold text-red-700">{formatCurrency(point.totalOut)}</span>
        </div>
      </div>
    </div>
  );
};

export default function SalesChart({ data }: { data: SalesChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#15803d" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#15803d" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#b91c1c" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#b91c1c" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
        <XAxis
          dataKey="label"
          tick={{ fill: '#6b7280', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(value) => `${Math.round(value / 1000)}k`}
          tick={{ fill: '#6b7280', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <RechartsTooltip content={<SalesTooltip />} />
        <Area
          type="monotone"
          dataKey="totalIn"
          stroke="#15803d"
          fill="url(#colorIn)"
          strokeWidth={2.5}
          name="Cash In"
        />
        <Area
          type="monotone"
          dataKey="totalOut"
          stroke="#b91c1c"
          fill="url(#colorOut)"
          strokeWidth={2.5}
          name="Cash Out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

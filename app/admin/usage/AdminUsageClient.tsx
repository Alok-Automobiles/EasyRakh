'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Search,
  ShieldAlert,
  TrendingUp,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDebounce } from '@/lib/hooks/useDebounce';

type ActivityFilter = 'all' | '24h' | '7d' | '30d' | 'inactive';

const USERS_PAGE_SIZE = 10;

interface UsageUser {
  id: string;
  name: string;
  email: string;
  createdAt: string | null;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  loginCount: number;
}

interface AdminUsageResponse {
  totalUsers: number;
  activeLast24Hours: number;
  activeLast7Days: number;
  activeLast30Days: number;
  newUsersLast7Days: number;
  inactive30PlusDays: number;
  activeRateLast7Days: number;
  activeRateLast30Days: number;
  stickinessRate: number;
  averageLoginCount: number;
  generatedAt: string;
  pagination: {
    total: number;
    totalUsers: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  users: UsageUser[];
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const tableDateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: '2-digit',
});

const tableTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
});

function formatDate(value: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Never';
  return dateFormatter.format(date);
}

function getTableDateParts(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  return {
    date: tableDateFormatter.format(date),
    time: tableTimeFormatter.format(date),
  };
}

function ActivityDate({ value }: { value: string | null }) {
  const parts = getTableDateParts(value);

  if (!parts) {
    return <span className="text-gray-500">Never</span>;
  }

  return (
    <span className="block leading-tight">
      <span className="block whitespace-nowrap">{parts.date}</span>
      <span className="block whitespace-nowrap text-xs text-gray-500">{parts.time}</span>
    </span>
  );
}

function getActivityAgeMs(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return Number.POSITIVE_INFINITY;
  return Date.now() - date.getTime();
}

function getActivityStatus(user: UsageUser) {
  const ageMs = getActivityAgeMs(user.lastActiveAt);
  const dayMs = 24 * 60 * 60 * 1000;

  if (ageMs <= dayMs) {
    return {
      label: 'Active 24h',
      filter: '24h' as const,
      className: 'border-green-200 bg-green-50 text-green-700',
    };
  }

  if (ageMs <= 7 * dayMs) {
    return {
      label: 'Active 7d',
      filter: '7d' as const,
      className: 'border-blue-200 bg-blue-50 text-blue-700',
    };
  }

  if (ageMs <= 30 * dayMs) {
    return {
      label: 'Active 30d',
      filter: '30d' as const,
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  return {
    label: 'Inactive',
    filter: 'inactive' as const,
    className: 'border-gray-200 bg-gray-50 text-gray-600',
  };
}

function metricValue(value: number, suffix = '') {
  return `${Number.isFinite(value) ? value.toLocaleString('en-IN') : '0'}${suffix}`;
}

export default function AdminUsageClient() {
  const router = useRouter();
  const [data, setData] = useState<AdminUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState('');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    const controller = new AbortController();

    async function loadUsage() {
      setLoading(true);
      setError(null);
      setForbidden(false);

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(USERS_PAGE_SIZE),
          status: activityFilter,
        });
        const query = debouncedSearch.trim();
        if (query) {
          params.set('search', query);
        }

        const response = await fetch(`/api/admin/usage?${params.toString()}`, {
          signal: controller.signal,
          cache: 'no-store',
        });

        if (response.status === 401) {
          router.push('/login');
          return;
        }

        if (response.status === 403) {
          setForbidden(true);
          return;
        }

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || 'Failed to load user activity');
        }

        setData(await response.json());
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load user activity');
      } finally {
        setLoading(false);
      }
    }

    loadUsage();
    return () => controller.abort();
  }, [activityFilter, debouncedSearch, page, router]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 rounded bg-gray-200 animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-32 rounded-xl bg-gray-200 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-red-600" />
          <h1 className="mt-4 text-xl font-bold text-red-900">Admin access required</h1>
          <p className="mt-2 text-sm text-red-700">
            Your logged-in email is not listed in the admin allow-list for this deployment.
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-xl font-bold text-red-900">Unable to load user activity</h1>
        <p className="mt-2 text-sm text-red-700">{error || 'Please try again.'}</p>
      </div>
    );
  }

  const metrics = [
    {
      label: 'Total Users',
      value: metricValue(data.totalUsers),
      icon: Users,
      className: 'bg-slate-50 text-slate-700 border-slate-200',
    },
    {
      label: 'Active Last 24 Hours',
      value: metricValue(data.activeLast24Hours),
      icon: Activity,
      className: 'bg-green-50 text-green-700 border-green-200',
    },
    {
      label: 'Active Last 7 Days',
      value: metricValue(data.activeLast7Days),
      icon: UserRoundCheck,
      className: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    {
      label: 'Active Last 30 Days',
      value: metricValue(data.activeLast30Days),
      icon: BarChart3,
      className: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    },
    {
      label: 'New Users Last 7 Days',
      value: metricValue(data.newUsersLast7Days),
      icon: UserPlus,
      className: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    },
    {
      label: 'Inactive 30+ Days',
      value: metricValue(data.inactive30PlusDays),
      icon: UserRoundX,
      className: 'bg-amber-50 text-amber-700 border-amber-200',
    },
  ];

  const insights = [
    {
      label: '7-Day Active Rate',
      value: metricValue(data.activeRateLast7Days, '%'),
      icon: TrendingUp,
    },
    {
      label: '30-Day Active Rate',
      value: metricValue(data.activeRateLast30Days, '%'),
      icon: TrendingUp,
    },
    {
      label: 'Stickiness',
      value: metricValue(data.stickinessRate, '%'),
      icon: Clock3,
    },
    {
      label: 'Avg Login Count',
      value: metricValue(data.averageLoginCount),
      icon: Users,
    },
  ];

  const filters: Array<{ label: string; value: ActivityFilter }> = [
    { label: 'All', value: 'all' },
    { label: 'Active 24h', value: '24h' },
    { label: 'Active 7d', value: '7d' },
    { label: 'Active 30d', value: '30d' },
    { label: 'Inactive', value: 'inactive' },
  ];
  const users = data.users;
  const pagination = data.pagination;
  const firstVisibleUser =
    pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const lastVisibleUser = Math.min(pagination.page * pagination.pageSize, pagination.total);
  const totalUsersLabel = pagination.totalUsers.toLocaleString('en-IN');
  const listSummary =
    pagination.total === 0
      ? `0 users shown from ${totalUsersLabel} total`
      : `${firstVisibleUser.toLocaleString('en-IN')}-${lastVisibleUser.toLocaleString('en-IN')} of ${pagination.total.toLocaleString('en-IN')} users shown${
          pagination.total !== pagination.totalUsers ? ` from ${totalUsersLabel} total` : ''
        }`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Admin Analytics
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-950 sm:text-3xl">
            User Activity Dashboard
          </h1>
        </div>
        <p className="text-sm text-gray-500">
          Updated {formatDate(data.generatedAt)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label} className={`border p-5 ${metric.className}`}>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium opacity-80">{metric.label}</p>
                  <p className="mt-2 text-3xl font-bold tracking-normal">{metric.value}</p>
                </div>
                <Icon className="h-8 w-8 shrink-0 opacity-80" />
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {insights.map((insight) => {
          const Icon = insight.icon;
          return (
            <div
              key={insight.label}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center gap-2 text-gray-500">
                <Icon className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {insight.label}
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-950">{insight.value}</p>
            </div>
          );
        })}
      </div>

      <Card className="overflow-hidden border-gray-200 bg-white py-0">
        <CardHeader className="border-b border-gray-100 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-lg">Registered Users</CardTitle>
              <p className="mt-1 text-sm text-gray-500">
                {listSummary}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search users"
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {filters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => {
                      setActivityFilter(filter.value);
                      setPage(1);
                    }}
                    className={`h-9 rounded-md border px-3 text-sm font-medium transition-colors ${
                      activityFilter === filter.value
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0" aria-busy={loading}>
          <div className="divide-y divide-gray-100 md:hidden">
            {users.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-500">
                No users match the current search or filter.
              </div>
            ) : (
              users.map((user) => {
                const status = getActivityStatus(user);
                return (
                  <div key={user.id} className="space-y-4 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-950" title={user.name}>
                          {user.name}
                        </p>
                        <p className="truncate text-sm text-gray-500" title={user.email || '-'}>
                          {user.email || '-'}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`shrink-0 ${status.className}`}
                      >
                        {status.label}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Created
                        </p>
                        <ActivityDate value={user.createdAt} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Logins
                        </p>
                        <p className="font-semibold tabular-nums text-gray-950">
                          {user.loginCount.toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Last Login
                        </p>
                        <ActivityDate value={user.lastLoginAt} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Last Active
                        </p>
                        <ActivityDate value={user.lastActiveAt} />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <Table className="min-w-[860px] table-fixed text-sm">
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-[17%] px-4">User</TableHead>
                  <TableHead className="w-[23%]">Email</TableHead>
                  <TableHead className="w-[12%]">Created</TableHead>
                  <TableHead className="w-[12%]">Last Login</TableHead>
                  <TableHead className="w-[12%]">Last Active</TableHead>
                  <TableHead className="w-[8%] text-right">Logins</TableHead>
                  <TableHead className="w-[16%] px-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-28 text-center text-gray-500">
                    No users match the current search or filter.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
                  const status = getActivityStatus(user);
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="px-4 font-medium text-gray-950">
                        <div className="truncate" title={user.name}>
                          {user.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-600">
                        <div className="truncate" title={user.email || '-'}>
                          {user.email || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <ActivityDate value={user.createdAt} />
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <ActivityDate value={user.lastLoginAt} />
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <ActivityDate value={user.lastActiveAt} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {user.loginCount.toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell className="px-4 whitespace-nowrap">
                        <Badge variant="outline" className={status.className}>
                          {status.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
              </TableBody>
            </Table>
          </div>
          {pagination.totalPages > 1 && (
            <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-sm text-gray-500">
                Page {pagination.page.toLocaleString('en-IN')} of{' '}
                {pagination.totalPages.toLocaleString('en-IN')}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(1, pagination.page - 1))}
                  disabled={loading || !pagination.hasPreviousPage}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage(Math.min(pagination.totalPages, pagination.page + 1))
                  }
                  disabled={loading || !pagination.hasNextPage}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

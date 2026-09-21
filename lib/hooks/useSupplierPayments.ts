'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

export interface BusinessCashView {
  currentBalance: number;
  protectedAmount: number;
  version: number;
  anchorVersion: number;
  needsReconciliation: boolean;
  lastReconciledAt?: string;
}

export interface SupplierBillView {
  id: string;
  amount: number;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  cashDiscountPercentage?: number;
  cashDiscountLastDate?: string;
  partialPaymentAllowed?: boolean;
  paidAmount: number;
  discountReceived: number;
  pendingAmount: number;
  reservedAmount: number;
  billStatus: 'unpaid' | 'partial' | 'paid';
  reservationId?: string;
  reservationStatus?: string;
  recommendedPaymentDate?: string;
  reservationExpiresAt?: string;
  recommendationReason?: string;
}

export interface SupplierPaymentView {
  id: string;
  name: string;
  totalDue: number;
  previousBalance: number;
  creditLimit: number | null;
  criticality: 'normal' | 'important' | 'business_stopping';
  partialPaymentAllowed: boolean;
  bills: SupplierBillView[];
  previousBalanceReservation?: {
    id: string;
    amount: number;
    status: string;
    recommendedPaymentDate: string;
    expiresAt: string;
    reason?: string;
  };
}

export interface PaymentRecommendation {
  targetType: 'bill' | 'previous_balance';
  supplierId: string;
  billTransactionId?: string;
  recommendedAmount: number;
  discountAmount?: number;
  paymentDate: string;
  reasonCode: string;
  explanation: string;
  balanceAfterPayment: number;
}

export interface SupplierPaymentsView {
  businessCash: BusinessCashView | null;
  summary: {
    currentBalance: number;
    protectedAmount: number;
    reservedAmount: number;
    availableAmount: number;
    dailySupplierPayments: number;
  };
  suppliers: SupplierPaymentView[];
  recommendations: PaymentRecommendation[];
  payments?: Array<{ id: string; entityId: string; date: string; amount: number; cashPaidAmount?: number; cashDiscountAmount?: number; description?: string }>;
  issues: Array<string | { message: string; supplierId?: string }>;
  version: number;
}

export async function supplierRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load supplier payments. Please try again.');
  return data;
}

export function useBusinessCash(enabled = true) {
  return useQuery<{ enabled: boolean; businessCash: BusinessCashView | null }>({
    queryKey: ['business-cash'],
    queryFn: () => supplierRequest('/api/business-cash'),
    enabled,
    staleTime: 0,
    refetchInterval: enabled ? 30_000 : false,
    retry: false,
  });
}

export function useSupplierPayments(enabled: boolean, supplierId?: string, date?: string) {
  return useQuery<SupplierPaymentsView>({
    queryKey: ['supplier-payments', supplierId ?? 'all', date ?? 'today'],
    queryFn: () => {
      const params = new URLSearchParams();
      if (supplierId) params.set('supplierId', supplierId);
      if (date) params.set('date', date);
      return supplierRequest(`/api/supplier-payments?${params}`);
    },
    enabled,
    staleTime: 0,
    refetchInterval: enabled ? 30_000 : false,
    retry: false,
  });
}

export function useRefreshSupplierPayments() {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['business-cash'] }),
    queryClient.invalidateQueries({ queryKey: ['supplier-payments'] }),
    queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  ]);
}

export function businessToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
}

export function paymentRequestFingerprint(payload: Record<string, unknown>) {
  return JSON.stringify(Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'expectedVersion')));
}

export function displayPaymentDate(value?: string) {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(value));
}

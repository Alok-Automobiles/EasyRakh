import type { Document } from 'mongodb';

export type InvoiceListSort = 'default' | 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

export interface InvoiceListFilters {
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  addedToLedger?: boolean;
  sort: InvoiceListSort;
}

export class InvoiceListQueryError extends Error {}

const DAY_MS = 24 * 60 * 60 * 1000;
const INDIA_OFFSET_MS = 330 * 60 * 1000;

function dateFilter(params: URLSearchParams, key: 'startDate' | 'endDate') {
  const value = params.get(key);
  if (value === null) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new InvoiceListQueryError(`${key} must be a valid date in YYYY-MM-DD format`);
  }
  return value;
}

function amountFilter(params: URLSearchParams, key: 'minAmount' | 'maxAmount') {
  const value = params.get(key);
  if (value === null) return undefined;
  const amount = Number(value);
  if (!/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(amount) || amount < 0) {
    throw new InvoiceListQueryError(`${key} must be a non-negative finite amount`);
  }
  return amount;
}

export function parseInvoiceListFilters(params: URLSearchParams): InvoiceListFilters {
  const startDate = dateFilter(params, 'startDate');
  const endDate = dateFilter(params, 'endDate');
  const minAmount = amountFilter(params, 'minAmount');
  const maxAmount = amountFilter(params, 'maxAmount');
  const ledgerValue = params.get('addedToLedger');
  const sort = params.get('sort') ?? 'default';

  if (startDate && endDate && startDate > endDate) {
    throw new InvoiceListQueryError('Start date cannot be after end date');
  }
  if (minAmount !== undefined && maxAmount !== undefined && minAmount > maxAmount) {
    throw new InvoiceListQueryError('Minimum amount cannot be greater than maximum amount');
  }
  if (ledgerValue !== null && ledgerValue !== 'true' && ledgerValue !== 'false') {
    throw new InvoiceListQueryError('addedToLedger must be true or false');
  }
  if (!['default', 'date-desc', 'date-asc', 'amount-desc', 'amount-asc'].includes(sort)) {
    throw new InvoiceListQueryError('Invalid invoice sort');
  }

  return {
    startDate,
    endDate,
    minAmount,
    maxAmount,
    addedToLedger: ledgerValue === null ? undefined : ledgerValue === 'true',
    sort: sort as InvoiceListSort,
  };
}

export function invoiceListFilterQuery(filters: InvoiceListFilters): Document {
  const query: Document = {};
  if (filters.startDate || filters.endDate) {
    const invoiceDate: Document = {};
    const createdAt: Document = {};
    if (filters.startDate) {
      const start = new Date(`${filters.startDate}T00:00:00.000Z`).getTime();
      invoiceDate.$gte = new Date(start);
      createdAt.$gte = new Date(start - INDIA_OFFSET_MS);
    }
    if (filters.endDate) {
      const end = new Date(`${filters.endDate}T00:00:00.000Z`).getTime() + DAY_MS;
      invoiceDate.$lt = new Date(end);
      createdAt.$lt = new Date(end - INDIA_OFFSET_MS);
    }
    // Keep the alternatives inside $and so text search can add its own $or.
    // Null equality also matches legacy invoices with no invoiceDate field.
    query.$and = [{ $or: [{ invoiceDate }, { invoiceDate: null, createdAt }] }];
  }
  if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
    query.totalAmount = {
      ...(filters.minAmount !== undefined ? { $gte: filters.minAmount } : {}),
      ...(filters.maxAmount !== undefined ? { $lte: filters.maxAmount } : {}),
    };
  }
  if (filters.addedToLedger !== undefined) {
    query.addedToLedger = filters.addedToLedger ? true : { $ne: true };
  }
  return query;
}

export function invoiceListSort(sort: InvoiceListSort): Record<string, 1 | -1> {
  if (sort === 'amount-asc' || sort === 'amount-desc') {
    return { totalAmount: sort === 'amount-asc' ? 1 : -1, _id: -1 };
  }
  if (sort === 'date-asc' || sort === 'date-desc') {
    return { _invoiceListDate: sort === 'date-asc' ? 1 : -1, _id: -1 };
  }
  return { createdAt: -1, _id: -1 };
}

export function invoiceListSortStages(sort: InvoiceListSort): Document[] {
  const stages: Document[] = [];
  if (sort === 'date-asc' || sort === 'date-desc') {
    stages.push({
      $set: {
        _invoiceListDate: {
          $ifNull: [
            { $dateToString: { date: '$invoiceDate', format: '%Y-%m-%d', timezone: 'UTC' } },
            { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } },
          ],
        },
      },
    });
  }
  return [...stages, { $sort: invoiceListSort(sort) }];
}

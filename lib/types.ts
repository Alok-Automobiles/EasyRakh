export interface User {
  _id?: string;
  email: string;
  password: string;
  name: string;
  createdAt: Date;
}

export interface Customer {
  _id?: string;
  userId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  openingBalance: number;
  balanceType: 'credit' | 'debit';
  createdAt: Date;
}

export interface Supplier {
  _id?: string;
  userId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  openingBalance: number;
  balanceType: 'credit' | 'debit';
  createdAt: Date;
}

export interface Transaction {
  _id?: string;
  userId: string;
  customerId?: string;
  supplierId?: string;
  entityType: 'customer' | 'supplier';
  entityId: string;
  type: 'credit' | 'debit';
  amount: number;
  description?: string;
  date: Date;
  createdAt: Date;
}

export interface RecentActivity {
  id: string;
  type: 'transaction' | 'customer_created' | 'supplier_created';
  entityName: string;
  description: string;
  amount?: number;
  transactionType?: 'credit' | 'debit';
  entityType?: 'customer' | 'supplier';
  date: Date;
  createdAt: Date;
}

export interface LedgerEntry {
  date: Date;
  description: string;
  credit: number;
  debit: number;
  balance: number;
}

export interface Note {
  _id?: string;
  userId: string;
  title: string;
  content?: string;
  color: string;
  isFavorite?: boolean;
  createdAt: Date;
  updatedAt: Date;
}


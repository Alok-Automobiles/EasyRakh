import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const db = await getDb();
    const customersCollection = db.collection('customers');
    const suppliersCollection = db.collection('suppliers');
    const transactionsCollection = db.collection('transactions');

    // Fetch all data in parallel
    const [customers, suppliers, transactions, recentCustomers, recentSuppliers] = await Promise.all([
      // All customers for balance calculation
      customersCollection.find({ userId }).toArray(),
      // All suppliers for balance calculation
      suppliersCollection.find({ userId }).toArray(),
      // All transactions for stats
      transactionsCollection.find({ userId }).toArray(),
      // Recent customers for activities (limit 20)
      customersCollection
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray(),
      // Recent suppliers for activities (limit 20)
      suppliersCollection
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray(),
    ]);

    // Calculate stats
    const totalCredit = transactions
      .filter((t) => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalDebit = transactions
      .filter((t) => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);

    // Calculate net balance from customers' and suppliers' opening balances
    let netBalance = 0;
    for (const customer of customers) {
      if (customer.balanceType === 'credit') {
        netBalance -= customer.openingBalance;
      } else {
        netBalance += customer.openingBalance;
      }
    }
    for (const supplier of suppliers) {
      if (supplier.balanceType === 'credit') {
        netBalance -= supplier.openingBalance;
      } else {
        netBalance += supplier.openingBalance;
      }
    }

    // Add transactions to balance
    const customerTransactions = transactions.filter((t) => t.entityType === 'customer');
    const supplierTransactions = transactions.filter((t) => t.entityType === 'supplier');

    // Customer transactions: Credit subtracts, Debit adds
    for (const transaction of customerTransactions) {
      if (transaction.type === 'credit') {
        netBalance -= transaction.amount;
      } else {
        netBalance += transaction.amount;
      }
    }

    // Supplier transactions: Credit subtracts, Debit adds
    for (const transaction of supplierTransactions) {
      if (transaction.type === 'credit') {
        netBalance -= transaction.amount;
      } else {
        netBalance += transaction.amount;
      }
    }

    // Build activities from recent data
    const activities: any[] = [];

    // Add customer creation activities
    recentCustomers.forEach((customer) => {
      activities.push({
        id: `customer_${customer._id.toString()}`,
        type: 'customer_created',
        entityName: customer.name,
        description: `Customer "${customer.name}" was created`,
        date: customer.createdAt,
        createdAt: customer.createdAt,
      });
    });

    // Add supplier creation activities
    recentSuppliers.forEach((supplier) => {
      activities.push({
        id: `supplier_${supplier._id.toString()}`,
        type: 'supplier_created',
        entityName: supplier.name,
        description: `Supplier "${supplier.name}" was created`,
        date: supplier.createdAt,
        createdAt: supplier.createdAt,
      });
    });

    // Add transaction activities - use recent customers/suppliers for entity names
    const recentTransactions = transactions
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);

    // Create lookup maps for efficient entity name resolution
    const customerMap = new Map(
      recentCustomers.map((c) => [c._id.toString(), c.name])
    );
    const supplierMap = new Map(
      recentSuppliers.map((s) => [s._id.toString(), s.name])
    );

    // If entity not in recent list, fetch it individually (only for transactions)
    for (const transaction of recentTransactions) {
      const entityId = transaction.entityId || transaction.customerId || transaction.supplierId || '';
      const entityType = transaction.entityType || (transaction.customerId ? 'customer' : 'supplier');
      
      let entityName = '';
      if (entityType === 'customer') {
        entityName = customerMap.get(entityId) || 
          customers.find((c) => c._id.toString() === entityId)?.name || 
          'Unknown Customer';
      } else {
        entityName = supplierMap.get(entityId) || 
          suppliers.find((s) => s._id.toString() === entityId)?.name || 
          'Unknown Supplier';
      }
      
      activities.push({
        id: transaction._id.toString(),
        type: 'transaction',
        entityName: entityName,
        description: transaction.description || `Transaction of ₹${transaction.amount}`,
        amount: transaction.amount,
        transactionType: transaction.type,
        entityType: entityType,
        date: transaction.date,
        createdAt: transaction.createdAt,
      });
    }

    // Sort all activities by createdAt descending
    activities.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    // Return top 20 activities
    const topActivities = activities.slice(0, 20);

    return NextResponse.json({
      stats: {
        totalCredit,
        totalDebit,
        netBalance,
        totalCustomers: customers.length,
        totalSuppliers: suppliers.length,
        totalTransactions: transactions.length,
      },
      activities: topActivities,
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


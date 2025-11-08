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

    // Fetch recent customers, suppliers, and transactions
    const [customers, suppliers, transactions] = await Promise.all([
      customersCollection
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray(),
      suppliersCollection
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray(),
      transactionsCollection
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray(),
    ]);

    // Combine all activities
    const activities: any[] = [];

    // Add customer creation activities
    customers.forEach((customer) => {
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
    suppliers.forEach((supplier) => {
      activities.push({
        id: `supplier_${supplier._id.toString()}`,
        type: 'supplier_created',
        entityName: supplier.name,
        description: `Supplier "${supplier.name}" was created`,
        date: supplier.createdAt,
        createdAt: supplier.createdAt,
      });
    });

    // Add transaction activities - need to get entity names
    const allCustomers = await customersCollection.find({ userId }).toArray();
    const allSuppliers = await suppliersCollection.find({ userId }).toArray();
    
    transactions.forEach((transaction) => {
      const entityId = transaction.entityId || transaction.customerId || transaction.supplierId || '';
      const entityType = transaction.entityType || (transaction.customerId ? 'customer' : 'supplier');
      
      let entityName = '';
      if (entityType === 'customer') {
        const entity = allCustomers.find((c: any) => c._id.toString() === entityId);
        entityName = entity?.name || 'Unknown Customer';
      } else {
        const entity = allSuppliers.find((s: any) => s._id.toString() === entityId);
        entityName = entity?.name || 'Unknown Supplier';
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
    });

    // Sort by createdAt descending
    activities.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    // Return top 20
    return NextResponse.json({
      activities: activities.slice(0, 20),
    });
  } catch (error) {
    console.error('Get activities error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


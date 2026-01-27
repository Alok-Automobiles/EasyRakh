import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';
import { ObjectId } from 'mongodb';

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
    const customEntitiesCollection = db.collection('customEntities');
    const transactionsCollection = db.collection('transactions');

    const [recentCustomers, recentSuppliers, recentTransactions] = await Promise.all([
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

    const activities: any[] = [];

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

    const customerMap = new Map(
      recentCustomers.map((c) => [c._id.toString(), c.name])
    );
    const supplierMap = new Map(
      recentSuppliers.map((s) => [s._id.toString(), s.name])
    );

    const missingCustomerIds = new Set<string>();
    const missingSupplierIds = new Set<string>();
    const customEntityIds = new Set<string>();
    const customEntityTypeMap = new Map<string, string>(); // entityId -> collectionType

    recentTransactions.forEach((transaction) => {
      const entityId = transaction.entityId || transaction.customerId || transaction.supplierId || '';
      const entityType = transaction.entityType || (transaction.customerId ? 'customer' : 'supplier');
      
      if (entityType === 'customer' && !customerMap.has(entityId)) {
        missingCustomerIds.add(entityId);
      } else if (entityType === 'supplier' && !supplierMap.has(entityId)) {
        missingSupplierIds.add(entityId);
      } else if (entityType && entityType !== 'customer' && entityType !== 'supplier') {
        if (entityId) {
          customEntityIds.add(entityId);
          customEntityTypeMap.set(entityId, entityType);
        }
      }
    });

    const [missingCustomers, missingSuppliers, customEntities] = await Promise.all([
      missingCustomerIds.size > 0
        ? customersCollection
            .find({ userId, _id: { $in: Array.from(missingCustomerIds).map((id) => new ObjectId(id)) } })
            .toArray()
        : Promise.resolve([]),
      missingSupplierIds.size > 0
        ? suppliersCollection
            .find({ userId, _id: { $in: Array.from(missingSupplierIds).map((id) => new ObjectId(id)) } })
            .toArray()
        : Promise.resolve([]),
      customEntityIds.size > 0
        ? customEntitiesCollection
            .find({ userId, _id: { $in: Array.from(customEntityIds).map((id) => new ObjectId(id)) } })
            .toArray()
        : Promise.resolve([]),
    ]);

    missingCustomers.forEach((customer) => {
      customerMap.set(customer._id.toString(), customer.name);
    });
    missingSuppliers.forEach((supplier) => {
      supplierMap.set(supplier._id.toString(), supplier.name);
    });

    const customEntityMap = new Map(
      customEntities.map((e) => [e._id.toString(), e.name])
    );

    recentTransactions.forEach((transaction) => {
      const entityId = transaction.entityId || transaction.customerId || transaction.supplierId || '';
      const entityType = transaction.entityType || (transaction.customerId ? 'customer' : 'supplier');
      
      let entityName = '';
      if (entityType === 'customer') {
        entityName = customerMap.get(entityId) || 'Unknown Customer';
      } else if (entityType === 'supplier') {
        entityName = supplierMap.get(entityId) || 'Unknown Supplier';
      } else {
        entityName = customEntityMap.get(entityId) || 'Unknown Entity';
      }
      
      activities.push({
        id: transaction._id.toString(),
        type: 'transaction',
        entityName: entityName,
        description: transaction.description || `Transaction of ₹${transaction.amount}`,
        amount: transaction.amount,
        transactionType: transaction.type,
        entityType: entityType,
        entityId: entityId,
        date: transaction.date,
        createdAt: transaction.createdAt,
      });
    });

    activities.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

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


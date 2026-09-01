import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getUserIdFromRequest } from "@/lib/auth";
import { z } from "zod";
import type { Document } from 'mongodb';
import { bumpCacheVersions, getCachedJson, requestCacheKey, setCachedJson } from "@/lib/cache-version";
import { entitySearchFields } from "@/lib/search-normalization";
import { ensureUserReadModels, refreshUserReadModels, type EntityBalance } from "@/lib/read-models";
import {
  buildEntitySearchStage,
  searchScoreStages,
  withMongoSearchFallback,
} from '@/lib/mongodb-search';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePositiveInteger(value: string | null, fallback: number, max = Number.POSITIVE_INFINITY) {
  const parsed = Number(value);
  if (!value || !Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function serializeCustomer(customer: Document, balance?: EntityBalance) {
  const id = customer._id.toString();
  const openingBalance = Number(customer.openingBalance || 0);
  const signedOpening = customer.balanceType === 'credit' ? -openingBalance : openingBalance;

  return {
    id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    openingBalance,
    balanceType: customer.balanceType,
    createdAt: customer.createdAt,
    totalBalance: balance?.totalBalance ?? signedOpening,
  };
}

const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  address: z.string().optional(),
  openingBalance: z.number().default(0),
  balanceType: z.enum(["credit", "debit"]).default("debit"),
  openingBalanceDescription: z.string().optional(),
  openingBalanceBillUrl: z.union([z.string().url("Invalid bill URL"), z.literal("")]).optional(),
  openingBalanceBillPublicId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search')?.trim().slice(0, 100) || '';
    const paginationRequested = searchParams.has('page') || searchParams.has('limit');
    const page = parsePositiveInteger(searchParams.get('page'), 1);
    const limit = parsePositiveInteger(searchParams.get('limit'), 20, 100);
    const skip = (page - 1) * limit;
    const cacheSuffix = paginationRequested
      ? `directory:${search.toLowerCase()}:page:${page}:limit:${limit}`
      : search.toLowerCase();
    const cacheKey = await requestCacheKey(request, 'customers', userId, cacheSuffix);
    const cachedCustomers = await getCachedJson<Record<string, unknown>>(cacheKey);
    if (cachedCustomers) {
      return NextResponse.json(cachedCustomers, { status: 200 });
    }

    const db = await getDb();
    const customersCollection = db.collection("customers");
    const entityBalancesCollection = db.collection<EntityBalance>('entityBalances');
    await ensureUserReadModels(db, userId);

    if (paginationRequested) {
      const directoryFilter = { userId };
      const directoryTotalPromise = customersCollection.countDocuments(directoryFilter);
      const balanceSummaryPromise = entityBalancesCollection
        .aggregate<{ receivable: number; payable: number }>([
          { $match: { userId, entityType: 'customer' } },
          {
            $group: {
              _id: null,
              receivable: {
                $sum: {
                  $cond: [{ $gt: ['$totalBalance', 0] }, '$totalBalance', 0],
                },
              },
              payable: {
                $sum: {
                  $cond: [{ $lt: ['$totalBalance', 0] }, { $abs: '$totalBalance' }, 0],
                },
              },
            },
          },
          { $project: { _id: 0, receivable: 1, payable: 1 } },
        ])
        .toArray();

      const runRegexQuery = async () => {
        const regex = { $regex: escapeRegex(search), $options: 'i' };
        const filter = {
          userId,
          $or: [{ name: regex }, { phone: regex }, { email: regex }, { address: regex }],
        };
        const [total, customers] = await Promise.all([
          customersCollection.countDocuments(filter),
          customersCollection
            .find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
        ]);
        return { total, customers };
      };

      const directoryPagePromise = search
        ? search.length >= 2
          ? withMongoSearchFallback(
              'customer directory',
              async () => {
                const [result] = await customersCollection
                  .aggregate<{ customers: Document[]; total: Array<{ count: number }> }>([
                    buildEntitySearchStage(userId, search),
                    ...searchScoreStages(),
                    { $sort: { _searchScore: -1, updatedAt: -1, createdAt: -1, _id: -1 } },
                    {
                      $facet: {
                        customers: [{ $skip: skip }, { $limit: limit }],
                        total: [{ $count: 'count' }],
                      },
                    },
                  ])
                  .toArray();
                return {
                  total: result?.total[0]?.count || 0,
                  customers: result?.customers || [],
                };
              },
              runRegexQuery,
              'customers'
            )
          : runRegexQuery()
        : Promise.all([
            directoryTotalPromise,
            customersCollection
              .find(directoryFilter)
              .sort({ createdAt: -1, _id: -1 })
              .skip(skip)
              .limit(limit)
              .toArray(),
          ]).then(([total, customers]) => ({ total, customers }));

      const [{ total, customers }, directoryTotal, balanceSummaryRows] = await Promise.all([
        directoryPagePromise,
        directoryTotalPromise,
        balanceSummaryPromise,
      ]);
      const customerIds = customers.map((customer) => customer._id.toString());
      const balances = customerIds.length > 0
        ? await entityBalancesCollection
            .find({ userId, entityType: 'customer', entityId: { $in: customerIds } })
            .toArray()
        : [];
      const balanceMap = new Map(balances.map((balance) => [balance.entityId, balance]));
      const balanceSummary = balanceSummaryRows[0] || { receivable: 0, payable: 0 };
      const responseData = {
        customers: customers.map((customer) =>
          serializeCustomer(customer, balanceMap.get(customer._id.toString()))
        ),
        pagination: {
          total,
          page,
          pageSize: limit,
          totalPages: Math.max(Math.ceil(total / limit), 1),
        },
        summary: {
          total: directoryTotal,
          receivable: balanceSummary.receivable || 0,
          payable: balanceSummary.payable || 0,
        },
      };

      await setCachedJson(cacheKey, 600, responseData);
      return NextResponse.json(responseData, { status: 200 });
    }

    const customersPromise = search.length >= 2
      ? withMongoSearchFallback(
          'customer directory',
          () => customersCollection
            .aggregate([
              buildEntitySearchStage(userId, search),
              ...searchScoreStages(),
              { $limit: 100 },
            ])
            .toArray(),
          () => {
            const regex = { $regex: escapeRegex(search), $options: 'i' };
            return customersCollection
              .find({ userId, $or: [{ name: regex }, { phone: regex }, { email: regex }, { address: regex }] })
              .sort({ createdAt: -1, _id: -1 })
              .limit(100)
              .toArray();
          },
          'customers'
        )
      : customersCollection.find({ userId }).sort({ createdAt: -1, _id: -1 }).toArray();

    const [customers, balances] = await Promise.all([
      customersPromise,
      entityBalancesCollection.find({ userId, entityType: 'customer' }).toArray(),
    ]);

    const balanceMap = new Map(balances.map((balance) => [balance.entityId, balance]));
    const customersWithBalance = customers.map((customer) =>
      serializeCustomer(customer, balanceMap.get(customer._id.toString()))
    );

    const responseData = { customers: customersWithBalance };

    await setCachedJson(cacheKey, 600, responseData);

    return NextResponse.json(responseData, { status: 200 });
  } catch (error) {
    console.error("Get customers error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = customerSchema.parse(body);

    const db = await getDb();
    const customersCollection = db.collection("customers");

    const result = await customersCollection.insertOne({
      userId,
      name: validatedData.name,
      phone: validatedData.phone || "",
      email: validatedData.email || "",
      address: validatedData.address || "",
      openingBalance: validatedData.openingBalance,
      balanceType: validatedData.balanceType,
      openingBalanceDescription: validatedData.openingBalanceDescription || "",
      openingBalanceBillUrl: validatedData.openingBalanceBillUrl || "",
      openingBalanceBillPublicId: validatedData.openingBalanceBillPublicId || "",
      ...entitySearchFields(validatedData),
      createdAt: new Date(),
    });

    await Promise.all([
      refreshUserReadModels(db, userId),
      bumpCacheVersions(userId, ['customers', 'dashboard', 'bootstrap', 'search']),
    ]);

    return NextResponse.json(
      {
        message: "Customer created successfully",
        customer: {
          id: result.insertedId.toString(),
          ...validatedData,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error("Create customer error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

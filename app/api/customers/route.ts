import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getUserIdFromRequest } from "@/lib/auth";
import { z } from "zod";
import redis from "@/lib/redis";

const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  address: z.string().optional(),
  openingBalance: z.number().default(0),
  balanceType: z.enum(["credit", "debit"]).default("debit"),
});

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    try {
      const cachedCustomers = await redis.get(`customers:${userId}`);
      if (cachedCustomers) {
        return NextResponse.json(JSON.parse(cachedCustomers), { status: 200 });
      }
    } catch (cacheError) {
      console.warn('Redis cache read failed, falling back to DB:', cacheError);
    }

    const db = await getDb();
    const customersCollection = db.collection("customers");

    const customersWithBalance = await customersCollection.aggregate([
      { $match: { userId } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'transactions',
          let: { customerId: { $toString: '$_id' } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$entityId', '$$customerId'] },
                    { $eq: ['$entityType', 'customer'] },
                    { $eq: ['$userId', userId] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalCredit: {
                  $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] },
                },
                totalDebit: {
                  $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] },
                },
              },
            },
          ],
          as: 'txSummary',
        },
      },
      { $unwind: { path: '$txSummary', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          id: { $toString: '$_id' },
          name: 1,
          phone: 1,
          email: 1,
          address: 1,
          openingBalance: 1,
          balanceType: 1,
          createdAt: 1,
          totalBalance: {
            $add: [
              {
                $cond: [
                  { $eq: ['$balanceType', 'credit'] },
                  { $multiply: ['$openingBalance', -1] },
                  '$openingBalance',
                ],
              },
              { $ifNull: ['$txSummary.totalDebit', 0] },
              { $multiply: [{ $ifNull: ['$txSummary.totalCredit', 0] }, -1] },
            ],
          },
        },
      },
    ]).toArray();

    const responseData = { customers: customersWithBalance };

    try {
      await redis.setex(`customers:${userId}`, 600, JSON.stringify(responseData));
    } catch (cacheError) {
      console.warn('Redis cache write failed:', cacheError);
    }

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
      createdAt: new Date(),
    });

    redis.del(`customers:${userId}`, `dashboard:stats:${userId}`).catch((err) => {
      console.warn('Redis cache invalidation failed:', err);
    });

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
        { error: error.errors[0].message },
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

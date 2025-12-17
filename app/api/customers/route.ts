import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getUserIdFromRequest } from "@/lib/auth";
import { z } from "zod";
import { ObjectId } from "mongodb";
import redis from "@/lib/redis";
import { Customer } from "@/lib/types";

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
    
    // Try to get from cache
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
    const transactionsCollection = db.collection("transactions");

    const customers = await customersCollection
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    // Calculate total balance for each customer
    const customersWithBalance = await Promise.all(
      customers.map(async (customer) => {
        const customerId = customer._id.toString();
        
        // Get all transactions for this customer
        const transactions = await transactionsCollection
          .find({
            entityId: customerId,
            entityType: 'customer',
            userId,
          })
          .toArray();

        // Calculate totals
        const totalCredit = transactions
          .filter((t) => t.type === 'credit')
          .reduce((sum, t) => sum + t.amount, 0);
        const totalDebit = transactions
          .filter((t) => t.type === 'debit')
          .reduce((sum, t) => sum + t.amount, 0);

        // Calculate final balance
        let totalBalance = customer.openingBalance;
        if (customer.balanceType === 'credit') {
          totalBalance = -totalBalance;
        }
        totalBalance = totalBalance - totalCredit + totalDebit;

        return {
          id: customerId,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          address: customer.address,
          openingBalance: customer.openingBalance,
          balanceType: customer.balanceType,
          totalBalance,
          createdAt: customer.createdAt,
        };
      })
    );

    const responseData = { customers: customersWithBalance };

    // Cache the response
    try {
      await redis.setex(`customers:${userId}`, 300, JSON.stringify(responseData));
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

    // Invalidate related caches
    try {
      await redis.del(`customers:${userId}`, `dashboard:stats:${userId}`);
    } catch (cacheError) {
      console.warn("Redis cache invalidation failed:", cacheError);
    }

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

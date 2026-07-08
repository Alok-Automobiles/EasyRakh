import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getUserIdFromRequest } from "@/lib/auth";
import { z } from "zod";
import { bumpCacheVersions, getCachedJson, setCachedJson, versionedCacheKey } from "@/lib/cache-version";
import { entitySearchTokens } from "@/lib/search-normalization";
import { ensureUserReadModels, refreshUserReadModels, type EntityBalance } from "@/lib/read-models";

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
    
    const cacheKey = await versionedCacheKey('customers', userId);
    const cachedCustomers = await getCachedJson<{ customers: unknown[] }>(cacheKey);
    if (cachedCustomers) {
      return NextResponse.json(cachedCustomers, { status: 200 });
    }

    const db = await getDb();
    const customersCollection = db.collection("customers");
    const entityBalancesCollection = db.collection<EntityBalance>('entityBalances');
    await ensureUserReadModels(db, userId);

    const [customers, balances] = await Promise.all([
      customersCollection.find({ userId }).sort({ createdAt: -1 }).toArray(),
      entityBalancesCollection.find({ userId, entityType: 'customer' }).toArray(),
    ]);

    const balanceMap = new Map(balances.map((balance) => [balance.entityId, balance]));
    const customersWithBalance = customers.map((customer) => {
      const id = customer._id.toString();
      const balance = balanceMap.get(id);
      const openingBalance = customer.openingBalance || 0;
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
    });

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
      searchTokens: entitySearchTokens(validatedData),
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

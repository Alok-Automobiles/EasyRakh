import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getUserIdFromRequest } from '@/lib/auth';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Detect if the query is in Hindi
const isHindiQuery = (text: string): boolean => {
  const hindiRegex = /[\u0900-\u097F]/;
  return hindiRegex.test(text);
};

// Direct API call to Gemini using fetch
async function callGeminiAPI(prompt: string): Promise<string> {
  // Try multiple models - gemini-2.5-flash-lite has more generous limits
  const models = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
  let lastError: Error | null = null;
  
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 512,
          }
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          console.log(`✅ Success with ${model}`);
          return text;
        }
      }
      
      const errorData = await response.json().catch(() => ({}));
      console.log(`❌ ${model} failed:`, response.status, errorData.error?.message);
      
      // Handle rate limit - try next model
      if (response.status === 429) {
        lastError = new Error(errorData.error?.message || 'Rate limited');
        continue; // Try next model
      }
      
      lastError = new Error(errorData.error?.message || 'Gemini API error');
    } catch (err) {
      console.log(`❌ ${model} error:`, err);
      lastError = err as Error;
    }
  }
  
  // All models failed
  if (lastError?.message?.includes('429') || lastError?.message?.includes('quota')) {
    throw new Error('RATE_LIMIT:Please wait 1 minute before trying again. Free tier: 20 requests/minute.');
  }
  
  throw lastError || new Error('All models failed');
}

// Helper function to get customer ledger
async function getCustomerLedger(userId: string, customerName: string) {
  const db = await getDb();
  const customersCollection = db.collection('customers');
  const transactionsCollection = db.collection('transactions');

  const customer = await customersCollection.findOne({
    userId,
    name: { $regex: customerName, $options: 'i' },
  });

  if (!customer) {
    return { success: false, message: `Customer "${customerName}" not found` };
  }

  const allTransactions = await transactionsCollection
    .find({ userId, entityId: customer._id.toString(), entityType: 'customer' })
    .toArray();

  const totalCredit = allTransactions
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalDebit = allTransactions
    .filter((t) => t.type === 'debit')
    .reduce((sum, t) => sum + t.amount, 0);

  let balance = customer.openingBalance;
  if (customer.balanceType === 'credit') {
    balance = -balance;
  }
  balance = balance - totalCredit + totalDebit;

  const recentTransactions = await transactionsCollection
    .find({ userId, entityId: customer._id.toString(), entityType: 'customer' })
    .sort({ date: -1 })
    .limit(5)
    .toArray();

  return {
    success: true,
    customer: {
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
    },
    totals: {
      totalCredit,
      totalDebit,
      currentBalance: balance,
      balanceStatus: balance >= 0 ? 'receivable (lena hai)' : 'payable (dena hai)',
    },
    recentTransactions: recentTransactions.map((t) => ({
      type: t.type,
      amount: t.amount,
      description: t.description,
      date: t.date,
    })),
  };
}

// Helper function to get supplier ledger
async function getSupplierLedger(userId: string, supplierName: string) {
  const db = await getDb();
  const suppliersCollection = db.collection('suppliers');
  const transactionsCollection = db.collection('transactions');

  const supplier = await suppliersCollection.findOne({
    userId,
    name: { $regex: supplierName, $options: 'i' },
  });

  if (!supplier) {
    return { success: false, message: `Supplier "${supplierName}" not found` };
  }

  const allTransactions = await transactionsCollection
    .find({ userId, entityId: supplier._id.toString(), entityType: 'supplier' })
    .toArray();

  const totalCredit = allTransactions
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalDebit = allTransactions
    .filter((t) => t.type === 'debit')
    .reduce((sum, t) => sum + t.amount, 0);

  let balance = supplier.openingBalance;
  if (supplier.balanceType === 'credit') {
    balance = -balance;
  }
  balance = balance - totalCredit + totalDebit;

  return {
    success: true,
    supplier: {
      name: supplier.name,
      phone: supplier.phone,
      address: supplier.address,
    },
    totals: {
      totalCredit,
      totalDebit,
      currentBalance: balance,
      balanceStatus: balance >= 0 ? 'receivable (lena hai)' : 'payable (dena hai)',
    },
  };
}

// Helper function to get all customers
async function getAllCustomers(userId: string) {
  const db = await getDb();
  const customersCollection = db.collection('customers');
  const transactionsCollection = db.collection('transactions');

  const customers = await customersCollection.find({ userId }).toArray();

  const customerSummaries = await Promise.all(
    customers.slice(0, 10).map(async (customer) => {
      const transactions = await transactionsCollection
        .find({ userId, entityId: customer._id.toString(), entityType: 'customer' })
        .toArray();

      const totalCredit = transactions
        .filter((t) => t.type === 'credit')
        .reduce((sum, t) => sum + t.amount, 0);
      const totalDebit = transactions
        .filter((t) => t.type === 'debit')
        .reduce((sum, t) => sum + t.amount, 0);

      let balance = customer.openingBalance;
      if (customer.balanceType === 'credit') {
        balance = -balance;
      }
      balance = balance - totalCredit + totalDebit;

      return {
        name: customer.name,
        balance,
        balanceStatus: balance >= 0 ? 'receivable' : 'payable',
      };
    })
  );

  return {
    success: true,
    totalCustomers: customers.length,
    customers: customerSummaries,
  };
}

// Helper function to get all suppliers
async function getAllSuppliers(userId: string) {
  const db = await getDb();
  const suppliersCollection = db.collection('suppliers');
  const transactionsCollection = db.collection('transactions');

  const suppliers = await suppliersCollection.find({ userId }).toArray();

  const supplierSummaries = await Promise.all(
    suppliers.slice(0, 10).map(async (supplier) => {
      const transactions = await transactionsCollection
        .find({ userId, entityId: supplier._id.toString(), entityType: 'supplier' })
        .toArray();

      const totalCredit = transactions
        .filter((t) => t.type === 'credit')
        .reduce((sum, t) => sum + t.amount, 0);
      const totalDebit = transactions
        .filter((t) => t.type === 'debit')
        .reduce((sum, t) => sum + t.amount, 0);

      let balance = supplier.openingBalance;
      if (supplier.balanceType === 'credit') {
        balance = -balance;
      }
      balance = balance - totalCredit + totalDebit;

      return {
        name: supplier.name,
        balance,
        balanceStatus: balance >= 0 ? 'receivable' : 'payable',
      };
    })
  );

  return {
    success: true,
    totalSuppliers: suppliers.length,
    suppliers: supplierSummaries,
  };
}

// Helper function to get dashboard summary
async function getDashboardSummary(userId: string) {
  const db = await getDb();
  const customersCollection = db.collection('customers');
  const suppliersCollection = db.collection('suppliers');
  const transactionsCollection = db.collection('transactions');

  const [customersCount, suppliersCount, transactions] = await Promise.all([
    customersCollection.countDocuments({ userId }),
    suppliersCollection.countDocuments({ userId }),
    transactionsCollection.find({ userId }).toArray(),
  ]);

  const totalCredit = transactions
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalDebit = transactions
    .filter((t) => t.type === 'debit')
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    success: true,
    summary: {
      totalCustomers: customersCount,
      totalSuppliers: suppliersCount,
      totalTransactions: transactions.length,
      totalCredit,
      totalDebit,
      netBalance: totalDebit - totalCredit,
    },
  };
}

// Helper function to get today's cash
async function getTodayCash(userId: string) {
  const db = await getDb();
  const dailyCashCollection = db.collection('dailyCashRecords');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayRecords = await dailyCashCollection
    .find({
      userId,
      date: { $gte: today, $lt: tomorrow },
    })
    .toArray();

  const totalIn = todayRecords
    .filter((r) => r.type === 'in')
    .reduce((sum, r) => sum + r.amount, 0);
  const totalOut = todayRecords
    .filter((r) => r.type === 'out')
    .reduce((sum, r) => sum + r.amount, 0);

  return {
    success: true,
    todayCash: {
      cashIn: totalIn,
      cashOut: totalOut,
      balance: totalIn - totalOut,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    const isHindi = isHindiQuery(query);

    // Get all data context first
    const [dashboardData, customersData, suppliersData, todayCashData] = await Promise.all([
      getDashboardSummary(userId),
      getAllCustomers(userId),
      getAllSuppliers(userId),
      getTodayCash(userId),
    ]);

    // Check if query mentions a specific person name
    const queryLower = query.toLowerCase();
    let specificData = null;

    // Extract potential name from query
    const namePatterns = [
      /(?:का\s*खाता|ki\s*khata|ka\s*khata|का\s*बैलेंस|balance\s*of|ledger\s*of|khata\s*of)\s*[:\s]*([^\s?।]+)/i,
      /([^\s]+)\s*(?:का\s*खाता|ki\s*khata|ka\s*khata|का\s*बैलेंस)/i,
      /(?:what(?:'s|s|\s+is)?|show|tell|bata|batao)\s*(?:me\s+)?([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)\s*(?:'s|ka|ki|का|की)?\s*(?:balance|khata|ledger|खाता|बैलेंस)/i,
      /([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)\s*(?:ka|ki|का|की)\s*(?:khata|ledger|खाता|balance|बैलेंस)/i,
    ];

    let extractedName = null;
    for (const pattern of namePatterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        extractedName = match[1].trim();
        break;
      }
    }

    // If a name was found, try to get their ledger
    if (extractedName) {
      // Try customer first
      const customerLedger = await getCustomerLedger(userId, extractedName);
      if (customerLedger.success) {
        specificData = { type: 'customer_ledger', data: customerLedger };
      } else {
        // Try supplier
        const supplierLedger = await getSupplierLedger(userId, extractedName);
        if (supplierLedger.success) {
          specificData = { type: 'supplier_ledger', data: supplierLedger };
        }
      }
    }

    // Check for supplier-specific queries
    if (!specificData && (queryLower.includes('supplier') || queryLower.includes('सप्लायर') || queryLower.includes('vikreta'))) {
      const supplierMatch = query.match(/(?:supplier|सप्लायर|vikreta)\s+([^\s?।]+)/i);
      if (supplierMatch && supplierMatch[1]) {
        const supplierLedger = await getSupplierLedger(userId, supplierMatch[1]);
        if (supplierLedger.success) {
          specificData = { type: 'supplier_ledger', data: supplierLedger };
        }
      }
    }

    // Build context for Gemini
    const businessContext = `
Business Data Summary:
- Total Customers: ${customersData.totalCustomers}
- Total Suppliers: ${suppliersData.totalSuppliers}
- Total Transactions: ${dashboardData.summary?.totalTransactions || 0}
- Total Credit: ₹${dashboardData.summary?.totalCredit?.toLocaleString('en-IN') || 0}
- Total Debit: ₹${dashboardData.summary?.totalDebit?.toLocaleString('en-IN') || 0}
- Net Balance: ₹${dashboardData.summary?.netBalance?.toLocaleString('en-IN') || 0}

Today's Cash:
- Cash In: ₹${todayCashData.todayCash?.cashIn?.toLocaleString('en-IN') || 0}
- Cash Out: ₹${todayCashData.todayCash?.cashOut?.toLocaleString('en-IN') || 0}
- Balance: ₹${todayCashData.todayCash?.balance?.toLocaleString('en-IN') || 0}

Top Customers:
${customersData.customers?.slice(0, 5).map((c: { name: string; balance: number; balanceStatus: string }) => 
  `- ${c.name}: ₹${Math.abs(c.balance).toLocaleString('en-IN')} (${c.balanceStatus})`
).join('\n') || 'No customers'}

Top Suppliers:
${suppliersData.suppliers?.slice(0, 5).map((s: { name: string; balance: number; balanceStatus: string }) => 
  `- ${s.name}: ₹${Math.abs(s.balance).toLocaleString('en-IN')} (${s.balanceStatus})`
).join('\n') || 'No suppliers'}

${specificData ? `
Specific Query Result:
${JSON.stringify(specificData.data, null, 2)}
` : ''}
`;

    const languageInstruction = isHindi
      ? 'The user is asking in Hindi. You MUST respond in Hindi (Devanagari script). Use natural conversational Hindi.'
      : 'The user is asking in English. Respond in clear, conversational English.';

    const systemPrompt = `You are a helpful voice assistant for a ledger/khata management system for an automobile business.
You help users query their business data including customer ledgers, supplier ledgers, transactions, and cash flow.

${languageInstruction}

Important terms:
- "khata" / "खाता" = ledger/account
- "dena hai" / "देना है" = payable (you owe them)
- "lena hai" / "लेना है" = receivable (they owe you)
- "grahak" / "ग्राहक" = customer
- "vikreta" / "विक्रेता" / "supplier" = supplier
- Positive balance = receivable (customer owes you money)
- Negative balance = payable (you owe customer money)

Rules:
1. Be concise - this is for voice output
2. Format currency amounts clearly (e.g., "ten thousand rupees" or "दस हज़ार रुपये")
3. If asked about a specific person, use the Specific Query Result data
4. Always mention whether amount is receivable or payable
5. Keep response under 3-4 sentences for simple queries

Here is the current business data:
${businessContext}

User Query: ${query}

Provide a helpful, conversational response:`;

    // Call Gemini API directly
    const responseText = await callGeminiAPI(systemPrompt);

    return NextResponse.json({
      success: true,
      response: responseText,
      language: isHindi ? 'hi' : 'en',
      data: specificData?.data || dashboardData,
    });
  } catch (error) {
    console.error('Voice assistant error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Handle rate limit with a friendly message
    if (errorMessage.startsWith('RATE_LIMIT:')) {
      return NextResponse.json(
        { 
          error: errorMessage.replace('RATE_LIMIT:', ''),
          isRateLimit: true 
        },
        { status: 429 }
      );
    }
    
    return NextResponse.json(
      { error: `AI service error: ${errorMessage}` },
      { status: 503 }
    );
  }
}

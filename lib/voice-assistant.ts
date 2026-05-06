import { SchemaType } from '@google/generative-ai';
import type { FunctionDeclarationsTool } from '@google/generative-ai';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { AssistantHindiScript, AssistantLanguage } from '@/lib/assistant-language';
import { getDb } from '@/lib/mongodb';

const INDIA_TIMEZONE = 'Asia/Kolkata';
const DEFAULT_TOOL_LIMIT = 6;
const MAX_TOOL_LIMIT = 10;

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine((value) => {
    const [yStr, mStr, dStr] = value.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, 'Date must be a valid calendar date');

const findEntitiesArgsSchema = z.object({
  nameQuery: z.string().trim().min(1, 'nameQuery is required'),
  entityTypeHint: z.string().trim().optional(),
  limit: z.number().int().min(1).max(MAX_TOOL_LIMIT).optional(),
});

const getEntityLedgerArgsSchema = z.object({
  entityType: z.string().trim().min(1, 'entityType is required'),
  entityId: z.string().trim().min(1, 'entityId is required'),
  limit: z.number().int().min(1).max(20).optional(),
});

const getCashRecordArgsSchema = z.object({
  date: isoDateSchema,
});

const prepareCashEntryArgsSchema = z.object({
  amount: z.number().positive('amount must be positive'),
  type: z.enum(['in', 'out']),
  description: z.string().trim().min(1, 'description is required'),
  date: isoDateSchema,
});

const prepareLedgerTransactionArgsSchema = z.object({
  entityType: z.string().trim().min(1, 'entityType is required'),
  entityId: z.string().trim().min(1, 'entityId is required'),
  type: z.enum(['credit', 'debit']),
  amount: z.number().positive('amount must be positive'),
  description: z.string().trim().optional(),
  date: isoDateSchema,
});

export type AssistantPendingAction =
  | {
      kind: 'cash_entry';
      requiresBillConfirmation: true;
      draft: {
        amount: number;
        type: 'in' | 'out';
        description: string;
        date: string;
      };
      summary: string;
      language: AssistantLanguage;
      script?: AssistantHindiScript;
    }
  | {
      kind: 'ledger_transaction';
      requiresBillConfirmation: true;
      draft: {
        entityType: string;
        entityId: string;
        entityName: string;
        entityLabel: string;
        type: 'credit' | 'debit';
        amount: number;
        description: string;
        date: string;
      };
      summary: string;
      language: AssistantLanguage;
      script?: AssistantHindiScript;
    };

type AssistantToolContext = {
  userId: string;
  language: AssistantLanguage;
  script?: AssistantHindiScript;
};

type EntityMatch = {
  entityId: string;
  entityType: string;
  entityLabel: string;
  name: string;
  phone?: string;
  email?: string;
  collectionType?: string;
  score: number;
};

type LoadedEntityRecord = {
  _id: ObjectId;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  openingBalance?: number;
  balanceType?: 'credit' | 'debit';
};

type DailyCashStoredEntry = {
  _id?: ObjectId;
  amount?: number;
  type?: 'in' | 'out';
  description?: string;
  billUrl?: string;
};

type LoadedEntity =
  | {
      entityType: string;
      entityLabel: string;
      entity: LoadedEntityRecord;
    }
  | null;

export type AssistantToolStrategy = 'auto' | 'cash_entry_add';

export const VOICE_ASSISTANT_TOOLS: FunctionDeclarationsTool[] = [
  {
    functionDeclarations: [
      {
        name: 'get_business_overview',
        description:
          'Get a compact business summary for the current user, including counts, totals, and current-day cash.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {},
        },
      },
      {
        name: 'find_entities',
        description:
          'Search customers, suppliers, and custom entities by name. Use this only for ledger/account queries or explicit entity lookup. Do not use it for daily cash, cashbook, or sale narration just because a person name appears in the description.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            nameQuery: {
              type: SchemaType.STRING,
              description: 'Name or partial name to search for.',
            },
            entityTypeHint: {
              type: SchemaType.STRING,
              description:
                'Optional hint like customer, supplier, or a custom collection slug when the user clearly indicates a type.',
            },
            limit: {
              type: SchemaType.INTEGER,
              description: 'Optional max number of matches to return.',
            },
          },
          required: ['nameQuery'],
        },
      },
      {
        name: 'get_entity_ledger',
        description:
          'Get ledger totals, balance, and recent entries for a specific customer, supplier, or custom entity.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            entityType: {
              type: SchemaType.STRING,
              description: 'Entity type slug, such as customer, supplier, or a custom collection slug.',
            },
            entityId: {
              type: SchemaType.STRING,
              description: 'Entity id returned by find_entities.',
            },
            limit: {
              type: SchemaType.INTEGER,
              description: 'Optional number of recent entries to include.',
            },
          },
          required: ['entityType', 'entityId'],
        },
      },
      {
        name: 'get_cash_record_by_date',
        description:
          'Get daily cash totals and entries for a specific date. Always pass an absolute date in YYYY-MM-DD format.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            date: {
              type: SchemaType.STRING,
              description: 'Absolute date in YYYY-MM-DD, resolved in India time.',
            },
          },
          required: ['date'],
        },
      },
      {
        name: 'prepare_cash_entry',
        description:
          'Prepare a daily cash entry draft from the user command. Use for cashbook/cash-record additions, sales cash-in, and cash expenses. If a person or shop name is mentioned only as narration for a sale/payment, keep that name inside the description and do not require entity lookup. Do not save it yet.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            amount: {
              type: SchemaType.NUMBER,
              description: 'Positive amount to add.',
            },
            type: {
              type: SchemaType.STRING,
              format: 'enum',
              enum: ['in', 'out'],
              description: 'in for money received, out for money spent.',
            },
            description: {
              type: SchemaType.STRING,
              description: 'Short clean description for the entry.',
            },
            date: {
              type: SchemaType.STRING,
              description: 'Absolute date in YYYY-MM-DD, resolved in India time.',
            },
          },
          required: ['amount', 'type', 'description', 'date'],
        },
      },
      {
        name: 'prepare_ledger_transaction',
        description:
          'Prepare a ledger transaction draft for a specific entity. Use after resolving the entity. Do not save it yet.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            entityType: {
              type: SchemaType.STRING,
              description: 'Entity type slug, such as customer, supplier, or a custom collection slug.',
            },
            entityId: {
              type: SchemaType.STRING,
              description: 'Entity id returned by find_entities.',
            },
            type: {
              type: SchemaType.STRING,
              format: 'enum',
              enum: ['credit', 'debit'],
              description: 'Ledger transaction type.',
            },
            amount: {
              type: SchemaType.NUMBER,
              description: 'Positive transaction amount.',
            },
            description: {
              type: SchemaType.STRING,
              description: 'Short clean description for the transaction.',
            },
            date: {
              type: SchemaType.STRING,
              description: 'Absolute date in YYYY-MM-DD, resolved in India time.',
            },
          },
          required: ['entityType', 'entityId', 'type', 'amount', 'date'],
        },
      },
    ],
  },
];

function normalizeIntentText(text: string) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[.,!?;:[\]{}()"']/g, ' ')
    .replace(/\u0964/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsIntentPhrase(text: string, phrases: string[]) {
  const normalizedText = ` ${normalizeIntentText(text)} `;

  return phrases.some((phrase) => normalizedText.includes(` ${normalizeIntentText(phrase)} `));
}

export function detectAssistantToolStrategy(query: string): AssistantToolStrategy {
  const queryWithoutIsoDates = query.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ');
  const hasAmount = /\d[\d,]*(?:\.\d+)?/.test(queryWithoutIsoDates);

  if (!hasAmount) {
    return 'auto';
  }

  const addIntentPhrases = [
    'add',
    'please add',
    'add karo',
    'add kardo',
    'save',
    'enter',
    'increase sale',
    'chadha do',
    'chada do',
    'chadhado',
    'charha do',
    'jod do',
    'jodo',
    'likh do',
    'daal do',
    'dal do',
    '\u091c\u094b\u0921\u093c \u0926\u094b',
    '\u091c\u094b\u0921\u094b',
    '\u0932\u093f\u0916 \u0926\u094b',
    '\u0921\u093e\u0932 \u0926\u094b',
    '\u091a\u0922\u093c\u093e \u0926\u094b',
    '\u091a\u095d\u093e \u0926\u094b',
  ];

  const cashEntryContextPhrases = [
    'today sale',
    'today sales',
    'sale',
    'sales',
    'cash record',
    'cashbook',
    'cash book',
    'cash entry',
    'today cash',
    'aaj ki sale',
    'aaj ki bikri',
    'aaj ke cash',
    'aaj ke cash record',
    'cash me',
    'cash mai',
    'cash mein',
    'bikri',
    'nagad',
    '\u0906\u091c \u0915\u0940 \u0938\u0947\u0932',
    '\u0938\u0947\u0932',
    '\u092c\u093f\u0915\u094d\u0930\u0940',
    '\u0915\u0948\u0936 \u0930\u093f\u0915\u0949\u0930\u094d\u0921',
    '\u0915\u0948\u0936\u092c\u0941\u0915',
    '\u0906\u091c \u0915\u0947 \u0915\u0948\u0936',
    '\u0928\u0915\u0926',
  ];

  const ledgerContextPhrases = [
    'ledger',
    'account',
    'khata',
    'khaata',
    'udhar',
    'customer',
    'supplier',
    'credit',
    'debit',
    '\u0916\u093e\u0924\u093e',
    '\u0909\u0927\u093e\u0930',
    '\u091c\u092e\u093e',
    '\u0928\u093e\u092e\u0947',
  ];

  if (containsIntentPhrase(query, ledgerContextPhrases)) {
    return 'auto';
  }

  return containsIntentPhrase(query, addIntentPhrases) && containsIntentPhrase(query, cashEntryContextPhrases)
    ? 'cash_entry_add'
    : 'auto';
}

export function getVoiceAssistantTools(toolNames?: string[]) {
  if (!toolNames?.length) {
    return VOICE_ASSISTANT_TOOLS;
  }

  const allowedToolNames = new Set(toolNames);

  return VOICE_ASSISTANT_TOOLS
    .map((tool) => ({
      functionDeclarations: (tool.functionDeclarations ?? []).filter((declaration) =>
        allowedToolNames.has(declaration.name)
      ),
    }))
    .filter((tool) => tool.functionDeclarations.length > 0);
}

export function getAssistantDateContext(now = new Date()) {
  const isoFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: INDIA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const humanFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: INDIA_TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const todayIso = isoFormatter.format(now);

  return {
    timezone: INDIA_TIMEZONE,
    todayIso,
    todayDisplay: humanFormatter.format(now),
  };
}

function buildHindiResponseRule(script: AssistantHindiScript = 'roman') {
  if (script === 'devanagari') {
    return [
      'Reply only in Hindi using Devanagari script.',
      'Do not switch to English sentences.',
      'Only keep exact names, ids, amounts, model numbers, or unavoidable business terms as-is.',
    ].join(' ');
  }

  return [
    'Reply only in Hindi written in Roman script.',
    'Do not switch to English sentences or Hinglish filler.',
    'Only keep exact names, ids, amounts, model numbers, or unavoidable business terms as-is.',
  ].join(' ');
}

export function buildAssistantReplyFallback(
  language: AssistantLanguage,
  script: AssistantHindiScript | undefined,
  variant: 'could_not_complete' | 'need_context'
) {
  if (language === 'hi') {
    if (script === 'devanagari') {
      return variant === 'could_not_complete'
        ? 'मैं अभी यह अनुरोध पूरा नहीं कर पाया।'
        : 'इसे पूरा करने के लिए मुझे थोड़ी और जानकारी चाहिए।';
    }

    return variant === 'could_not_complete'
      ? 'Main abhi yeh anurodh poora nahin kar paya.'
      : 'Ise poora karne ke liye mujhe thodi aur jankari chahiye.';
  }

  return variant === 'could_not_complete'
    ? 'I could not complete that request right now.'
    : 'I need a little more context to complete that request.';
}

export function buildAssistantSystemInstruction(
  language: AssistantLanguage,
  dateContext: ReturnType<typeof getAssistantDateContext>,
  script?: AssistantHindiScript
) {
  const languageRule = language === 'hi' ? buildHindiResponseRule(script) : 'Reply only in English. Do not use Hindi, Hinglish, or Devanagari.';

  return [
    'You are an AI assistant for an automobile ledger and cashbook application.',
    languageRule,
    `Current timezone: ${dateContext.timezone}.`,
    `Today in India is ${dateContext.todayDisplay} (${dateContext.todayIso}).`,
    'You must use tools for business facts, balances, cash records, and ledger lookups. Never guess ledger data.',
    'When a user wants to add a cash entry or ledger transaction, do not say it is saved yet. First call the appropriate prepare tool and then ask if they want to attach a bill photo.',
    'Use absolute YYYY-MM-DD dates in tool calls.',
    'Interpretation rules:',
    '- Daily cash / cashbook / sale-add / cash-in commands map to prepare_cash_entry.',
    '- If the user says to add something in today sale, sale, cash record, or cashbook, do not call find_entities just because a person name appears in the narration.',
    '- In daily cash narration, names like a payer/customer/shop should be kept inside the cash entry description unless the user explicitly asks for khata, ledger, account, supplier ledger, or customer ledger.',
    '- Customer ledger: debit increases what the customer owes, credit records money received from the customer.',
    '- Supplier ledger: credit records goods/value received from the supplier, debit records payment made to the supplier.',
    '- Custom entity ledgers follow the same debit/credit behavior as customer ledgers unless the user clearly indicates otherwise.',
    'If entity matches are ambiguous, ask a short clarification question.',
    'Keep answers concise and practical.',
  ].join('\n');
}

export function buildBillConfirmationFallback(action: AssistantPendingAction) {
  if (action.language === 'hi') {
    if (action.script === 'devanagari') {
      return 'मैंने ड्राफ्ट तैयार कर दिया है। क्या आप बिल की फोटो भी जोड़ना चाहेंगे? हाँ, नहीं, या रद्द बोलिए।';
    }

    return 'Maine draft taiyar kar diya hai. Kya aap bill ki photo bhi jodna chahenge? Haan, nahin, ya radd boliye.';
  }

  return 'I have the draft ready. Would you like to attach a bill photo too? Say yes, no, or cancel.';
}

export async function executeVoiceAssistantTool(
  toolName: string,
  rawArgs: unknown,
  context: AssistantToolContext
) {
  try {
    switch (toolName) {
      case 'get_business_overview':
        return await getBusinessOverview(context.userId);
      case 'find_entities':
        return await findEntities(context.userId, findEntitiesArgsSchema.parse(rawArgs));
      case 'get_entity_ledger':
        return await getEntityLedger(context.userId, getEntityLedgerArgsSchema.parse(rawArgs));
      case 'get_cash_record_by_date':
        return await getCashRecordByDate(context.userId, getCashRecordArgsSchema.parse(rawArgs));
      case 'prepare_cash_entry':
        return await prepareCashEntry(context, prepareCashEntryArgsSchema.parse(rawArgs));
      case 'prepare_ledger_transaction':
        return await prepareLedgerTransaction(context, prepareLedgerTransactionArgsSchema.parse(rawArgs));
      default:
        return {
          ok: false,
          error: `Unknown tool "${toolName}"`,
        };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Tool execution failed',
    };
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clampToolLimit(value?: number) {
  return Math.max(1, Math.min(value ?? DEFAULT_TOOL_LIMIT, MAX_TOOL_LIMIT));
}

function isObjectIdLike(value: string) {
  return /^[a-fA-F0-9]{24}$/.test(value);
}

function isoDateToUtcDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(isoDate: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: INDIA_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(isoDateToUtcDate(isoDate));
}

function buildAmountDisplay(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function buildCashDraftSummary(
  language: AssistantLanguage,
  script: AssistantHindiScript | undefined,
  type: 'in' | 'out',
  amount: number,
  date: string
) {
  const amountDisplay = buildAmountDisplay(amount);

  if (language === 'hi') {
    if (script === 'devanagari') {
      return `${date} के लिए ${amountDisplay} ${type === 'in' ? 'नगद जमा' : 'नगद खर्च'} का ड्राफ्ट तैयार है`;
    }

    return `${date} ke liye ${amountDisplay} ${type === 'in' ? 'nagad jama' : 'nagad kharch'} ka draft taiyar hai`;
  }

  return `${type === 'in' ? 'Cash in' : 'Cash out'} draft for ${amountDisplay} on ${date}`;
}

function buildLedgerDraftSummary(
  language: AssistantLanguage,
  script: AssistantHindiScript | undefined,
  entityName: string,
  amount: number,
  date: string
) {
  const amountDisplay = buildAmountDisplay(amount);

  if (language === 'hi') {
    if (script === 'devanagari') {
      return `${entityName} के लिए ${date} पर ${amountDisplay} की लेजर एंट्री का ड्राफ्ट तैयार है`;
    }

    return `${entityName} ke liye ${date} par ${amountDisplay} ki ledger entry ka draft taiyar hai`;
  }

  return `Ledger draft for ${entityName}: ${amountDisplay} on ${date}`;
}

async function getCollectionTypeMap(userId: string) {
  const db = await getDb();
  const collectionTypes = await db
    .collection('collectionTypes')
    .find({ userId })
    .project({ slug: 1, name: 1 })
    .toArray();

  return new Map(
    collectionTypes.map((collectionType) => [collectionType.slug as string, collectionType.name as string])
  );
}

async function loadEntityById(userId: string, entityType: string, entityId: string): Promise<LoadedEntity> {
  if (!isObjectIdLike(entityId)) {
    return null;
  }

  const db = await getDb();
  const id = new ObjectId(entityId);

  if (entityType === 'customer') {
    const entity = await db.collection('customers').findOne({
      _id: id,
      userId,
    });

    return entity
      ? {
          entityType,
          entityLabel: 'Customer',
          entity: entity as LoadedEntityRecord,
        }
      : null;
  }

  if (entityType === 'supplier') {
    const entity = await db.collection('suppliers').findOne({
      _id: id,
      userId,
    });

    return entity
      ? {
          entityType,
          entityLabel: 'Supplier',
          entity: entity as LoadedEntityRecord,
        }
      : null;
  }

  const [entity, collectionTypeName] = await Promise.all([
    db.collection('customEntities').findOne({
      _id: id,
      collectionType: entityType,
      userId,
    }),
    db.collection('collectionTypes').findOne({
      userId,
      slug: entityType,
    }),
  ]);

  return entity
    ? {
        entityType,
        entityLabel: (collectionTypeName?.name as string) || 'Entity',
        entity: entity as LoadedEntityRecord,
      }
    : null;
}

async function getBusinessOverview(userId: string) {
  const db = await getDb();
  const todayIso = getAssistantDateContext().todayIso;
  const todayDate = isoDateToUtcDate(todayIso);

  const [customersCount, suppliersCount, txAgg, todayCashRecord, collectionTypes] = await Promise.all([
    db.collection('customers').countDocuments({ userId }),
    db.collection('suppliers').countDocuments({ userId }),
    db
      .collection('transactions')
      .aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            totalCredit: {
              $sum: {
                $cond: [
                  { $eq: ['$type', 'credit'] },
                  { $convert: { input: '$amount', to: 'double', onError: 0, onNull: 0 } },
                  0,
                ],
              },
            },
            totalDebit: {
              $sum: {
                $cond: [
                  { $eq: ['$type', 'debit'] },
                  { $convert: { input: '$amount', to: 'double', onError: 0, onNull: 0 } },
                  0,
                ],
              },
            },
          },
        },
      ])
      .toArray(),
    db.collection('dailyCashRecords').findOne({ userId, date: todayDate }),
    db.collection('collectionTypes').find({ userId }).project({ slug: 1, name: 1 }).toArray(),
  ]);

  const txTotals = (txAgg?.[0] as {
    totalTransactions?: number;
    totalCredit?: number;
    totalDebit?: number;
  }) ?? { totalTransactions: 0, totalCredit: 0, totalDebit: 0 };

  const totalTransactions = Number(txTotals.totalTransactions || 0);
  const totalCredit = Number(txTotals.totalCredit || 0);
  const totalDebit = Number(txTotals.totalDebit || 0);

  return {
    ok: true,
    overview: {
      totalCustomers: customersCount,
      totalSuppliers: suppliersCount,
      totalTransactions,
      totalCredit,
      totalDebit,
      netBalance: totalDebit - totalCredit,
      todayCash: {
        date: todayIso,
        cashIn: Number(todayCashRecord?.totalIn || 0),
        cashOut: Number(todayCashRecord?.totalOut || 0),
        balance: Number(todayCashRecord?.totalLeft || 0),
      },
      collections: collectionTypes.map((collectionType) => ({
        slug: collectionType.slug,
        name: collectionType.name,
      })),
    },
  };
}

async function findEntities(
  userId: string,
  args: z.infer<typeof findEntitiesArgsSchema>
) {
  const db = await getDb();
  const limit = clampToolLimit(args.limit);
  const escapedQuery = escapeRegex(args.nameQuery);
  const regex = { $regex: escapedQuery, $options: 'i' };
  const loweredQuery = args.nameQuery.trim().toLowerCase();
  const hint = args.entityTypeHint?.trim().toLowerCase();
  const collectionTypeMap = await getCollectionTypeMap(userId);

  const [customers, suppliers, customEntities] = await Promise.all([
    db.collection('customers')
      .find({
        userId,
        $or: [{ name: regex }, { phone: regex }, { email: regex }],
      })
      .project({ _id: 1, name: 1, phone: 1, email: 1 })
      .limit(limit)
      .toArray(),
    db.collection('suppliers')
      .find({
        userId,
        $or: [{ name: regex }, { phone: regex }, { email: regex }],
      })
      .project({ _id: 1, name: 1, phone: 1, email: 1 })
      .limit(limit)
      .toArray(),
    db.collection('customEntities')
      .find({
        userId,
        $or: [{ name: regex }, { phone: regex }, { email: regex }, { collectionType: regex }],
      })
      .project({ _id: 1, name: 1, phone: 1, email: 1, collectionType: 1 })
      .limit(limit)
      .toArray(),
  ]);

  const scoreMatch = (name: string) => {
    const loweredName = name.toLowerCase();
    if (loweredName === loweredQuery) return 0;
    if (loweredName.startsWith(loweredQuery)) return 1;
    if (loweredName.includes(loweredQuery)) return 2;
    return 3;
  };

  const matches: EntityMatch[] = [];

  if (!hint || hint === 'customer') {
    matches.push(
      ...customers.map((customer) => ({
        entityId: customer._id.toString(),
        entityType: 'customer',
        entityLabel: 'Customer',
        name: customer.name as string,
        phone: customer.phone as string | undefined,
        email: customer.email as string | undefined,
        score: scoreMatch(customer.name as string),
      }))
    );
  }

  if (!hint || hint === 'supplier') {
    matches.push(
      ...suppliers.map((supplier) => ({
        entityId: supplier._id.toString(),
        entityType: 'supplier',
        entityLabel: 'Supplier',
        name: supplier.name as string,
        phone: supplier.phone as string | undefined,
        email: supplier.email as string | undefined,
        score: scoreMatch(supplier.name as string),
      }))
    );
  }

  matches.push(
    ...customEntities
      .filter((customEntity) => {
        if (!hint) return true;
        const collectionType = String(customEntity.collectionType || '').toLowerCase();
        const collectionTypeLabel = String(collectionTypeMap.get(collectionType) || '').toLowerCase();
        return hint === collectionType || hint === collectionTypeLabel;
      })
      .map((customEntity) => {
        const collectionType = String(customEntity.collectionType || '');
        return {
          entityId: customEntity._id.toString(),
          entityType: collectionType,
          entityLabel: collectionTypeMap.get(collectionType) || 'Entity',
          name: customEntity.name as string,
          phone: customEntity.phone as string | undefined,
          email: customEntity.email as string | undefined,
          collectionType,
          score: scoreMatch(customEntity.name as string),
        };
      })
  );

  const dedupedMatches = Array.from(
    new Map(
      matches
        .sort((left, right) => left.score - right.score || left.name.localeCompare(right.name))
        .map((match) => [`${match.entityType}:${match.entityId}`, match])
    ).values()
  ).slice(0, limit);

  return {
    ok: true,
    matches: dedupedMatches.map((match) => ({
      entityId: match.entityId,
      entityType: match.entityType,
      entityLabel: match.entityLabel,
      name: match.name,
      phone: match.phone,
      email: match.email,
      collectionType: match.collectionType,
    })),
    totalMatches: dedupedMatches.length,
  };
}

async function getEntityLedger(
  userId: string,
  args: z.infer<typeof getEntityLedgerArgsSchema>
) {
  const db = await getDb();
  const limit = Math.max(1, Math.min(args.limit ?? DEFAULT_TOOL_LIMIT, 20));
  const loadedEntity = await loadEntityById(userId, args.entityType, args.entityId);

  if (!loadedEntity) {
    return {
      ok: false,
      error: 'Entity not found',
    };
  }

  const allTransactions = await db
    .collection('transactions')
    .find({
      userId,
      entityType: args.entityType,
      entityId: args.entityId,
    })
    .sort({ date: -1, createdAt: -1 })
    .toArray();

  const totalCredit = allTransactions
    .filter((transaction) => transaction.type === 'credit')
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

  const totalDebit = allTransactions
    .filter((transaction) => transaction.type === 'debit')
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

  let currentBalance = Number(loadedEntity.entity.openingBalance || 0);
  if (loadedEntity.entity.balanceType === 'credit') {
    currentBalance = -currentBalance;
  }
  currentBalance = currentBalance - totalCredit + totalDebit;

  const recentEntries = allTransactions.slice(0, limit).map((transaction) => ({
    transactionId: transaction._id.toString(),
    date: formatIsoDate(new Date(transaction.date)),
    amount: Number(transaction.amount || 0),
    type: transaction.type as 'credit' | 'debit',
    description: String(transaction.description || ''),
    billAttached: Boolean(transaction.billUrl),
  }));

  return {
    ok: true,
    ledger: {
      entity: {
        entityId: loadedEntity.entity._id.toString(),
        entityType: loadedEntity.entityType,
        entityLabel: loadedEntity.entityLabel,
        name: loadedEntity.entity.name,
        phone: loadedEntity.entity.phone || '',
        email: loadedEntity.entity.email || '',
        address: loadedEntity.entity.address || '',
      },
      totals: {
        credit: totalCredit,
        debit: totalDebit,
        balance: currentBalance,
        balanceStatus:
          currentBalance > 0 ? 'receivable' : currentBalance < 0 ? 'payable' : 'settled',
      },
      transactionCount: allTransactions.length,
      recentEntries,
    },
  };
}

async function getCashRecordByDate(
  userId: string,
  args: z.infer<typeof getCashRecordArgsSchema>
) {
  const db = await getDb();
  const normalizedDate = isoDateToUtcDate(args.date);

  const record = await db.collection('dailyCashRecords').findOne({
    userId,
    date: normalizedDate,
  });

  const entries = Array.isArray(record?.entries)
    ? (record.entries as DailyCashStoredEntry[]).slice(0, 20).map((entry) => ({
        id: entry._id?.toString?.() || '',
        amount: Number(entry.amount || 0),
        type: (entry.type as 'in' | 'out') || 'in',
        description: String(entry.description || ''),
        billAttached: Boolean(entry.billUrl),
      }))
    : [];

  return {
    ok: true,
    cashRecord: {
      date: args.date,
      displayDate: formatDisplayDate(args.date),
      exists: Boolean(record),
      totals: {
        cashIn: Number(record?.totalIn || 0),
        cashOut: Number(record?.totalOut || 0),
        balance: Number(record?.totalLeft || 0),
      },
      entryCount: entries.length,
      entries,
    },
  };
}

async function prepareCashEntry(
  context: AssistantToolContext,
  args: z.infer<typeof prepareCashEntryArgsSchema>
) {
  const pendingScript = context.language === 'hi' ? context.script || 'roman' : undefined;
  const pendingAction: AssistantPendingAction = {
    kind: 'cash_entry',
    requiresBillConfirmation: true,
    draft: {
      amount: args.amount,
      type: args.type,
      description: args.description,
      date: args.date,
    },
    summary: buildCashDraftSummary(
      context.language,
      pendingScript,
      args.type,
      args.amount,
      args.date
    ),
    language: context.language,
    script: pendingScript,
  };

  return {
    ok: true,
    pendingAction,
    preview: {
      amount: args.amount,
      type: args.type,
      description: args.description,
      date: args.date,
      displayDate: formatDisplayDate(args.date),
    },
  };
}

async function prepareLedgerTransaction(
  context: AssistantToolContext,
  args: z.infer<typeof prepareLedgerTransactionArgsSchema>
) {
  const loadedEntity = await loadEntityById(context.userId, args.entityType, args.entityId);

  if (!loadedEntity) {
    return {
      ok: false,
      error: 'Entity not found for transaction draft',
    };
  }

  const pendingScript = context.language === 'hi' ? context.script || 'roman' : undefined;
  const pendingAction: AssistantPendingAction = {
    kind: 'ledger_transaction',
    requiresBillConfirmation: true,
    draft: {
      entityType: args.entityType,
      entityId: args.entityId,
      entityName: loadedEntity.entity.name,
      entityLabel: loadedEntity.entityLabel,
      type: args.type,
      amount: args.amount,
      description: args.description?.trim() || '',
      date: args.date,
    },
    summary: buildLedgerDraftSummary(
      context.language,
      pendingScript,
      loadedEntity.entity.name,
      args.amount,
      args.date
    ),
    language: context.language,
    script: pendingScript,
  };

  return {
    ok: true,
    pendingAction,
    preview: {
      entityName: loadedEntity.entity.name,
      entityType: args.entityType,
      entityLabel: loadedEntity.entityLabel,
      type: args.type,
      amount: args.amount,
      description: args.description?.trim() || '',
      date: args.date,
      displayDate: formatDisplayDate(args.date),
    },
  };
}

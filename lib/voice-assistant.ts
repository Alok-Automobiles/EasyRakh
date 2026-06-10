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

const searchInventoryArgsSchema = z.object({
  query: z.string().trim().min(1, 'query is required'),
  limit: z.number().int().min(1).max(MAX_TOOL_LIMIT).optional(),
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
          'Search customers, suppliers, and custom entities by name. Use this only for ledger/account queries or explicit entity lookup. Do not use it for daily cash, cashbook, or sale narration just because a person name appears in the description. Pass only the core name keywords — strip Hindi particles like ka, ki, ke, kaha, etc. Prefer English/Roman script but Devanagari is also accepted.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            nameQuery: {
              type: SchemaType.STRING,
              description: 'Name or partial name to search for. Pass only core keywords, strip filler words like ka/ki/ke/hai. Prefer English/Roman script.',
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
      {
        name: 'search_inventory',
        description:
          'Search inventory / stock items by name, part number, brand, or description. Use when the user asks about a part, product, stock item, its location, price (buying price or MRP), quantity, or availability. Pass ONLY the core product/part keywords — strip Hindi grammar particles like ka, ki, ke, kaha, hai, etc. Prefer English but Devanagari is accepted. Example: if user says "Scorpio ka clutch set kaha rakha hai" pass query as "SCORPIO CLUTCH SET". If user says "tata flywheel" pass "TATA FLYWHEEL".',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: {
              type: SchemaType.STRING,
              description: 'Core item/part/brand keywords to search for. Strip filler words (ka, ki, kaha, hai). Prefer UPPERCASE ENGLISH but any script works.',
            },
            limit: {
              type: SchemaType.INTEGER,
              description: 'Max items to return (default 5).',
            },
          },
          required: ['query'],
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
      'NEVER repeat the same word in both Devanagari and English parenthetical. Say it once only.',
    ].join(' ');
  }

  return [
    'Reply only in Hindi written in Roman script.',
    'Do not switch to English sentences or Hinglish filler.',
    'Only keep exact names, ids, amounts, model numbers, or unavoidable business terms as-is.',
    'NEVER repeat the same word in both Hindi and English parenthetical. Say it once only.',
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
    'DATA SEARCH RULE: All business data is stored in English/Roman script (often UPPERCASE). When calling search tools (find_entities, search_inventory), pass ONLY the core keywords — strip Hindi grammar particles like ka, ki, ke, ko, se, mein, kaha, hai, etc. For example: if user says "Scorpio ka clutch set kaha rakha hai" pass query "SCORPIO CLUTCH SET". If user says "राजेश का खाता" pass "Rajesh". If user says "tata ka flywheel" pass "TATA FLYWHEEL". Prefer English/Roman script, but the backend can handle Devanagari too. Always reply in the user\'s language.',
    'Interpretation rules:',
    '- Daily cash / cashbook / sale-add / cash-in commands map to prepare_cash_entry.',
    '- If the user says to add something in today sale, sale, cash record, or cashbook, do not call find_entities just because a person name appears in the narration.',
    '- In daily cash narration, names like a payer/customer/shop should be kept inside the cash entry description unless the user explicitly asks for khata, ledger, account, supplier ledger, or customer ledger.',
    '- Customer ledger: debit increases what the customer owes, credit records money received from the customer.',
    '- Supplier ledger: credit records goods/value received from the supplier, debit records payment made to the supplier.',
    '- Custom entity ledgers follow the same debit/credit behavior as customer ledgers unless the user clearly indicates otherwise.',
    '- If the user asks about a part, product, stock item, its location, price, quantity, or availability, use search_inventory. Never guess inventory data.',
    '- When reporting inventory results, only include the item location and available quantity. NEVER mention buying price, MRP, or any cost information in your reply — customers may overhear.',
    'If entity matches are ambiguous, ask a short clarification question.',
    'RESPONSE FORMATTING (your replies are read aloud via text-to-speech):',
    '- NEVER use markdown formatting: no asterisks for bold, no underscores, no backticks, no headers, no bullet markers.',
    '- NEVER repeat words in two languages or scripts. Do NOT write things like \"टाटा (TATA)\" or \"ऑयल फ़िल्टर (OIL FILTER)\". Just say the word once in whichever language you are replying in.',
    '- For part numbers and item codes, write each digit separated by spaces so TTS reads them individually. Example: write \"2 7 8 6 1 8\" not \"278618\".',
    '- Keep answers short, natural, and conversational — like speaking to a person, not writing a document.',
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
      case 'find_entities': {
        const findArgs = findEntitiesArgsSchema.parse(rawArgs);
        return await findEntities(context.userId, findArgs);
      }
      case 'get_entity_ledger':
        return await getEntityLedger(context.userId, getEntityLedgerArgsSchema.parse(rawArgs));
      case 'get_cash_record_by_date':
        return await getCashRecordByDate(context.userId, getCashRecordArgsSchema.parse(rawArgs));
      case 'prepare_cash_entry':
        return await prepareCashEntry(context, prepareCashEntryArgsSchema.parse(rawArgs));
      case 'prepare_ledger_transaction':
        return await prepareLedgerTransaction(context, prepareLedgerTransactionArgsSchema.parse(rawArgs));
      case 'search_inventory': {
        const invArgs = searchInventoryArgsSchema.parse(rawArgs);
        return await searchInventory(context.userId, invArgs);
      }
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

function containsDevanagari(text: string) {
  return /[\u0900-\u097F]/.test(text);
}

// ---------------------------------------------------------------------------
// Search utilities: stop words, transliteration, cleaning, fuzzy scoring
// ---------------------------------------------------------------------------

const SEARCH_STOP_WORDS = new Set([
  // Hindi particles / grammar
  'ka', 'ki', 'ke', 'ko', 'se', 'me', 'mein', 'mai', 'par', 'pe',
  'hai', 'hain', 'ho', 'tha', 'the', 'thi',
  'aur', 'ya', 'bhi', 'na', 'nahi', 'nahin', 'mat',
  'kya', 'kaise', 'kaha', 'kahan', 'kidhar', 'kaun', 'kitna', 'kitne', 'kitni',
  'batao', 'bata', 'dikhao', 'dikha', 'dikhana', 'bol', 'bolo',
  'mera', 'meri', 'mere', 'tera', 'teri', 'tere', 'uska', 'uski', 'uske',
  'ek', 'do', 'yeh', 'ye', 'woh', 'wo', 'is', 'us', 'in', 'un',
  'abhi', 'ab', 'to', 'toh',
  'rakh', 'rakha', 'rakhe', 'rakhi',
  'wala', 'wale', 'wali',
  'kaha', 'raha', 'rahe', 'rahi',
  // English stop words
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
  'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
  'and', 'or', 'but', 'not', 'it', 'its', 'this', 'that',
  'what', 'where', 'how', 'much', 'many', 'which',
  'show', 'tell', 'find', 'get', 'give', 'me', 'my',
  'please', 'can', 'you',
  // Hindi inventory filler
  'ka', 'ki', 'price', 'location', 'stock', 'available',
  'khata', 'khaata', 'hisab', 'hisaab',
]);

/** Simple Devanagari → Roman phonetic transliteration map */
const DEVANAGARI_MAP: Record<string, string> = {
  // Vowels
  '\u0905': 'a', '\u0906': 'aa', '\u0907': 'i', '\u0908': 'ee',
  '\u0909': 'u', '\u090A': 'oo', '\u090B': 'ri', '\u090F': 'e',
  '\u0910': 'ai', '\u0913': 'o', '\u0914': 'au',
  // Vowel marks (matras)
  '\u093E': 'aa', '\u093F': 'i', '\u0940': 'ee', '\u0941': 'u',
  '\u0942': 'oo', '\u0943': 'ri', '\u0947': 'e', '\u0948': 'ai',
  '\u094B': 'o', '\u094C': 'au',
  // Consonants
  '\u0915': 'k', '\u0916': 'kh', '\u0917': 'g', '\u0918': 'gh', '\u0919': 'ng',
  '\u091A': 'ch', '\u091B': 'chh', '\u091C': 'j', '\u091D': 'jh', '\u091E': 'ny',
  '\u091F': 't', '\u0920': 'th', '\u0921': 'd', '\u0922': 'dh', '\u0923': 'n',
  '\u0924': 't', '\u0925': 'th', '\u0926': 'd', '\u0927': 'dh', '\u0928': 'n',
  '\u092A': 'p', '\u092B': 'ph', '\u092C': 'b', '\u092D': 'bh', '\u092E': 'm',
  '\u092F': 'y', '\u0930': 'r', '\u0932': 'l', '\u0935': 'v',
  '\u0936': 'sh', '\u0937': 'sh', '\u0938': 's', '\u0939': 'h',
  // Nukta variants
  '\u0958': 'k', '\u0959': 'kh', '\u095A': 'g', '\u095B': 'z',
  '\u095C': 'd', '\u095D': 'dh', '\u095E': 'f', '\u095F': 'y',
  // Special
  '\u0902': 'n', // anusvara
  '\u0903': 'h', // visarga
  '\u094D': '',  // halant (virama) — suppresses inherent 'a'
  '\u0901': 'n', // chandrabindu
  '\u0964': '',  // danda
  '\u0965': '',  // double danda
  // Avagraha and nukta
  '\u093D': '', '\u093C': '',
  // Devanagari digits → ASCII digits
  '\u0966': '0', '\u0967': '1', '\u0968': '2', '\u0969': '3', '\u096A': '4',
  '\u096B': '5', '\u096C': '6', '\u096D': '7', '\u096E': '8', '\u096F': '9',
  // Common conjunct — क्ष, त्र, ज्ñ, श्र handled by halant rule above
  '\u0949': 'o',  // candra o
  '\u094A': 'o',  // short o
};

function transliterateDevanagari(text: string): string {
  if (!containsDevanagari(text)) return text;

  let result = '';
  let prevWasConsonant = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = ch.charCodeAt(0);

    // Non-Devanagari — pass through
    if (code < 0x0900 || code > 0x097F) {
      prevWasConsonant = false;
      result += ch;
      continue;
    }

    const mapped = DEVANAGARI_MAP[ch];

    if (mapped === undefined) {
      // Unknown Devanagari char — skip
      prevWasConsonant = false;
      continue;
    }

    // Halant (virama) suppresses the inherent 'a'
    if (ch === '\u094D') {
      prevWasConsonant = false;
      continue;
    }

    // Vowel sign (matra) replaces the inherent 'a' of prev consonant
    const isMatra = code >= 0x093E && code <= 0x094C;
    if (isMatra) {
      result += mapped;
      prevWasConsonant = false;
      continue;
    }

    // Consonant range: 0x0915-0x0939 + nukta variants
    const isConsonant =
      (code >= 0x0915 && code <= 0x0939) ||
      (code >= 0x0958 && code <= 0x095F);

    if (isConsonant) {
      // If prev char was a consonant without a following matra, add inherent 'a'
      if (prevWasConsonant) {
        result += 'a';
      }
      result += mapped;
      // Check if next char is halant → don't add inherent 'a'
      if (i + 1 < text.length && text[i + 1] === '\u094D') {
        prevWasConsonant = false;
        i++; // skip halant
      } else {
        prevWasConsonant = true;
      }
      continue;
    }

    // Independent vowel or other
    if (prevWasConsonant) {
      // An independent vowel after a consonant means the consonant keeps inherent 'a'
      result += 'a';
      prevWasConsonant = false;
    }
    result += mapped;
  }

  // Trailing consonant gets inherent 'a'
  if (prevWasConsonant) {
    result += 'a';
  }

  return result;
}

/**
 * Clean a search query: transliterate Devanagari, lowercase, strip
 * punctuation and stop words, return meaningful keyword tokens.
 */
export function cleanSearchQuery(raw: string, transliterate = true): string[] {
  const romanized = transliterate ? transliterateDevanagari(raw) : raw;
  const tokens = romanized
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const meaningful = tokens.filter((t) => !SEARCH_STOP_WORDS.has(t));
  // If everything was stop words, return original tokens (minus empty)
  return meaningful.length > 0 ? meaningful : tokens.filter((t) => t.length > 1);
}

/** Levenshtein edit distance */
function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  // Use two rows for space efficiency
  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  let curr = new Array<number>(lb + 1);

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[lb];
}

/**
 * Normalize a string for fuzzy comparison: collapse w/v, remove doubled
 * consonants, strip common phonetic noise.
 */
function phoneticNormalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/w/g, 'v')     // v/w equivalence
    .replace(/ph/g, 'f')    // ph → f
    .replace(/(.)\.?\1+/g, '$1')  // collapse repeated chars (ee→e, ll→l)
    .replace(/[^a-z0-9]/g, '');  // strip non-alphanumeric
}

/**
 * Score how well a single query token matches a single target word.
 * Returns 0.0 (no match) to 1.0 (perfect match).
 */
function tokenSimilarity(queryToken: string, targetWord: string): number {
  const qn = phoneticNormalize(queryToken);
  const tn = phoneticNormalize(targetWord);
  if (!qn || !tn) return 0;

  // Exact match after normalization
  if (qn === tn) return 1.0;

  // Prefix match
  if (tn.startsWith(qn) || qn.startsWith(tn)) {
    return 0.9;
  }

  // Contains match
  if (tn.includes(qn) || qn.includes(tn)) {
    return 0.8;
  }

  // Levenshtein similarity
  const maxLen = Math.max(qn.length, tn.length);
  const dist = levenshtein(qn, tn);
  const sim = 1.0 - dist / maxLen;

  // Only consider it a match if similarity is reasonable
  return sim >= 0.55 ? sim * 0.7 : 0;
}

/**
 * Score how well query tokens match a multi-word target string.
 * Returns 0.0 (no match) to 1.0 (perfect match).
 */
function fuzzyFieldScore(queryTokens: string[], fieldValue: string): number {
  if (!fieldValue) return 0;

  const fieldLower = fieldValue.toLowerCase();
  const fieldWords = fieldLower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const fieldConcat = phoneticNormalize(fieldLower);

  if (!fieldWords.length) return 0;

  let totalScore = 0;

  for (const qt of queryTokens) {
    // Best match for this query token against all field words
    let bestWordScore = 0;
    for (const fw of fieldWords) {
      const sim = tokenSimilarity(qt, fw);
      if (sim > bestWordScore) bestWordScore = sim;
    }

    // Also check concatenated field (handles "marcopolo" vs "marco polo")
    const qtNorm = phoneticNormalize(qt);
    if (fieldConcat.includes(qtNorm) && qtNorm.length >= 3) {
      bestWordScore = Math.max(bestWordScore, 0.85);
    }

    totalScore += bestWordScore;
  }

  // Also check the entire query concatenated against the field concatenated
  const queryConcat = phoneticNormalize(queryTokens.join(''));
  if (queryConcat.length >= 3 && fieldConcat.includes(queryConcat)) {
    totalScore = Math.max(totalScore, queryTokens.length * 0.85);
  }

  return totalScore / queryTokens.length;
}

type InventoryFieldWeights = { field: string; weight: number };

const INVENTORY_FIELD_WEIGHTS: InventoryFieldWeights[] = [
  { field: 'itemName', weight: 1.0 },
  { field: 'description', weight: 0.85 },
  { field: 'brand', weight: 0.8 },
  { field: 'itemNumber', weight: 0.9 },
  { field: 'uniqueCode', weight: 0.9 },
  { field: 'supplier', weight: 0.6 },
];

/** Score an inventory item against cleaned query tokens. */
export function scoreInventoryItem(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: Record<string, any>,
  queryTokens: string[]
): number {
  let bestScore = 0;

  for (const { field, weight } of INVENTORY_FIELD_WEIGHTS) {
    const val = String(item[field] || '');
    if (!val) continue;
    const fieldScore = fuzzyFieldScore(queryTokens, val) * weight;
    if (fieldScore > bestScore) bestScore = fieldScore;
  }

  return bestScore;
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
  const hint = args.entityTypeHint?.trim().toLowerCase();
  const collectionTypeMap = await getCollectionTypeMap(userId);

  // Clean the query: transliterate Devanagari, remove stop words
  const cleanedTokens = cleanSearchQuery(args.nameQuery);
  const cleanedQuery = cleanedTokens.join(' ');
  const loweredQuery = cleanedQuery.toLowerCase();

  // Build regex patterns: match each token individually with AND logic in-memory,
  // but use OR in MongoDB to cast a wide net
  const regexPatterns = cleanedTokens.map((token) => ({
    $regex: escapeRegex(token),
    $options: 'i',
  }));

  // Build a broad OR query from all tokens
  const orConditions = regexPatterns.flatMap((regex) => [
    { name: regex },
    { phone: regex },
    { email: regex },
  ]);

  const entityOrConditions = regexPatterns.flatMap((regex) => [
    { name: regex },
    { phone: regex },
    { email: regex },
    { collectionType: regex },
  ]);

  // Also try the original query as a single regex for exact phrase matching
  const originalRegex = { $regex: escapeRegex(args.nameQuery.trim()), $options: 'i' };
  orConditions.push({ name: originalRegex });
  entityOrConditions.push({ name: originalRegex });

  const fetchLimit = limit * 3; // Fetch more to allow in-memory scoring

  const [customers, suppliers, customEntities] = await Promise.all([
    db.collection('customers')
      .find({
        userId,
        $or: orConditions,
      })
      .project({ _id: 1, name: 1, phone: 1, email: 1 })
      .limit(fetchLimit)
      .toArray(),
    db.collection('suppliers')
      .find({
        userId,
        $or: orConditions,
      })
      .project({ _id: 1, name: 1, phone: 1, email: 1 })
      .limit(fetchLimit)
      .toArray(),
    db.collection('customEntities')
      .find({
        userId,
        $or: entityOrConditions,
      })
      .project({ _id: 1, name: 1, phone: 1, email: 1, collectionType: 1 })
      .limit(fetchLimit)
      .toArray(),
  ]);

  const scoreMatch = (name: string): number => {
    const loweredName = name.toLowerCase();
    if (loweredName === loweredQuery) return 0;
    if (loweredName.startsWith(loweredQuery)) return 1;
    if (loweredName.includes(loweredQuery)) return 2;

    // Fuzzy token scoring
    const nameScore = fuzzyFieldScore(cleanedTokens, name);
    if (nameScore >= 0.8) return 2;
    if (nameScore >= 0.5) return 3;
    return 4;
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

async function searchInventory(
  userId: string,
  args: z.infer<typeof searchInventoryArgsSchema>
) {
  const db = await getDb();
  const limit = clampToolLimit(args.limit ?? 5);

  // Clean the query: transliterate Devanagari, strip stop words
  const queryTokens = cleanSearchQuery(args.query);

  if (!queryTokens.length) {
    return {
      ok: true,
      matches: [],
      totalMatches: 0,
      message: `No meaningful search terms found in query "${args.query}".`,
    };
  }

  const projection = {
    _id: 1,
    itemName: 1,
    itemNumber: 1,
    uniqueCode: 1,
    quantity: 1,
    location: 1,
    unitOfMeasure: 1,
    brand: 1,
    description: 1,
    buyingPrice: 1,
    mrp: 1,
    supplier: 1,
  };

  // Build broad regex OR conditions from each query token
  const searchFields = ['itemName', 'itemNumber', 'uniqueCode', 'brand', 'description', 'supplier'];
  const orConditions = queryTokens.flatMap((token) => {
    const regex = { $regex: escapeRegex(token), $options: 'i' };
    return searchFields.map((field) => ({ [field]: regex }));
  });

  // Also add the original raw query (cleaned of stop words, joined) as a phrase
  const phraseRegex = { $regex: escapeRegex(queryTokens.join(' ')), $options: 'i' };
  orConditions.push(
    ...searchFields.map((field) => ({ [field]: phraseRegex }))
  );

  // Fetch candidates (cast a wide net, score in memory)
  const fetchLimit = Math.max(limit * 10, 50);
  const candidates = await db
    .collection('inventory')
    .find({
      userId,
      $or: orConditions,
    })
    .project(projection)
    .limit(fetchLimit)
    .toArray();

  // Score each candidate with fuzzy matching
  const scored = candidates
    .map((item) => ({
      item,
      score: scoreInventoryItem(item as Record<string, unknown>, queryTokens),
    }))
    .filter(({ score }) => score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (!scored.length) {
    return {
      ok: true,
      matches: [],
      totalMatches: 0,
      message: `No inventory items found matching "${args.query}" (searched as: ${queryTokens.join(', ')}).`,
    };
  }

  return {
    ok: true,
    matches: scored.map(({ item }) => ({
      itemId: item._id.toString(),
      itemName: item.itemName as string,
      itemNumber: (item.itemNumber as string) || '',
      uniqueCode: (item.uniqueCode as string) || '',
      location: (item.location as string) || '',
      quantity: Number(item.quantity || 0),
      unitOfMeasure: (item.unitOfMeasure as string) || '',
      brand: (item.brand as string) || '',
      description: (item.description as string) || '',
      buyingPrice: item.buyingPrice != null ? Number(item.buyingPrice) : null,
      mrp: item.mrp != null ? Number(item.mrp) : null,
      supplier: (item.supplier as string) || '',
    })),
    totalMatches: scored.length,
  };
}

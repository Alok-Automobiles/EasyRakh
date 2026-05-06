import { GoogleGenerativeAI, FunctionCallingMode } from '@google/generative-ai';
import type { Part } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import {
  VOICE_ASSISTANT_TOOLS,
  buildAssistantReplyFallback,
  buildAssistantSystemInstruction,
  buildBillConfirmationFallback,
  detectAssistantToolStrategy,
  executeVoiceAssistantTool,
  getVoiceAssistantTools,
  getAssistantDateContext,
  type AssistantToolStrategy,
} from '@/lib/voice-assistant';
import type {
  AssistantHindiScript,
  AssistantLanguage,
  AssistantLanguageHint,
} from '@/lib/assistant-language';
import { resolveAssistantLanguageConfig } from '@/lib/assistant-language';
import type { AssistantPendingAction } from '@/lib/voice-assistant';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const TOOL_LOOP_LIMIT = 6;
const MODEL_CANDIDATES = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];

type AssistantResponsePayload = {
  response: string;
  language: AssistantLanguage;
  script?: AssistantHindiScript;
  pendingAction?: AssistantPendingAction;
  usedTools: string[];
  model: string;
};

function extractResponseText(response: { text: () => string }) {
  try {
    return response.text().trim();
  } catch {
    return '';
  }
}

async function runAssistantWithModel(
  query: string,
  userId: string,
  language: AssistantLanguage,
  script: AssistantHindiScript | undefined,
  modelName: string,
  strategy: AssistantToolStrategy
): Promise<AssistantResponsePayload> {
  const tools =
    strategy === 'cash_entry_add'
      ? getVoiceAssistantTools(['prepare_cash_entry'])
      : VOICE_ASSISTANT_TOOLS;
  const baseSystemInstruction = buildAssistantSystemInstruction(language, getAssistantDateContext(), script);
  const systemInstruction =
    strategy === 'cash_entry_add'
      ? `${baseSystemInstruction}\nThis request has already been classified as a daily cash entry add command.\nUse prepare_cash_entry for it.\nDo not use entity search or ledger logic for names mentioned in the narration.`
      : baseSystemInstruction;
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: modelName,
    tools,
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingMode.AUTO,
      },
    },
    systemInstruction,
  });

  const chat = model.startChat({
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024,
    },
  });

  let result = await chat.sendMessage(query);
  const usedTools = new Set<string>();
  let pendingAction: AssistantPendingAction | undefined;

  for (let loop = 0; loop < TOOL_LOOP_LIMIT; loop += 1) {
    const functionCalls = result.response.functionCalls() ?? [];

    if (!functionCalls.length) {
      const text = extractResponseText(result.response) || (pendingAction ? buildBillConfirmationFallback(pendingAction) : '');

      return {
        response: text || buildAssistantReplyFallback(language, script, 'could_not_complete'),
        language,
        script,
        pendingAction,
        usedTools: Array.from(usedTools),
        model: modelName,
      };
    }

    const functionResponses: Part[] = [];

    for (const functionCall of functionCalls) {
      usedTools.add(functionCall.name);

      const toolResult = await executeVoiceAssistantTool(functionCall.name, functionCall.args, {
        userId,
        language,
        script,
      });

      if ('pendingAction' in toolResult && toolResult.pendingAction) {
        pendingAction = toolResult.pendingAction;
      }

      functionResponses.push({
        functionResponse: {
          name: functionCall.name,
          response: toolResult,
        },
      });
    }

    result = await chat.sendMessage(functionResponses);
  }

  const fallbackText = pendingAction
    ? buildBillConfirmationFallback(pendingAction)
    : buildAssistantReplyFallback(language, script, 'need_context');

  return {
    response: fallbackText,
    language,
    script,
    pendingAction,
    usedTools: Array.from(usedTools),
    model: modelName,
  };
}

async function runAssistant(
  query: string,
  userId: string,
  language: AssistantLanguage,
  script: AssistantHindiScript | undefined,
  strategy: AssistantToolStrategy
) {
  let lastError: Error | null = null;

  for (const modelName of MODEL_CANDIDATES) {
    try {
      return await runAssistantWithModel(query, userId, language, script, modelName, strategy);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Assistant model failed');
    }
  }

  throw lastError || new Error('All assistant models failed');
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'AI service is not configured. Please add GEMINI_API_KEY.' },
        { status: 503 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const bodyObj =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : ({} as Record<string, unknown>);
    const query = typeof bodyObj.query === 'string' ? bodyObj.query.trim() : '';
    const languageHint: AssistantLanguageHint =
      bodyObj.languageHint === 'hi' || bodyObj.languageHint === 'en' ? (bodyObj.languageHint as 'hi' | 'en') : 'auto';

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const { language, script } = resolveAssistantLanguageConfig(query, languageHint);
    const strategy = detectAssistantToolStrategy(query);
    const assistantResult = await runAssistant(query, userId, language, script, strategy);

    return NextResponse.json({
      success: true,
      response: assistantResult.response,
      language: assistantResult.language,
      script: assistantResult.script,
      pendingAction: assistantResult.pendingAction,
      meta: {
        usedTools: assistantResult.usedTools,
        model: assistantResult.model,
        today: getAssistantDateContext().todayIso,
      },
    });
  } catch (error) {
    console.error('Voice assistant error:', error);

    return NextResponse.json(
      { error: 'AI service error' },
      { status: 503 }
    );
  }
}

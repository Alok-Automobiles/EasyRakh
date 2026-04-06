import { GoogleGenerativeAI, FunctionCallingMode } from '@google/generative-ai';
import type { Part } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth';
import {
  VOICE_ASSISTANT_TOOLS,
  buildAssistantSystemInstruction,
  buildBillConfirmationFallback,
  executeVoiceAssistantTool,
  getAssistantDateContext,
  isHindiQuery,
} from '@/lib/voice-assistant';
import type { AssistantPendingAction } from '@/lib/voice-assistant';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const TOOL_LOOP_LIMIT = 6;
const MODEL_CANDIDATES = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];

type AssistantResponsePayload = {
  response: string;
  language: 'hi' | 'en';
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
  language: 'hi' | 'en',
  modelName: string
): Promise<AssistantResponsePayload> {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: modelName,
    tools: VOICE_ASSISTANT_TOOLS,
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingMode.AUTO,
      },
    },
    systemInstruction: buildAssistantSystemInstruction(language, getAssistantDateContext()),
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
        response: text || 'I could not complete that request right now.',
        language,
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
    : 'I need a little more context to complete that request.';

  return {
    response: fallbackText,
    language,
    pendingAction,
    usedTools: Array.from(usedTools),
    model: modelName,
  };
}

async function runAssistant(query: string, userId: string, language: 'hi' | 'en') {
  let lastError: Error | null = null;

  for (const modelName of MODEL_CANDIDATES) {
    try {
      return await runAssistantWithModel(query, userId, language, modelName);
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

    const body = await request.json();
    const query = typeof body?.query === 'string' ? body.query.trim() : '';

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const language = isHindiQuery(query) ? 'hi' : 'en';
    const assistantResult = await runAssistant(query, userId, language);

    return NextResponse.json({
      success: true,
      response: assistantResult.response,
      language: assistantResult.language,
      pendingAction: assistantResult.pendingAction,
      meta: {
        usedTools: assistantResult.usedTools,
        model: assistantResult.model,
        today: getAssistantDateContext().todayIso,
      },
    });
  } catch (error) {
    console.error('Voice assistant error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      { error: `AI service error: ${errorMessage}` },
      { status: 503 }
    );
  }
}

import { parseEnv } from './env.ts';

import { getExceptionMessage } from '@first2apply/core';
import { SupabaseClient } from '@supabase/supabasefork';
import OpenAI from 'openai';

import { ILogger } from './logger.ts';

// Type for OpenAI API response with usage information
export type OpenAIResponse = {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

const env = parseEnv();

const SUPPORTED_MODELS = ['gpt-4o', 'gpt-4o-mini'] as const;
type SupportedModel = (typeof SUPPORTED_MODELS)[number];

const COST_PER_MODEL: Record<SupportedModel, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

export type OpenAiConfig = {
  apiKey: string;
};

export function buildOpenAiClient({ modelName }: { modelName?: SupportedModel }) {
  const requestedModel = modelName ?? 'gpt-4o';
  if (!(requestedModel in COST_PER_MODEL)) {
    throw new Error(`Unsupported model: ${requestedModel}`);
  }

  if (env.aiProvider === 'local') {
    // Route the OpenAI client at a local OpenAI-compatible server (Ollama).
    // No API key, no per-token cost. The requested gpt-4o/gpt-4o-mini name is
    // mapped to the single local model; call sites stay unchanged.
    const openAi = new OpenAI({
      baseURL: env.ollamaUrl,
      apiKey: 'local',
    });
    console.log(`Using local model ${env.ollamaModel} (mapped from ${requestedModel}) via ${env.ollamaUrl}.`);
    const llmConfig = {
      model: env.ollamaModel,
      costPerMillionInputTokens: 0,
      costPerMillionOutputTokens: 0,
    };
    return { openAi, llmConfig };
  }

  const openAi = new OpenAI({
    apiKey: env.openAiConfig.apiKey,
  });
  console.log(`Using model ${requestedModel} for OpenAI calls.`);
  const { input, output } = COST_PER_MODEL[requestedModel];
  const llmConfig = {
    model: requestedModel,
    costPerMillionInputTokens: input,
    costPerMillionOutputTokens: output,
  };

  return { openAi, llmConfig };
}

export type LLMConfig = {
  model: string;
  costPerMillionInputTokens: number;
  costPerMillionOutputTokens: number;
};

function computeLlmApiCallCost({ llmConfig, response }: { llmConfig: LLMConfig; response: OpenAIResponse }) {
  const inputTokensUsed = response.usage?.prompt_tokens ?? 0;
  const outputTokensUsed = response.usage?.completion_tokens ?? 0;
  const cost =
    (llmConfig.costPerMillionInputTokens / 1_000_000) * inputTokensUsed +
    (llmConfig.costPerMillionOutputTokens / 1_000_000) * outputTokensUsed;

  return { cost, inputTokensUsed, outputTokensUsed };
}

export async function logAiUsage({
  logger,
  supabaseAdminClient,
  forUserId,
  llmConfig,
  response,
}: {
  logger: ILogger;
  supabaseAdminClient: SupabaseClient;
  forUserId: string;
  llmConfig: LLMConfig;
  response: OpenAIResponse;
}) {
  const { cost, inputTokensUsed, outputTokensUsed } = computeLlmApiCallCost({
    llmConfig,
    response,
  });

  // persist the cost of the OpenAI API call
  const { error: countUsageError } = await supabaseAdminClient.rpc('log_ai_usage', {
    for_user_id: forUserId,
    cost_increment: cost,
    input_tokens_increment: inputTokensUsed,
    output_tokens_increment: outputTokensUsed,
  });
  if (countUsageError) {
    logger.error(getExceptionMessage(countUsageError));
  }
}

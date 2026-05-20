import { getExceptionMessage } from '@first2apply/core';

import { CORS_HEADERS } from '../_shared/cors.ts';
import { getEdgeFunctionContext } from '../_shared/edgeFunctions.ts';
import { createLoggerWithMeta } from '../_shared/logger.ts';
import { buildOpenAiClient, logAiUsage } from '../_shared/openAI.ts';
import { evaluateJobSystemPrompt } from '../_shared/careerOpsPrompts.ts';

type EvaluateJobBody = { job_id: number };

const ARCHETYPES = ['LLMOps', 'Agentic', 'PM', 'SA', 'FullStack', 'Transformation', 'Other'] as const;
type Archetype = (typeof ARCHETYPES)[number];

type EvaluateBlocks = {
  role_summary: string;
  cv_match: string;
  level_strategy: string;
  comp_research: string;
  personalization: string;
  interview_prep: string;
};

type EvaluateResult = {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  archetype: Archetype;
  blocks: EvaluateBlocks;
};

function gradeFromScore(score: number): EvaluateResult['grade'] {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function coerceResult(raw: unknown): EvaluateResult {
  if (!raw || typeof raw !== 'object') throw new Error('LLM did not return a JSON object');
  const r = raw as Record<string, unknown>;

  const score = Math.max(0, Math.min(100, Math.round(Number(r.score))));
  if (!Number.isFinite(score)) throw new Error('LLM did not return a numeric score');

  const grade = typeof r.grade === 'string' && ['A', 'B', 'C', 'D', 'F'].includes(r.grade)
    ? (r.grade as EvaluateResult['grade'])
    : gradeFromScore(score);

  const archetypeRaw = typeof r.archetype === 'string' ? r.archetype : 'Other';
  const archetype = (ARCHETYPES as readonly string[]).includes(archetypeRaw)
    ? (archetypeRaw as Archetype)
    : 'Other';

  const b = (r.blocks ?? {}) as Record<string, unknown>;
  const blocks: EvaluateBlocks = {
    role_summary: String(b.role_summary ?? ''),
    cv_match: String(b.cv_match ?? ''),
    level_strategy: String(b.level_strategy ?? ''),
    comp_research: String(b.comp_research ?? ''),
    personalization: String(b.personalization ?? ''),
    interview_prep: String(b.interview_prep ?? ''),
  };

  return { score, grade, archetype, blocks };
}

// deno-lint-ignore no-explicit-any
async function checkFeatureFlag(supabaseClient: any, userId: string): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('career_ops_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return !!data?.career_ops_enabled;
}

const DAILY_EVAL_QUOTA = 200;

// deno-lint-ignore no-explicit-any
async function checkDailyQuota(supabaseClient: any, userId: string): Promise<{ ok: boolean; used: number }> {
  const horizon = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseClient
    .from('evaluations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('score', 'is', null)
    .gte('created_at', horizon);
  if (error) throw error;
  const used = count ?? 0;
  return { ok: used < DAILY_EVAL_QUOTA, used };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const logger = createLoggerWithMeta({ function: 'evaluate-job' });
  try {
    const context = await getEdgeFunctionContext({ logger, req, checkAuthorization: true });
    const { supabaseClient, supabaseAdminClient, user } = context;
    if (!user) {
      return new Response(JSON.stringify({ error: { code: 'unauthenticated', message: 'No user' } }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const enabled = await checkFeatureFlag(supabaseClient, user.id);
    if (!enabled) {
      return new Response(
        JSON.stringify({ error: { code: 'feature_disabled', message: 'career_ops_enabled is off' } }),
        { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    const quota = await checkDailyQuota(supabaseClient, user.id);
    if (!quota.ok) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'quota_exceeded',
            message: `Daily evaluation cap of ${DAILY_EVAL_QUOTA} reached (${quota.used} used in last 24h). Try again later.`,
          },
        }),
        { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    const { job_id } = (await req.json()) as EvaluateJobBody;
    if (!job_id) throw new Error('job_id is required');

    const { data: cvRow, error: cvErr } = await supabaseClient
      .from('user_cv_profiles')
      .select('markdown')
      .eq('user_id', user.id)
      .maybeSingle();
    if (cvErr) throw cvErr;
    if (!cvRow?.markdown) {
      return new Response(
        JSON.stringify({ error: { code: 'no_master_cv', message: 'Upload a master CV first.' } }),
        { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    const { data: job, error: jobErr } = await supabaseClient
      .from('jobs')
      .select('id, title, companyName, description, location, salary')
      .eq('id', job_id)
      .single();
    if (jobErr) throw jobErr;

    const userMsg = [
      `# Master CV`,
      cvRow.markdown,
      ``,
      `# Target Job`,
      `Title: ${job.title ?? ''}`,
      `Company: ${(job as { companyName?: string }).companyName ?? ''}`,
      job.location ? `Location: ${job.location}` : '',
      job.salary ? `Salary: ${job.salary}` : '',
      ``,
      `## Job Description`,
      job.description ?? '(no description available)',
    ]
      .filter(Boolean)
      .join('\n');

    const { openAi, llmConfig } = buildOpenAiClient({ modelName: 'gpt-4o-mini' });
    const response = await openAi.chat.completions.create({
      model: llmConfig.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: evaluateJobSystemPrompt },
        { role: 'user', content: userMsg },
      ],
    });

    await logAiUsage({ logger, supabaseAdminClient, forUserId: user.id, llmConfig, response });

    const raw = response.choices?.[0]?.message?.content?.trim() ?? '';
    if (!raw) throw new Error('LLM returned empty evaluation');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error(`LLM returned invalid JSON: ${getExceptionMessage(e)}`);
    }
    const result = coerceResult(parsed);

    const { error: upsertErr } = await supabaseClient
      .from('evaluations')
      .upsert(
        {
          job_id,
          user_id: user.id,
          score: result.score,
          grade: result.grade,
          archetype: result.archetype,
          blocks: result.blocks,
        },
        { onConflict: 'job_id,user_id' },
      );
    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (error) {
    logger.error(getExceptionMessage(error));
    return new Response(
      JSON.stringify({ error: { code: 'evaluate_failed', message: getExceptionMessage(error, true) } }),
      { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  }
});

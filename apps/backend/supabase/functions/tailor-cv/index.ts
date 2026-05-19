import { getExceptionMessage } from '@first2apply/core';

import { CORS_HEADERS } from '../_shared/cors.ts';
import { getEdgeFunctionContext } from '../_shared/edgeFunctions.ts';
import { createLoggerWithMeta } from '../_shared/logger.ts';
import { buildOpenAiClient, logAiUsage } from '../_shared/openAI.ts';
import { tailorCvSystemPrompt } from '../_shared/careerOpsPrompts.ts';

type TailorCvBody = { job_id: number };

async function checkFeatureFlag(
  // deno-lint-ignore no-explicit-any
  supabaseClient: any,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('career_ops_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return !!data?.career_ops_enabled;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const logger = createLoggerWithMeta({ function: 'tailor-cv' });
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

    const { job_id } = (await req.json()) as TailorCvBody;
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
      temperature: 0.3,
      messages: [
        { role: 'system', content: tailorCvSystemPrompt },
        { role: 'user', content: userMsg },
      ],
    });

    await logAiUsage({ logger, supabaseAdminClient, forUserId: user.id, llmConfig, response });

    const tailored = response.choices?.[0]?.message?.content?.trim() ?? '';
    if (!tailored) throw new Error('LLM returned empty tailored CV');

    const nowIso = new Date().toISOString();
    const { error: upsertErr } = await supabaseClient
      .from('evaluations')
      .upsert(
        {
          job_id,
          user_id: user.id,
          tailored_cv: tailored,
          tailored_cv_generated_at: nowIso,
        },
        { onConflict: 'job_id,user_id' },
      );
    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify({ tailored_cv: tailored }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (error) {
    logger.error(getExceptionMessage(error));
    return new Response(
      JSON.stringify({ error: { code: 'tailor_failed', message: getExceptionMessage(error, true) } }),
      { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  }
});

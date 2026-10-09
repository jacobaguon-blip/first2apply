import { getExceptionMessage } from '@first2apply/core';

import { CORS_HEADERS } from '../_shared/cors.ts';
import { getEdgeFunctionContext } from '../_shared/edgeFunctions.ts';
import { createLoggerWithMeta } from '../_shared/logger.ts';
import { buildOpenAiClient, logAiUsage } from '../_shared/openAI.ts';
import { generateReferralDraft } from '../_shared/referralDraft.ts';

type DraftReferralBody = { job_id: number; connection_id: number };

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
const fail = (code: string, message: string) => json({ error: { code, message } });

export const handle = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const logger = createLoggerWithMeta({ function: 'draft-referral' });
  try {
    const context = await getEdgeFunctionContext({ logger, req, checkAuthorization: true });
    const { supabaseClient, supabaseAdminClient, user } = context;
    if (!user) return fail('unauthenticated', 'No user');

    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('career_ops_enabled')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.career_ops_enabled) return fail('feature_disabled', 'career_ops_enabled is off');

    const { job_id, connection_id } = (await req.json()) as DraftReferralBody;
    if (!job_id || !connection_id) throw new Error('job_id and connection_id are required');

    // The contact must be one of this user's contacts at the job's company (also proves ownership).
    const { data: contacts, error: contactsError } = await supabaseClient.rpc('get_job_contacts', { p_job_id: job_id });
    if (contactsError) throw contactsError;
    const contact = (contacts ?? []).find((c: { connection_id: number }) => c.connection_id === connection_id);
    if (!contact) return fail('contact_not_at_company', "That contact is not at this job's company.");

    const { data: job, error: jobError } = await supabaseClient
      .from('jobs')
      .select('id, title, companyName, description')
      .eq('id', job_id)
      .single();
    if (jobError) throw jobError;

    // Prefer the CV tailored for this job, fall back to the master CV.
    const { data: evaluation } = await supabaseClient
      .from('evaluations')
      .select('tailored_cv')
      .eq('job_id', job_id)
      .eq('user_id', user.id)
      .maybeSingle();
    let cvMarkdown: string | null = evaluation?.tailored_cv ?? null;
    if (!cvMarkdown) {
      const { data: cvRow, error: cvError } = await supabaseClient
        .from('user_cv_profiles')
        .select('markdown')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cvError) throw cvError;
      cvMarkdown = cvRow?.markdown ?? null;
    }
    if (!cvMarkdown) return fail('no_master_cv', 'Upload a master CV first.');

    const { openAi, llmConfig } = buildOpenAiClient({ modelName: 'gpt-4o-mini' });
    const { draft, response } = await generateReferralDraft({
      openAi,
      llmConfig,
      input: {
        contactFirstName: contact.first_name,
        contactPosition: contact.position_title,
        contactCompany: contact.company,
        connectedOnIso: contact.connected_on,
        jobTitle: job.title,
        jobCompany: job.companyName,
        jobDescription: job.description ?? null,
        cvMarkdown,
      },
    });
    await logAiUsage({ logger, supabaseAdminClient, forUserId: user.id, llmConfig, response });

    // Regenerating keeps an existing status (for example "asked"), a new row starts as "drafted".
    const { data: existing, error: existingError } = await supabaseClient
      .from('referral_outreach')
      .select('id')
      .eq('user_id', user.id)
      .eq('job_id', job_id)
      .eq('connection_id', connection_id)
      .maybeSingle();
    if (existingError) throw existingError;

    const write = existing
      ? supabaseClient.from('referral_outreach').update({ draft }).eq('id', existing.id).select().single()
      : supabaseClient
          .from('referral_outreach')
          .insert({ user_id: user.id, job_id, connection_id, draft, status: 'drafted' })
          .select()
          .single();
    const { data: row, error: writeError } = await write;
    if (writeError) throw writeError;

    return json({ outreach: row });
  } catch (error) {
    logger.error(`draft-referral failed: ${getExceptionMessage(error)}`);
    return fail('draft_failed', getExceptionMessage(error, true));
  }
};

if (import.meta.main) Deno.serve(handle);

import { AiFilterProfile, DbSchema, Job, JobStatus, throwError } from '@first2apply/core';
import { SupabaseClient } from '@supabase/supabasefork';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { ILogger } from './logger.ts';
import { buildOpenAiClient, logAiUsage } from './openAI.ts';
import { checkUserSubscription } from './subscription.ts';

/**
 * Apply all the advanced matching rules to the given job and
 * determine if it should be excluded from the user's feed.
 */
export async function applyAdvancedMatchingFilters({
  logger,
  supabaseClient,
  supabaseAdminClient,
  job,
}: {
  logger: ILogger;
  supabaseClient: SupabaseClient<DbSchema, 'public'>;
  supabaseAdminClient: SupabaseClient<DbSchema, 'public'>;
  job: Job;
}): Promise<{ newStatus: JobStatus; excludeReason?: string }> {
  logger.info(`applying advanced matching filters to job ${job.id} ...`);
  // check if the user has advanced matching enabled
  const { hasAdvancedMatching } = await checkUserSubscription({
    supabaseAdminClient,
    userId: job.user_id,
  });
  if (!hasAdvancedMatching) {
    logger.info('user does not have advanced matching enabled');
    return { newStatus: 'new' };
  }

  // resolve the filter profile for this job:
  //  1. if the job's source link has filter_profile_id set -> load that profile
  //  2. else -> load the user's default profile (is_default = true)
  const filterProfile = await resolveFilterProfileForJob({
    logger,
    supabaseClient,
    job,
  });

  // load the user's GLOBAL blacklist from advanced_matching.blacklisted_companies
  // (advanced_matching.chatgpt_prompt was dropped; blacklisted_companies is now the global list)
  const { data: advancedMatchingArr, error: getAdvancedMatchingErr } = await supabaseClient
    .from('advanced_matching')
    .select('*')
    .eq('user_id', job.user_id);
  if (getAdvancedMatchingErr) {
    throw getAdvancedMatchingErr;
  }
  const globalBlacklist: string[] = advancedMatchingArr?.[0]?.blacklisted_companies ?? [];

  // union of global blacklist + profile-specific blacklist (deduped, case-insensitive)
  const profileBlacklist = filterProfile?.blacklisted_companies ?? [];
  const mergedBlacklist = dedupeCaseInsensitive([...globalBlacklist, ...profileBlacklist]);

  // exclude jobs from specific companies if it fully matches the entire company name
  if (isExcludedCompanyByList({ companyName: job.companyName, blacklist: mergedBlacklist })) {
    logger.info(`job excluded due to company name: ${job.companyName}`);
    return {
      newStatus: 'excluded_by_advanced_matching',
      excludeReason: `${job.companyName} is blacklisted.`,
    };
  }

  // if no filter profile at all -> skip AI filtering entirely (job stays 'new')
  if (!filterProfile) {
    logger.info(`no ai filter profile for job ${job.id} (link_id=${job.link_id ?? 'null'}); skipping AI filter`);
    return { newStatus: 'new' };
  }

  logger.info(
    `using ai filter profile for job ${job.id}: profile_id=${filterProfile.id} name="${filterProfile.name}" is_default=${filterProfile.is_default}`,
  );

  // prompt OpenAI to determine if the job should be excluded
  if (job.description && filterProfile.chatgpt_prompt) {
    logger.info('prompting OpenAI to determine if the job should be excluded ...');

    const { exclusionDecision } = await promptOpenAI({
      prompt: filterProfile.chatgpt_prompt,
      job,
      logger,
      supabaseAdminClient,
    });

    if (exclusionDecision.excluded) {
      logger.info(`job excluded by OpenAI: ${exclusionDecision.reason}`);
      return {
        newStatus: 'excluded_by_advanced_matching',
        excludeReason: exclusionDecision.reason ?? undefined,
      };
    }
  }

  logger.info('job passed all advanced matching filters');
  return { newStatus: 'new' };
}

/**
 * Resolve which AiFilterProfile applies to the given job.
 * - Prefer the profile set on the job's source link (links.filter_profile_id).
 * - Otherwise, fall back to the user's default profile (is_default = true).
 * - Returns null if neither exists.
 */
export async function resolveFilterProfileForJob({
  logger,
  supabaseClient,
  job,
}: {
  logger: ILogger;
  supabaseClient: SupabaseClient<DbSchema, 'public'>;
  job: Pick<Job, 'id' | 'user_id' | 'link_id'>;
}): Promise<AiFilterProfile | null> {
  // 1. Look up the link the job came from. Scope by user_id defensively so this is safe
  //    even when called with a service-role client (e.g. from customJobsParser).
  let linkFilterProfileId: number | null = null;
  if (job.link_id) {
    const { data: linkRow, error: linkErr } = await supabaseClient
      .from('links')
      .select('filter_profile_id')
      .eq('id', job.link_id)
      .eq('user_id', job.user_id)
      .maybeSingle();
    if (linkErr) {
      logger.error(`failed to load link ${job.link_id} for job ${job.id}: ${linkErr.message}`);
    } else {
      linkFilterProfileId = linkRow?.filter_profile_id ?? null;
    }
  }

  // 2. Prefer the explicit profile on the link, falling back to the user's default.
  //    Both queries scope by user_id, so service-role and user-scoped clients behave identically.
  if (linkFilterProfileId !== null) {
    const { data: explicit, error: explicitErr } = await supabaseClient
      .from('ai_filter_profiles')
      .select('*')
      .eq('id', linkFilterProfileId)
      .eq('user_id', job.user_id)
      .maybeSingle();
    if (explicitErr) {
      logger.error(`failed to load explicit profile ${linkFilterProfileId} for job ${job.id}: ${explicitErr.message}`);
    } else if (explicit) {
      return explicit as AiFilterProfile;
    }
  }

  const { data: defaultProfile, error: defaultErr } = await supabaseClient
    .from('ai_filter_profiles')
    .select('*')
    .eq('user_id', job.user_id)
    .eq('is_default', true)
    .maybeSingle();
  if (defaultErr) {
    logger.error(`failed to load default profile for job ${job.id}: ${defaultErr.message}`);
    return null;
  }
  return (defaultProfile as AiFilterProfile | null) ?? null;
}

function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function isExcludedCompanyByList({ companyName, blacklist }: { companyName: string; blacklist: string[] }): boolean {
  const lower = companyName.toLowerCase();
  return blacklist.some((c) => c.toLowerCase() === lower);
}

/**
 * Prompt the OpenAI API to interogate if a job matches the user prompt.
 * Returns true if the job should be excluded, false otherwise.
 */
async function promptOpenAI({
  prompt,
  job,

  logger,
  supabaseAdminClient,
}: {
  job: Job;
  prompt: string;
  logger: ILogger;
  supabaseAdminClient: SupabaseClient<DbSchema, 'public'>;
}) {
  const { llmConfig, openAi } = buildOpenAiClient({
    modelName: 'gpt-4o',
  });

  const response = await openAi.chat.completions.create({
    model: llmConfig.model,
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: generateUserPrompt({
          prompt,
          job,
        }),
      },
    ],
    max_completion_tokens: 3000,
    response_format: zodResponseFormat(JobExclusionFormat, 'JobExclusion'),
  });

  const choice = response.choices[0];
  if (choice.finish_reason !== 'stop') {
    throw new Error(`OpenAI response did not finish: ${choice.finish_reason}`);
  }
  const exclusionDecision = JobExclusionFormat.parse(
    JSON.parse(choice.message.content ?? throwError('missing content')),
  );

  // persist the cost of the OpenAI API call
  await logAiUsage({
    logger,
    supabaseAdminClient,
    forUserId: job.user_id,
    llmConfig,
    response,
  });

  return {
    exclusionDecision,
  };
}

/**
 * Generate the user prompt for the OpenAI API.
 */
function generateUserPrompt({ prompt, job }: { prompt: string; job: Job }) {
  // - Exclude jobs with the title "Senior" or "Lead".
  // - I'm from the UK, so only want jobs that allow working remotely from the UK.
  // - Do not include jobs that require working with Python or Java.
  // - Do not want to work with Style Components.
  // - Salary should be at least $80,000 per year.
  // - I'm from the UK, so only want jobs that allow working remotely from the UK.
  // - Exclude jobs with the title "Senior" or "Lead".
  return `Here are my requirements for job filtering:
${prompt}

Job Title: ${job.title}
Location: ${job.location ?? 'Not specified'}
Tags: ${job?.tags?.join(', ') ?? 'None'}
Job Description:
${job.description}

Based on my requirements, should this job be excluded from my feed?`;
}

const SYSTEM_PROMPT = `You are an assistant which helps users with their job search. You will have to analyze a job and decide if it should be discarded based on the user's requirements.
Following are the rules for filtering jobs: 
- if the user wants to avoid certain technologies or skills, the job should only be excluded if it explicitly mentions any of them.
- if the user is requesting a minimum salary, it should be fine if the job just says: "Up to x amount" or "Depending on experience". Also the currency can be ignored.
- if the job does not mention a salary range, ignore salary requirements by the user (this rule can be overridden by the user if they want to exclude jobs without a salary range).
- only consider a job description unsuitable based on remoteness if the user explicitly restricts their interest to certain locations (e.g., "fully remote jobs in the UK") and the description specifies otherwise (e.g., "remote only in Belgium")
- treat the absence of specific details (such as PTO days or remote work specifics) neutrally unless the user specifies that such details are a deciding factor.
- job level/title: only disqualify based on job level if the description clearly conflicts with the user's specified job level.
- contract type: do not disqualify if contract type is unspecified, unless explicitly required by the user.
- location/relocation: treat location neutrally unless the user specifies no willingness to relocate or a specific geographic preference.
- benefits/company culture: absence of benefits or cultural descriptors should not disqualify a job unless specifically stated by the user as a requirement.
- technological tools: only jobs mandating undesired technologies should be disqualified, absence of mention should be neutral.
- working hours: absence of detailed working hours should not disqualify a job unless specific hours are a user requirement.
- for experience, interpret any specified maximum or minimum years of experience in relation to what is stated in the job description. If the job specifies an experience range, the job should be considered a match if the user's requirement fits within this range or if the user's requirement aligns with the maximum experience mentioned. Absence of experience details in the job description should not disqualify the job unless the user explicitly requires experience details to be mentioned.

Really important, if there are any ambiguities between the user's requirements and the job, never exclude it.

Reply with a JSON object containing the following fields:
- excluded: boolean (true if the job should be excluded, false otherwise)
- reason: string (the reason why the job should be excluded; leave this field empty if the job should not be excluded)
- keep the reason as short as possible, maximum 20 words.
`;

const JobExclusionFormat = z.object({
  excluded: z.boolean(),
  reason: z.string().optional().nullable().nullable(),
});

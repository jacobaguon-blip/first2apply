import { Job, getExceptionMessage } from '@first2apply/core';

import { applyAdvancedMatchingFilters } from '../_shared/advancedMatching.ts';
import { CORS_HEADERS } from '../_shared/cors.ts';
import { getEdgeFunctionContext } from '../_shared/edgeFunctions.ts';
import { createLoggerWithMeta } from '../_shared/logger.ts';

/**
 * Re-run advanced-matching filters across the caller's existing jobs.
 *
 * Triggered from the AI Filters page after the user edits a prompt/blacklist
 * and wants their backlog re-evaluated under the new rules. Without this,
 * existing jobs keep whatever status `scan-job-description` assigned them at
 * detection time — a stale prompt forever for old jobs.
 *
 * By default, evaluates both 'new' jobs (so newly-tightened rules push them
 * into the excluded bucket) and 'excluded_by_advanced_matching' jobs (so
 * newly-loosened rules bring them back to 'new'). The caller may opt out of
 * the excluded sweep via `includeExcluded=false` to save OpenAI cost.
 */
export const handle = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const logger = createLoggerWithMeta({
    function: 'reapply-filter-profile',
  });
  try {
    const context = await getEdgeFunctionContext({
      logger,
      req,
      checkAuthorization: true,
    });
    const { supabaseClient, supabaseAdminClient, user } = context;

    if (!user) {
      throw new Error('user-scoped auth required to re-apply filters');
    }

    const body: { includeExcluded?: boolean } = await req.json().catch(() => ({}));
    const includeExcluded = body.includeExcluded !== false;

    const statuses = includeExcluded ? ['new', 'excluded_by_advanced_matching'] : ['new'];

    logger.info(`re-applying filters for user ${user.id} (statuses=${statuses.join(',')}) ...`);

    const { data: jobs, error: listErr } = await supabaseClient
      .from('jobs')
      .select('*')
      .eq('user_id', user.id)
      .in('status', statuses);
    if (listErr) {
      throw listErr;
    }

    let evaluated = 0;
    let kept = 0;
    let excluded = 0;
    let unchanged = 0;
    let errors = 0;

    for (const job of (jobs ?? []) as Job[]) {
      try {
        // Skip jobs without a description — the filter has nothing to evaluate.
        // These were likely failed parses; they'll be re-evaluated next time
        // scan-job-description succeeds for them.
        if (!job.description) {
          continue;
        }

        evaluated += 1;

        const { newStatus, excludeReason } = await applyAdvancedMatchingFilters({
          logger,
          job,
          supabaseClient,
          supabaseAdminClient,
        });

        const statusChanged = newStatus !== job.status;
        const reasonChanged = (excludeReason ?? null) !== (job.exclude_reason ?? null);
        if (!statusChanged && !reasonChanged) {
          unchanged += 1;
          if (newStatus === 'excluded_by_advanced_matching') excluded += 1;
          else kept += 1;
          continue;
        }

        const { error: updateErr } = await supabaseClient
          .from('jobs')
          .update({
            status: newStatus,
            exclude_reason: excludeReason ?? null,
            updated_at: new Date(),
          })
          .eq('id', job.id)
          .eq('user_id', user.id)
          // Only flip jobs we listed — guards against a concurrent scan
          // transitioning the job into 'applied' / 'archived' / 'deleted'
          // between our select and our update.
          .in('status', statuses);
        if (updateErr) {
          throw updateErr;
        }

        if (newStatus === 'excluded_by_advanced_matching') excluded += 1;
        else kept += 1;
      } catch (err) {
        errors += 1;
        logger.error(`re-apply failed for job ${job.id}: ${getExceptionMessage(err)}`);
      }
    }

    const result = {
      total: jobs?.length ?? 0,
      evaluated,
      kept,
      excluded,
      unchanged,
      errors,
    };
    logger.info(`re-apply complete: ${JSON.stringify(result)}`);

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (error) {
    logger.error(getExceptionMessage(error));
    return new Response(JSON.stringify({ errorMessage: getExceptionMessage(error, true) }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
};

if (import.meta.main) {
  Deno.serve(handle);
}

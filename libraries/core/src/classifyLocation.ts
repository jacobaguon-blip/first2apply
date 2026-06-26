export const LOCATION_BUCKETS = ['remote', 'hybrid', 'onsite', 'unspecified'] as const;
export type LocationBucket = (typeof LOCATION_BUCKETS)[number];

/**
 * Classify a job location string into one of four buckets.
 *
 * IMPORTANT: this function is mirrored in two other places — keep them in sync
 * byte-for-byte (same regex, same precedence, same fallbacks):
 *   1. SQL: `public.classify_job_location(text)` (migration
 *      `apps/backend/supabase/migrations/20260528000000_sort_and_location.sql`)
 *   2. Deno edge function:
 *      `apps/backend/supabase/functions/_shared/filterJobsByLocation.ts`
 *
 * Known false positives (accepted for mirror simplicity): location strings that
 * mention "remote" as descriptive prose, e.g. "Remote office in NYC" or
 * "Remote-first HQ in Austin", classify as 'remote' even when the role is on-site.
 * Do NOT add lookahead/lookbehind to "fix" this — it complicates the SQL mirror
 * (Postgres regex has no lookbehind) and the false-positive rate is acceptable
 * because the user can still narrow via the "location contains" text input.
 */
export function classifyLocation(loc?: string | null): LocationBucket {
  if (!loc || !loc.trim()) return 'unspecified';
  if (/\bremote\b/i.test(loc)) return 'remote';
  if (/\bhybrid\b/i.test(loc)) return 'hybrid';
  return 'onsite';
}

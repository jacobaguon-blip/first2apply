export const LOCATION_BUCKETS = ['remote', 'hybrid', 'onsite', 'unspecified'] as const;
export type LocationBucket = (typeof LOCATION_BUCKETS)[number];

export function classifyLocation(loc?: string | null): LocationBucket {
  if (!loc || !loc.trim()) return 'unspecified';
  if (/\bremote\b/i.test(loc)) return 'remote';
  if (/\bhybrid\b/i.test(loc)) return 'hybrid';
  return 'onsite';
}

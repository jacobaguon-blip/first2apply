// Compile-time guard: types.ts keeps a local copy of LocationBucket (see note there).
import type { LocationBucket as ClassifierBucket } from './classifyLocation';
import type { AiFilterProfile } from './types';

export * from './error';
export * from './types';
export type { Database } from './database.types';
export * from './sdk';
export * from './date';
export * from './referral';
export * from './classifyLocation';

type _BucketsMatch = NonNullable<AiFilterProfile['location_buckets']>[number] extends ClassifierBucket
  ? ClassifierBucket extends NonNullable<AiFilterProfile['location_buckets']>[number]
    ? true
    : never
  : never;
export const _locationBucketsMatch: _BucketsMatch = true;

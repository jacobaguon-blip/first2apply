import { ILogger } from '../logger.ts';
import { JobSiteParseResult, ParsedJob } from './parserTypes.ts';

const SLUG_PATTERNS: RegExp[] = [
  /job-boards\.greenhouse\.io\/([a-z0-9_-]+)/i,
  /boards\.greenhouse\.io\/([a-z0-9_-]+)/i,
  /boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/i,
  /greenhouse\.io\/embed\/job_board\?for=([a-z0-9_-]+)/i,
];

/**
 * Detect whether the given URL or HTML refers to a Greenhouse-hosted job board.
 * Returns the company slug if detected.
 */
export function detectGreenhouse({ html, url }: { html: string; url: string }): { slug: string } | null {
  const haystacks = [url, html];
  for (const hay of haystacks) {
    for (const re of SLUG_PATTERNS) {
      const m = hay.match(re);
      if (m) return { slug: m[1].toLowerCase() };
    }
  }
  return null;
}

type GreenhouseJob = {
  id: number;
  title: string;
  absolute_url: string;
  company_name?: string;
  updated_at?: string;
  location?: { name?: string };
  departments?: Array<{ name?: string }>;
};

/**
 * Fetch jobs for a Greenhouse company slug via the public jobs API.
 * No auth required; response is plain JSON.
 */
export async function fetchGreenhouseJobs({
  siteId,
  slug,
  logger,
}: {
  siteId: number;
  slug: string;
  logger: ILogger;
}): Promise<JobSiteParseResult> {
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs`;
  logger.info(`[greenhouse-ats] fetching jobs for slug=${slug}`);
  const res = await fetch(apiUrl, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    logger.error(`[greenhouse-ats] API returned ${res.status} for slug=${slug}`);
    return { jobs: [], listFound: false, elementsCount: 0 };
  }

  const body = (await res.json()) as { jobs?: GreenhouseJob[] };
  const raw = body.jobs ?? [];
  logger.info(`[greenhouse-ats] API returned ${raw.length} jobs for slug=${slug}`);

  const jobs: ParsedJob[] = raw
    .filter((j) => j.id && j.title && j.absolute_url)
    .map((j): ParsedJob => {
      const locationName = j.location?.name?.trim();
      const isRemoteOnly = locationName ? /^remote$/i.test(locationName) : false;
      const mentionsRemote = locationName ? /remote/i.test(locationName) : false;
      const tags = (j.departments ?? [])
        .map((d) => d.name?.trim())
        .filter((x): x is string => !!x);

      return {
        siteId,
        externalId: String(j.id),
        externalUrl: j.absolute_url,
        title: j.title,
        companyName: j.company_name?.trim() || slug,
        location: isRemoteOnly ? undefined : locationName,
        jobType: mentionsRemote ? 'remote' : undefined,
        tags,
        labels: [],
      };
    });

  return { jobs, listFound: true, elementsCount: raw.length };
}

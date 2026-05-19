// Heuristics for recognizing company careers pages / ATS hosts.
// Shared between the main-process pending-link drainer (2-hop discovery)
// and the renderer's Add Search → Add Target steering.

export const CAREERS_PATH_HINTS = [
  '/careers', '/career', '/jobs', '/job', '/work-with-us', '/join-us', '/joinus',
  '/opportunities', '/positions', '/openings', '/recruiting', '/recruit',
  '/boards', '/board', '/embed/job_board', '/hiring', '/we-are-hiring',
  '/wd1', '/wd2', '/wd3', '/wd5',
];

export const CAREERS_HOST_HINTS = [
  'greenhouse.io', 'lever.co', 'workday.com', 'myworkdayjobs.com', 'ashbyhq.com',
  'jobvite.com', 'smartrecruiters.com', 'taleo.net', 'icims.com', 'paylocity.com',
  'rippling.com', 'breezy.hr', 'recruitee.com', 'bamboohr.com', 'recruiterbox.com',
];

export function looksLikeCareersUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = (u.pathname + (u.hash || '')).toLowerCase();
    const host = u.hostname.toLowerCase();
    if (CAREERS_PATH_HINTS.some((hint) => path.includes(hint))) return true;
    if (CAREERS_HOST_HINTS.some((hint) => host === hint || host.endsWith('.' + hint))) return true;
    return false;
  } catch {
    return false;
  }
}

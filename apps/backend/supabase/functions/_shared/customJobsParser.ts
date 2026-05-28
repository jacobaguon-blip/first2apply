import { Job, throwError } from '@first2apply/core';
import { DbSchema, User } from '@first2apply/core';
import { SupabaseClient } from '@supabase/supabasefork';
import { DOMParser, Element } from 'deno-dom-wasm';
import { zodResponseFormat } from 'openai/helpers/zod';
import turndown from 'turndown';
import { z } from 'zod';

import { resolveFilterProfileForJob } from './advancedMatching.ts';
import { denoHashString } from './deno.ts';
import { JobDescriptionUpdates } from './jobDescriptionParser.ts';
import { ILogger } from './logger.ts';
import { chunkMarkdown } from './markdownChunker.ts';
import { buildOpenAiClient, logAiUsage, OpenAIResponse } from './openAI.ts';
import { detectGreenhouse, fetchGreenhouseJobs } from './parsers/greenhouseAts.ts';
import { JobSiteParseResult, ParsedJob } from './parsers/parserTypes.ts';

/**
 * Method used to parse jobs from custom pages.
 * Will use AI to extract the jobs from the HTML.
 */
export async function parseCustomJobs({
  siteId,
  html,
  url,
  user,
  ...context
}: {
  siteId: number;
  html: string;
  url: string;
  user: User;

  // dependencies
  logger: ILogger;
  supabaseAdminClient: SupabaseClient<DbSchema, 'public'>;
}): Promise<JobSiteParseResult> {
  const { logger } = context;

  // Fast-path: if this URL or its HTML reveals a known ATS (e.g. Greenhouse),
  // fetch the structured jobs feed directly instead of paying for LLM extraction.
  const greenhouse = detectGreenhouse({ html, url });
  if (greenhouse) {
    logger.info(`[custom-parser] detected Greenhouse ATS, slug=${greenhouse.slug}`);
    return fetchGreenhouseJobs({ siteId, slug: greenhouse.slug, logger });
  }

  const { openAi, llmConfig } = buildOpenAiClient({
    modelName: 'gpt-4o',
    ...context,
  });

  // Build cleaned markdown once, then chunk it. The local model has a much
  // smaller usable context than gpt-4o, so big index pages (e.g. ~450 listings)
  // must be split into chunks and merged — never silently truncated.
  const document = new DOMParser().parseFromString(html, 'text/html');
  if (!document || !document.documentElement) throw new Error('Could not parse html');

  const headerInfo = extractHeaderInfo(document.documentElement);
  logger.info(
    `page title: ${headerInfo.title}, description: ${headerInfo.metaDescription}, favicon: ${headerInfo.faviconUrl}`,
  );

  const nodesToRemove = ['head', 'script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 'img', 'form'];
  stripNodes(document.documentElement, nodesToRemove);
  stripAttributes(document.documentElement, /^(class|style|aria-.*|role)$/);
  const fullMarkdown = turndownService.turndown(document.documentElement?.outerHTML ?? '');

  const chunks = chunkMarkdown(fullMarkdown, { maxChars: PARSE_CHUNK_MAX_CHARS, overlapChars: PARSE_CHUNK_OVERLAP });
  logger.info(`custom parser content size: ${fullMarkdown.length} chars (markdown), split into ${chunks.length} chunk(s)`);

  const buildUserPrompt = (chunkContent: string) =>
    `Extract the jobs listing from the page content below. Return the result as a JSON object matching the provided schema. If no jobs are found, return an empty array for the jobs field.
Here are some rules for the required output:
- The externalId field should be a unique identifier for the job, preferably from the job site.
  Try to extract it from the job URL or any data attributes.
  If not available, create one based on the job title and company name.
- The externalUrl field should be the direct URL to the job listing. It should be a fully qualified URL. If only a relative URL is available, prepend the domain name from the page URL: ${url}. Should never be an email address.
- The title field should be the job title.
- The companyName field should be the name of the company offering the job.
- The companyLogo field should be a URL to the company's logo, if available. If not available, try to use the site favicon URL: ${headerInfo.faviconUrl}. If the logo URL is relative, prepend the domain name from the page URL: ${url}.
- The jobType field should indicate if the job is remote, hybrid, or onsite. If not specified, leave it empty.
- The location field should specify the job's location, if available.
    Add the full location as provided including street, city, state, country if available. If only "remote" is mentioned, leave the location empty and set jobType to "remote".
- The salary field should specify the offered salary or salary range, if available. Always try to extract it if present. If there are other benefits mentioned (e.g. stock options, bonuses), do not include them in the salary field, but put them as tags.
- The tags field should include relevant tags or keywords associated with the job, if available. If you see "easy apply" on a job add it as a tag. Or if the job is sponsored.

Extract every job present in the content below. Preserve the order of the jobs as they appear on the page.

Here is the page header info:
${JSON.stringify(headerInfo)}

Here is the page content (HTML converted to markdown):
"""
${chunkContent}
"""`;

  // Parse each chunk, merge, then dedupe + apply the page-wide cap once.
  const rawJobs: z.infer<typeof JOB_SCHEMA>[] = [];
  let listFound = true;
  for (let i = 0; i < chunks.length; i++) {
    const parseResult = await callJobsParse({
      openAi,
      llmConfig,
      userPrompt: buildUserPrompt(chunks[i]),
      logger,
      label: `${siteId} chunk ${i + 1}/${chunks.length}`,
    });

    if (parseResult.errorMessage) {
      logger.error(`Site ${siteId} chunk ${i + 1} - model reported an error: ${parseResult.errorMessage}`);
      // Only treat the page as "no list found" when the first/only chunk fails;
      // later-chunk errors shouldn't discard jobs already extracted upstream.
      if (i === 0 && chunks.length === 1) listFound = false;
      continue;
    }
    rawJobs.push(...parseResult.jobs);

    if (parseResult.response) {
      await logAiUsage({
        forUserId: user.id,
        llmConfig,
        response: parseResult.response,
        ...context,
      });
    }
  }

  // Dedupe by externalUrl (first occurrence wins, preserves page order), then
  // apply the page-wide max-30 cap once across the whole merged set.
  const seenUrls = new Set<string>();
  const dedupedJobs = rawJobs
    .filter((job) => {
      if (!job.externalUrl || seenUrls.has(job.externalUrl)) return false;
      seenUrls.add(job.externalUrl);
      return true;
    })
    .slice(0, MAX_JOBS_PER_PAGE);

  const jobs = await Promise.all(
    dedupedJobs.map(
      async (job): Promise<ParsedJob> => ({
        // hash the url to create a stable externalId if not provided
        externalId: await denoHashString(job.externalUrl),
        externalUrl: job.externalUrl,
        title: job.title,
        description: job.description || undefined,
        companyName: job.companyName,
        companyLogo: job.companyLogo || undefined,
        jobType: job.jobType || undefined,
        location: job.location || undefined,
        salary: job.salary || undefined,
        tags: job.tags || [],
        // associate with the site
        siteId,
        labels: [],
      }),
    ),
  ).then((jobs) => {
    // filter out invalid jobs
    return jobs.filter((job) => !!job.externalId && job.externalUrl?.startsWith('https://'));
  });

  return {
    jobs,
    listFound,
    elementsCount: jobs.length,
  };
}
const JOB_SCHEMA = z.object({
  externalUrl: z.string(),

  title: z.string().min(3).max(200),
  companyName: z.string().min(2).max(100),
  companyLogo: z.string().optional().nullable(),

  jobType: z.enum(['remote', 'hybrid', 'onsite']).optional().nullable(),
  location: z.string().max(100).optional().nullable(),
  salary: z.string().max(100).optional().nullable(),
  tags: z.array(z.string().max(50)).optional().nullable(),

  description: z.string().min(20).optional().nullable(),
});
// Per-chunk bound. The page-wide cap is enforced post-merge (MAX_JOBS_PER_PAGE),
// so this only needs to be high enough that a single dense chunk is not rejected
// (which would silently drop that chunk's jobs — the failure chunking prevents).
const PARSE_JOBS_PAGE_SCHEMA = z.object({
  jobs: z.array(JOB_SCHEMA).min(0).max(100),
  errorMessage: z.string().max(500).optional().nullable(),
});

// Chunking + cap constants. Sized for the local model's CPU inference budget:
// ~16k chars (~4-5k input tokens) leaves room for ~1.5k output tokens inside a
// pinned 16384 num_ctx (set via Modelfile on the qwen2.5:*-f2a variants), and
// keeps per-chunk wall time well within PARSE_CALL_TIMEOUT_MS on a Pi 5 CPU.
// The per-chunk schema bound is 100; max ~15 dense listings fit per chunk.
const PARSE_CHUNK_MAX_CHARS = 16_000;
const PARSE_CHUNK_OVERLAP = 500;
const MAX_JOBS_PER_PAGE = 30;
// 28 min per chunk: matches the probe's undici 30-min dispatcher headroom. On a
// Pi 5 CPU, multiple concurrent edge calls all queue inside Ollama (single CPU
// model is serialized), so individual requests routinely wait minutes in the
// queue before processing begins. A stricter timeout would kill legitimate
// queued requests. A real timeout still beats hanging the whole scan.
const PARSE_CALL_TIMEOUT_MS = 1_680_000;
const SYSTEM_PROMPT = `You are an expert web scraper specialized in extracting job listings from HTML pages. 
Your task is to analyze the provided HTML content and identify job listings, extracting relevant details for each job.
If you cannot extract the information due to the HTML being a login page, CAPTCHA, or any other access restriction, respond with an empty result and an appropriate errorMessage.

The externalUrl ideally should point to a dedicated page, not the same listing page and should be unique per job. It's the most important field to extract.
If the job description mentions a another URL where to apply, use that as externalUrl.

When composing the externalUrl or companyLogo with relative URLs, ensure to make it relative to the URL of the scraped page, not just the domain.
Here are some common examples of externalUrls from different popular job sites:
- talent.com: https://www.talent.com/view?id=1234567890abcdef
- linkedin.com: https://www.linkedin.com/jobs/view/1234567890/
- indeed.com: https://www.indeed.com/viewjob?jk=abcdef1234567890
- glassdoor.com: https://www.glassdoor.com/job-listing/software-engineer-google-JV_IC1234567_KO0,17_KE18,24.htm?jl=1234567890
- monster.com: https://www.monster.com/jobs/search/?q=Software-Engineer&where=Remote&jobid=1234567890
- google.com: https://www.google.com/about/careers/applications/jobs/results/132525933222339270-software-engineer-iii-aiml

If the user is trying to scrape a page that is just a single job description, return an empty jobs array and an appropriate errorMessage.

IMPORTANT: if the page is a job results page, but there are no jobs matching the filters, DON'T return an error, just return an empty jobs array and no errorMessage.
This is also valid for Google search results where the user might be looking for jobs from ATS sites (using the last 24h filter in Google search might return no results, but it's not an error, just that there are no jobs matching the criteria).

Here are some unsupported website:
- hiringcafe.com. - their html pages don't allow scraping.

Here are some other site specific notes:
- hnhiring.com 
  - this site is a forum, so the job posts are in forum post format.
  - VERY IMPORTANT: extract the description as the post content exactly as is, the original post body.
  - some posts are marked as "Multiple Roles", in that case extract the description as is, do not try to split into multiple jobs, each with their unique url (ATS sites preferred)
`;

/**
 * Parse jobs description from a custom job site.
 * Will use AI to extract the description from the HTML.
 */
export async function parseCustomJobDescription({
  html,
  user,
  job,
  ...context
}: {
  html: string;
  user: User;
  job: Job;

  // dependencies
  logger: ILogger;
  supabaseAdminClient: SupabaseClient<DbSchema, 'public'>;
}): Promise<JobDescriptionUpdates> {
  const document = new DOMParser().parseFromString(html, 'text/html');
  if (!document) throw new Error('Could not parse html');

  // Resolve the AI filter profile for this job (via its source link, or the user's default).
  // Used to personalize the job-description summary prompt.
  const filterProfile = await resolveFilterProfileForJob({
    logger: context.logger,
    supabaseClient: context.supabaseAdminClient,
    job,
  });
  if (filterProfile) {
    context.logger.info(
      `custom jd parser using ai filter profile id=${filterProfile.id} name="${filterProfile.name}" for job ${job.id}`,
    );
  } else {
    context.logger.info(`custom jd parser: no ai filter profile for job ${job.id}`);
  }

  // helper methods
  const generateUserPrompt = () => {
    const document = new DOMParser().parseFromString(html, 'text/html');
    if (!document || !document.documentElement) throw new Error('Could not parse html');

    // strip away nodes that are not relevant to the LLM
    const nodesToRemove = ['head', 'script', 'style', 'nav', 'header', 'footer', 'aside', 'img', 'form'];
    stripNodes(document.documentElement, nodesToRemove);
    stripAttributes(document.documentElement, /^(class|style|aria-.*|role)$/);
    const htmlContent = turndownService.turndown(document.documentElement?.outerHTML ?? '');
    const withAdvancedMatchingPreferences = `Here are my job search preferences: ${filterProfile?.chatgpt_prompt || 'nothing specific for the moment'}.`;

    const userPrompt = `Extract the job description from the HTML page below. Return the result as a JSON object matching the provided schema.
Here is the HTML page turned into markdown:
"""
${htmlContent}
"""

${withAdvancedMatchingPreferences}
`;

    return { userPrompt, htmlContent };
  };

  const { userPrompt, htmlContent } = generateUserPrompt();
  const { openAi, llmConfig } = buildOpenAiClient({
    modelName: 'gpt-4o-mini',
    ...context,
  });

  const response = await openAi.chat.completions.create({
    model: llmConfig.model,
    messages: [
      {
        role: 'system',
        content: JOB_DESCRIPTION_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    max_completion_tokens: 10_000,
    response_format: zodResponseFormat(PARSE_JOB_DESCRIPTION_SCHEMA, 'ParseJobDescriptionResponse'),
  });

  const choice = response.choices[0];
  if (choice.finish_reason !== 'stop') {
    throw new Error(`OpenAI response did not finish: ${choice.finish_reason}`);
  }

  const parseResult = PARSE_JOB_DESCRIPTION_SCHEMA.parse(
    JSON.parse(choice.message.content ?? throwError('missing content')),
  );

  await logAiUsage({
    forUserId: user.id,
    llmConfig,
    response,
    ...context,
  });

  let updates: JobDescriptionUpdates = {};
  const parsingFailed = !!parseResult.errorMessage;
  if (parsingFailed) {
    const errorDescription = `
### Original Description
${job.description ?? 'No original description available.'}

AI parser could not properly read this job description: 
${parseResult.errorMessage ?? 'Unknown error'}

<details>
<summary>Original Description (for reference)</summary>

${htmlContent}
</details>
`;

    updates = {
      description: errorDescription,
    };
  } else {
    const formattedDescription = `
## AI Generated Summary
${parseResult.summary?.trim() ?? 'No summary extracted.'}

## AI Extracted Job Description
${parseResult.description?.trim() ?? 'No description extracted.'}

<details>
<summary>Original Description (for reference)</summary>
${job.description ?? 'No original description available.'}
</details>
`;

    updates = {
      description: formattedDescription,
      salary: parseResult.salary?.trim(),
      tags: parseResult.tags?.map((tag) => tag.trim()),
    };
  }

  return updates;
}
const PARSE_JOB_DESCRIPTION_SCHEMA = z.object({
  description: z.string().min(20).optional().nullable(),
  summary: z.string().max(1000).optional().nullable(),
  salary: z.string().optional().nullable(),
  tags: z.array(z.string().max(50)).optional().nullable(),
  errorMessage: z.string().max(500).optional().nullable(),
});
const JOB_DESCRIPTION_SYSTEM_PROMPT = `You are an expert web scraper specialized in extracting job description from HTML pages. 
Your task is to analyze the provided HTML content and extract the job description.
The output has to be markdown formatted text, suitable for display in a web application.
If you cannot extract the information due to the HTML being a login page, CAPTCHA, or any other access restriction, respond with an empty result and an appropriate errorMessage.

Generate a summary of the job description in maximum 1000 characters so that a user can quickly understand the role.
If the user has any preferences mentioned in the prompt, try to highlight how the job matches those preferences in the summary. 
You can use markdown formatting (bold, italics, lists) to improve readability.

Here are some rules for the required output:
- The description field should contain the full job description, including responsibilities, requirements, benefits, and any other relevant information.
- If the job description cannot be found due to the HTML being a login page, CAPTCHA, or any other access restriction, return an empty result and provide an appropriate errorMessage.
- The tags field should include relevant tags or keywords associated with the job, if available. Limit to maximum 10 tags.
- If there are other benefits mentioned in the salary (e.g. stock options, bonuses), do not include them in the salary field, but put them as tags.
Don't include the location, salary or job type as tags.
Try to add seniority level as tag if available (e.g. junior, mid-level, senior, lead, principal).
`;
const turndownService = new turndown({
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

/**
 * Call the jobs-parse model with schema validation + one retry, and a per-call
 * timeout so a slow/hung local inference is treated as a parse failure rather
 * than blocking the whole scan.
 */
async function callJobsParse({
  openAi,
  llmConfig,
  userPrompt,
  logger,
  label,
}: {
  openAi: ReturnType<typeof buildOpenAiClient>['openAi'];
  llmConfig: ReturnType<typeof buildOpenAiClient>['llmConfig'];
  userPrompt: string;
  logger: ILogger;
  label: string;
}): Promise<z.infer<typeof PARSE_JOBS_PAGE_SCHEMA> & { response?: OpenAIResponse }> {
  const attempt = async (extraReminder: boolean) => {
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: userPrompt },
    ];
    if (extraReminder) {
      messages.push({
        role: 'user' as const,
        content: 'Your previous reply was not valid JSON for the schema. Reply with ONLY a JSON object matching the schema, no prose.',
      });
    }
    const response = await openAi.chat.completions.create(
      {
        model: llmConfig.model,
        messages,
        // max_tokens (not max_completion_tokens) for Ollama OpenAI-compat parity.
        max_tokens: 16_000,
        response_format: zodResponseFormat(PARSE_JOBS_PAGE_SCHEMA, 'ParseJobsPageResponse'),
      },
      { timeout: PARSE_CALL_TIMEOUT_MS },
    );
    const choice = response.choices[0];
    if (choice.finish_reason !== 'stop' && choice.finish_reason !== 'length') {
      throw new Error(`model response did not finish: ${choice.finish_reason}`);
    }
    const parsed = PARSE_JOBS_PAGE_SCHEMA.parse(JSON.parse(choice.message.content ?? throwError('missing content')));
    return { ...parsed, response };
  };

  try {
    return await attempt(false);
  } catch (firstErr) {
    logger.info(`jobs parse ${label}: first attempt invalid (${(firstErr as Error).message}), retrying once`);
    try {
      return await attempt(true);
    } catch (secondErr) {
      logger.error(`jobs parse ${label}: failed after retry (${(secondErr as Error).message})`);
      // Treat as "no jobs in this chunk" rather than throwing — the caller
      // records the error and continues with other chunks.
      return { jobs: [], errorMessage: `parse failed: ${(secondErr as Error).message}`, response: undefined };
    }
  }
}

function stripNodes(root: Element, selectors: string[]) {
  selectors.forEach((selector) => {
    const elements = root.querySelectorAll(selector);
    elements.forEach((el) => el.parentNode?.removeChild(el));
  });
}
function stripAttributes(root: Element, dropAttrs: RegExp) {
  const walker = root.querySelectorAll('*');
  const elements = Array.from(walker) as Element[];
  elements.forEach((el: Element) => {
    [...el.attributes].forEach((attr) => {
      if (dropAttrs.test(attr.name)) el.removeAttribute(attr.name);
    });
  });
}

function extractHeaderInfo(document: Element) {
  const title = document.querySelector('title')?.textContent ?? '';
  const metaDescription = document.querySelector("meta[name='description']")?.getAttribute('content') ?? '';

  // try to grab the favicon with the highest resolution
  const favicons = Array.from(
    document.querySelectorAll("link[rel~='icon'], link[rel~='shortcut icon']") as unknown as Element[],
  )
    .map((el) => ({
      href: el.getAttribute('href') ?? '',
      sizes: el.getAttribute('sizes') ?? '',
    }))
    .filter((el) => el.href);
  let faviconUrl;
  if (favicons.length > 0) {
    favicons.sort((a, b) => {
      const sizeA = parseInt(a.sizes.split('x')[0]) || 0;
      const sizeB = parseInt(b.sizes.split('x')[0]) || 0;
      return sizeB - sizeA;
    });
    faviconUrl = favicons[0].href;
  }

  return { title, metaDescription, faviconUrl };
}

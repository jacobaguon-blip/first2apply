// Keyword extraction (items 5 & 6).
// Spec: spec.md §5 Items 5/6 + §9.3.

import { assertWithinBudget, recordSpend, type ModelId } from '../ai/budget';

export type KeywordKind = 'mission' | 'jd';

export type ExtractedKeywords = {
  skills: string[];
  tools: string[];
  values: string[];
  required: string[];
};

export type ExtractOpts = {
  model?: ModelId;
  ai?: AiClient;            // injectable for tests
  forceMock?: boolean;      // overrides env var
};

export type AiClient = {
  // shape matches OpenAI chat-completions; minimal surface for our use
  chatJson(args: {
    model: ModelId;
    system: string;
    user: string;
    promptCacheKey?: string;
  }): Promise<{ json: unknown; tokens_in: number; tokens_out: number }>;
};

const SYSTEM_PROMPT = `You are a careful keyword extractor. Given the input text and a kind (mission|jd),
return STRICT JSON of shape {skills, tools, values, required} where each value is an array of short
lowercase strings (no duplicates, no punctuation). Skills = soft + hard skills. Tools = named
products/languages/frameworks. Values = cultural/team values. Required = explicitly required items.
If a category has no items, return [].`;

export async function extractKeywords(text: string, kind: KeywordKind, opts: ExtractOpts = {}): Promise<ExtractedKeywords> {
  const useMock = opts.forceMock ?? process.env.F2A_AI_MOCK === '1';
  if (useMock) return mockExtract(text);
  const model = opts.model ?? 'gpt-4o-mini';
  const estIn = Math.ceil((SYSTEM_PROMPT.length + text.length) / 4);
  assertWithinBudget(estIn, model);
  const ai = opts.ai;
  if (!ai) {
    // No client configured — fall back to mock so callers still get a result.
    return mockExtract(text);
  }
  const { json, tokens_in, tokens_out } = await ai.chatJson({
    model,
    system: SYSTEM_PROMPT,
    user: `kind=${kind}\n---\n${text}`,
    promptCacheKey: `f2a:kw:${kind}`,
  });
  recordSpend(tokens_in, tokens_out, model, { note: `keywords.${kind}` });
  return normalize(json);
}

// ---------- Mock / deterministic fallback ----------

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'are', 'will', 'our', 'have', 'this', 'that', 'from',
  'your', 'their', 'about', 'into', 'they', 'them', 'these', 'those', 'should', 'would',
  'could', 'were', 'been', 'being', 'than', 'then', 'when', 'where', 'which', 'while',
  'job', 'role', 'team', 'company', 'work', 'working',
]);

const KNOWN_TOOLS = new Set([
  'typescript', 'javascript', 'python', 'go', 'rust', 'java', 'kotlin', 'swift', 'ruby', 'php',
  'react', 'nextjs', 'next.js', 'vue', 'angular', 'svelte', 'electron', 'nodejs', 'node.js',
  'postgres', 'postgresql', 'mysql', 'mongodb', 'redis', 'kafka', 'rabbitmq', 'elasticsearch',
  'aws', 'gcp', 'azure', 'kubernetes', 'docker', 'terraform', 'ansible',
  'graphql', 'grpc', 'rest', 'tailwind', 'tailwindcss',
]);

const REQUIRED_PHRASES = [
  /\brequired\b/i,
  /\bmust have\b/i,
  /\bmust-have\b/i,
  /\bminimum\b.*\b(years|yrs)\b/i,
];

const VALUE_WORDS = new Set([
  'collaboration', 'ownership', 'autonomy', 'transparency', 'integrity', 'excellence',
  'curiosity', 'humility', 'impact', 'mission', 'inclusion', 'diversity', 'craft',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.+#\- ]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[.\-+#]+|[.\-+#]+$/g, '')) // strip leading/trailing punct
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

export function mockExtract(text: string): ExtractedKeywords {
  const toks = tokenize(text);
  const tools = uniq(toks.filter((t) => KNOWN_TOOLS.has(t)));
  const values = uniq(toks.filter((t) => VALUE_WORDS.has(t)));

  // Skills: top-N most-frequent non-tool, non-value words.
  const counts = new Map<string, number>();
  for (const t of toks) {
    if (KNOWN_TOOLS.has(t) || VALUE_WORDS.has(t)) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const skills = uniq(
    Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([w]) => w),
  );

  // Required: sentences matching required-phrases regexes.
  const sentences = text.split(/(?<=[.!?])\s+/);
  const required = uniq(
    sentences
      .filter((s) => REQUIRED_PHRASES.some((re) => re.test(s)))
      .map((s) => s.trim().toLowerCase().slice(0, 120)),
  ).slice(0, 8);

  return { skills, tools, values, required };
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function normalize(j: unknown): ExtractedKeywords {
  const o = (j ?? {}) as Record<string, unknown>;
  const arr = (k: string) => (Array.isArray(o[k]) ? (o[k] as unknown[]).map(String) : []);
  return {
    skills: uniq(arr('skills').map((s) => s.toLowerCase())),
    tools:  uniq(arr('tools').map((s) => s.toLowerCase())),
    values: uniq(arr('values').map((s) => s.toLowerCase())),
    required: uniq(arr('required').map((s) => s.toLowerCase())),
  };
}

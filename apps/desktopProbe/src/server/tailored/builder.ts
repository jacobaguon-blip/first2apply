// Items 7/8 — tailored resume + cover letter builders.
// Spec: spec.md §5 Items 7/8. Mock-first: with F2A_AI_MOCK=1 (or no AI client),
// builds a deterministic JSON skeleton from master content + extracted keywords.

import type { ExtractedKeywords } from '../keywords/index';
import { assertWithinBudget, recordSpend, type ModelId } from '../ai/budget';
import type { MasterCoverLetter, MasterResume } from '../masterContent/parse';

export type TailoredResume = {
  version: 1;
  source: 'mock' | 'ai';
  base: MasterResume;
  emphasized_skills: string[];
  emphasized_tools: string[];
  rationale: string;
};

export type TailoredCoverLetter = {
  version: 1;
  source: 'mock' | 'ai';
  body_paragraphs: string[];
  placeholders_filled: Record<string, string>;
};

export type BuildOpts = {
  model?: ModelId;
  ai?: {
    chatJson(args: { model: ModelId; system: string; user: string }): Promise<{ json: unknown; tokens_in: number; tokens_out: number }>;
  };
};

export function buildTailoredResume(args: {
  master: MasterResume;
  jdKeywords: ExtractedKeywords;
  missionKeywords: ExtractedKeywords;
}): TailoredResume {
  const { master, jdKeywords, missionKeywords } = args;
  const masterSkills = (master.skills ?? []).map((s) => s.toLowerCase());
  const emphasized_skills = jdKeywords.skills.filter((s) => masterSkills.includes(s.toLowerCase()));
  const emphasized_tools = jdKeywords.tools.filter((t) => masterSkills.includes(t.toLowerCase()));
  const missionAlign = missionKeywords.values.length
    ? `Aligns with stated values: ${missionKeywords.values.slice(0, 3).join(', ')}.`
    : '';
  return {
    version: 1,
    source: 'mock',
    base: master,
    emphasized_skills,
    emphasized_tools,
    rationale:
      `Tailored: emphasized ${emphasized_skills.length} matching skills + ${emphasized_tools.length} tools from JD. ` +
      missionAlign,
  };
}

export function buildTailoredCoverLetter(args: {
  master: MasterCoverLetter;
  company: string;
  role: string;
  jdKeywords: ExtractedKeywords;
  missionKeywords: ExtractedKeywords;
}): TailoredCoverLetter {
  const { master, company, role, jdKeywords, missionKeywords } = args;
  const fills: Record<string, string> = {
    role,
    company,
    mission_keywords: missionKeywords.values.slice(0, 3).join(', ') || 'your stated mission',
    skills: jdKeywords.skills.slice(0, 5).join(', ') || jdKeywords.tools.slice(0, 5).join(', '),
  };
  const body = (master.body_paragraphs ?? []).map((p) => fillTemplate(p, fills));
  return {
    version: 1,
    source: 'mock',
    body_paragraphs: body,
    placeholders_filled: fills,
  };
}

function fillTemplate(s: string, fills: Record<string, string>): string {
  return s.replace(/\{\{(\w+)\}\}/g, (_m, k) => fills[k] ?? `{{${k}}}`);
}

export async function buildTailoredResumeAi(args: {
  master: MasterResume;
  jdKeywords: ExtractedKeywords;
  missionKeywords: ExtractedKeywords;
  opts?: BuildOpts;
}): Promise<TailoredResume> {
  const useMock = process.env.F2A_AI_MOCK === '1' || !args.opts?.ai;
  if (useMock) return buildTailoredResume(args);
  const model = args.opts?.model ?? 'gpt-4o-mini';
  const userMsg = JSON.stringify({
    master: args.master,
    jdKeywords: args.jdKeywords,
    missionKeywords: args.missionKeywords,
  });
  const estIn = Math.ceil(userMsg.length / 4);
  assertWithinBudget(estIn, model);
  const r = await args.opts!.ai!.chatJson({
    model,
    system:
      'You receive a master resume + extracted JD keywords + mission keywords. Return JSON of shape {emphasized_skills,emphasized_tools,rationale}. Lowercase, deduped.',
    user: userMsg,
  });
  recordSpend(r.tokens_in, r.tokens_out, model, { note: 'tailored.resume' });
  const j = (r.json ?? {}) as Record<string, unknown>;
  return {
    version: 1,
    source: 'ai',
    base: args.master,
    emphasized_skills: arrLower(j.emphasized_skills),
    emphasized_tools: arrLower(j.emphasized_tools),
    rationale: typeof j.rationale === 'string' ? j.rationale : '',
  };
}

function arrLower(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return Array.from(new Set(x.map(String).map((s) => s.toLowerCase())));
}

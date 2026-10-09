import { referralDraftSystemPrompt } from './careerOpsPrompts.ts';

// Structural types on purpose: importing openAI.ts would parse env at import time and break tests.
type ChatClient = {
  chat: {
    completions: {
      // Method syntax keeps parameter checking bivariant, so the real OpenAI client is assignable.
      create(args: {
        model: string;
        temperature?: number;
        messages: Array<{ role: 'system' | 'user'; content: string }>;
      }): Promise<{
        choices: Array<{ finish_reason?: string | null; message: { content: string | null } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      }>;
    };
  };
};
type LlmConfig = { model: string; costPerMillionInputTokens: number; costPerMillionOutputTokens: number };

export type ReferralDraftInput = {
  contactFirstName: string;
  contactPosition: string;
  contactCompany: string;
  connectedOnIso: string | null;
  jobTitle: string;
  jobCompany: string;
  jobDescription: string | null;
  cvMarkdown: string;
  now?: Date;
};

const MAX_DESCRIPTION_CHARS = 6000;
const MAX_CV_CHARS = 8000;

export function connectionAgeText(connectedOnIso: string | null, now: Date = new Date()): string {
  if (!connectedOnIso) return 'unknown';
  const months = Math.floor((now.getTime() - new Date(connectedOnIso).getTime()) / (30 * 24 * 60 * 60 * 1000));
  if (months < 1) return 'less than a month';
  if (months < 24) return `about ${months} months`;
  return `about ${Math.floor(months / 12)} years`;
}

/** Only the contact's first name, position and company are included, never the last name or profile url. */
export function buildReferralUserMessage(input: ReferralDraftInput): string {
  return [
    `CONTACT: ${input.contactFirstName}, ${input.contactPosition} at ${input.contactCompany}`,
    `CONNECTED FOR: ${connectionAgeText(input.connectedOnIso, input.now)}`,
    '',
    `JOB: ${input.jobTitle} at ${input.jobCompany}`,
    (input.jobDescription ?? '').slice(0, MAX_DESCRIPTION_CHARS),
    '',
    'CANDIDATE CV:',
    input.cvMarkdown.slice(0, MAX_CV_CHARS),
  ].join('\n');
}

export function cleanDraft(text: string): string {
  let out = text.trim();
  out = out.replace(/^(message|draft)\s*:\s*/i, '');
  out = out.replace(/^["'“”]+|["'“”]+$/g, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

export async function generateReferralDraft({
  openAi,
  llmConfig,
  input,
}: {
  openAi: ChatClient;
  llmConfig: LlmConfig;
  input: ReferralDraftInput;
}) {
  const response = await openAi.chat.completions.create({
    model: llmConfig.model,
    temperature: 0.5,
    messages: [
      { role: 'system', content: referralDraftSystemPrompt },
      { role: 'user', content: buildReferralUserMessage(input) },
    ],
  });
  const draft = cleanDraft(response.choices[0]?.message?.content ?? '');
  if (!draft) throw new Error('model returned an empty draft');
  return { draft, response };
}

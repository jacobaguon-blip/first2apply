import { assert, assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1';

import { buildReferralUserMessage, cleanDraft, connectionAgeText, generateReferralDraft } from './referralDraft.ts';

const NOW = new Date('2026-10-08T12:00:00Z');
const input = {
  contactFirstName: 'Avery',
  contactPosition: 'Engineering Manager',
  contactCompany: 'QA Co A',
  connectedOnIso: '2024-02-01',
  jobTitle: 'Senior Support Engineer',
  jobCompany: 'QA Co A',
  jobDescription: 'Help customers. Python and SQL.',
  cvMarkdown: '# Jacob\n- 6 years of technical support\n- Python, SQL',
  now: NOW,
};

Deno.test('connectionAgeText buckets the time since connecting', () => {
  assertEquals(connectionAgeText('2026-10-01', NOW), 'less than a month');
  assertEquals(connectionAgeText('2026-07-08', NOW), 'about 3 months');
  assertEquals(connectionAgeText('2024-02-01', NOW), 'about 2 years');
  assertEquals(connectionAgeText(null, NOW), 'unknown');
});

Deno.test('the user message carries only first name, position and company for the contact', () => {
  const msg = buildReferralUserMessage({
    ...input,
    contactLastName: 'Stone',
    contactUrl: 'https://linkedin.com/in/x',
  } as never);
  assertStringIncludes(msg, 'Avery');
  assertStringIncludes(msg, 'Engineering Manager');
  assert(!msg.includes('Stone'), 'last name must not be sent to the model');
  assert(!msg.includes('linkedin.com'), 'profile url must not be sent to the model');
});

Deno.test('cleanDraft strips quotes, preamble labels and extra whitespace', () => {
  assertEquals(cleanDraft('  "Hi Avery,\n\n\nthanks!"  '), 'Hi Avery,\n\nthanks!');
  assertEquals(cleanDraft('Message: Hi Avery'), 'Hi Avery');
});

const fakeClient = (content: string | null) => ({
  openAi: {
    chat: {
      completions: {
        create: () => Promise.resolve({ choices: [{ finish_reason: 'stop', message: { content } }], usage: {} }),
      },
    },
  },
  llmConfig: { model: 'fake', costPerMillionInputTokens: 0, costPerMillionOutputTokens: 0 },
});

Deno.test('generateReferralDraft returns the cleaned draft', async () => {
  const { draft } = await generateReferralDraft({ ...fakeClient('"Hi Avery, quick question."'), input });
  assertEquals(draft, 'Hi Avery, quick question.');
});

Deno.test('generateReferralDraft rejects an empty model reply', async () => {
  await assertRejects(() => generateReferralDraft({ ...fakeClient('   '), input }), Error, 'empty');
});

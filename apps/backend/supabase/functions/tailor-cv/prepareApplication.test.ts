import { preparedApplication } from '../../../../desktopProbe/src/server/__tests__/fixtures/preparedApplication.ts';
import { parsePreparedApplication } from './prepareApplication.ts';

const { masterCv, ...draft } = preparedApplication;
const description = [
  'Coordinate client onboarding',
  'Salesforce administration',
  ...draft.answers.map(({ question }) => question),
].join('\n');

Deno.test('returns the source CV and reviewable fixture package', () => {
  const result = parsePreparedApplication(JSON.stringify(draft), masterCv, description);
  if (JSON.stringify(result) !== JSON.stringify({ ...draft, masterCv })) {
    throw new Error('Expected the fixture package and source CV');
  }
});

for (const [name, invalid] of [
  ['an unexplained rewrite', { ...draft, changes: [] }],
  ['invented CV evidence', { ...draft, changes: [{ ...draft.changes[0], evidence: 'Managed Salesforce.' }] }],
  ['an invented screening question', { ...draft, answers: [{ question: 'Are you willing to relocate?', answer: '' }] }],
] as const) {
  Deno.test(`rejects ${name}`, () => {
    try {
      parsePreparedApplication(JSON.stringify(invalid), masterCv, description);
    } catch (error) {
      if (error instanceof Error && error.message.includes('could not be matched')) return;
      throw error;
    }
    throw new Error(`Expected rejection of ${name}`);
  });
}

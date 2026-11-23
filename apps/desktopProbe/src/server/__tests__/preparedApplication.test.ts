import { describe, expect, it } from 'vitest';

import { approveApplication, reviseApplication } from '../../components/home/applicationReviewState';
import { preparedApplication } from './fixtures/preparedApplication';

describe('application approval', () => {
  it('requires an answer to each screening question', () => {
    const draft = reviseApplication(preparedApplication);
    expect(approveApplication(draft)).toBe(draft);
  });

  it.each(['resume', 'coverLetter', 'answers'] as const)('clears approval after a change to %s', (field) => {
    const draft = reviseApplication({
      ...preparedApplication,
      answers: [preparedApplication.answers[0], { question: 'When can you start?', answer: 'In two weeks.' }],
    });
    const approved = approveApplication(draft);
    expect(approved.approvedAt).toBeTruthy();
    const changed =
      field === 'answers'
        ? { ...approved, answers: [{ ...approved.answers[0], answer: 'I onboarded 6 clients.' }, approved.answers[1]] }
        : { ...approved, [field]: approved[field] + '\n' };
    expect(reviseApplication(changed).approvedAt).toBeNull();
    expect(approved.approvedAt).toBeTruthy();
  });
});

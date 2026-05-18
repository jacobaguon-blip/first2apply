import { describe, expect, test } from 'vitest';

import { classifyUrlShape, suggestForLikelySingle } from '../targetValidator/urlShape';

describe('classifyUrlShape', () => {
  test('known ATS list hosts → likely_list', () => {
    expect(classifyUrlShape('https://boards.greenhouse.io/anthropic').verdict).toBe('likely_list');
    expect(classifyUrlShape('https://jobs.lever.co/anthropic').verdict).toBe('likely_list');
    expect(classifyUrlShape('https://jobs.ashbyhq.com/anthropic').verdict).toBe('likely_list');
  });

  test('single-job patterns per ATS → likely_single', () => {
    expect(classifyUrlShape('https://boards.greenhouse.io/anthropic/jobs/4567').verdict).toBe('likely_single');
    expect(classifyUrlShape('https://example.com/careers?gh_jid=12345').verdict).toBe('likely_single');
    expect(classifyUrlShape('https://jobs.lever.co/anthropic/abcd1234-abcd-5678-90ab-cdef12345678').verdict).toBe(
      'likely_single',
    );
    expect(classifyUrlShape('https://jobs.ashbyhq.com/anthropic/abcd1234-abcd-5678-90ab-cdef12345678').verdict).toBe(
      'likely_single',
    );
    expect(classifyUrlShape('https://apply.workable.com/acme/j/ABC123/').verdict).toBe('likely_single');
    expect(
      classifyUrlShape('https://acme.wd1.myworkdayjobs.com/en-US/External/job/Remote/Engineer_R12345').verdict,
    ).toBe('likely_single');
  });

  test('bare root non-ATS → needs_probe', () => {
    expect(classifyUrlShape('https://anthropic.com/').verdict).toBe('needs_probe');
  });

  test('invalid URL → invalid', () => {
    expect(classifyUrlShape('not a url').verdict).toBe('invalid');
  });
});

describe('suggestForLikelySingle', () => {
  test('Greenhouse: strips /jobs/<id> back to /<co>', () => {
    expect(suggestForLikelySingle('https://boards.greenhouse.io/anthropic/jobs/4567')).toBe(
      'https://boards.greenhouse.io/anthropic',
    );
  });
  test('Lever: strips uuid back to /<co>', () => {
    expect(suggestForLikelySingle('https://jobs.lever.co/anthropic/abcd1234-abcd-5678-90ab-cdef12345678')).toBe(
      'https://jobs.lever.co/anthropic',
    );
  });
  test('generic 1-hop fallback', () => {
    expect(suggestForLikelySingle('https://example.com/careers/openings/eng/12345')).toBe(
      'https://example.com/careers/openings/eng',
    );
  });
});

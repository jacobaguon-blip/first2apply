import { aggregateBySource, formatSummaryBody } from '../../src/server/quietHours/aggregate';

test('aggregates and sorts by count desc', () => {
  const jobs = [
    { siteName: 'LinkedIn', searchTitle: 'Frontend Remote' },
    { siteName: 'LinkedIn', searchTitle: 'Frontend Remote' },
    { siteName: 'Indeed', searchTitle: 'Product Designer' },
    { siteName: 'LinkedIn', searchTitle: 'Frontend Remote' },
  ];
  expect(aggregateBySource(jobs)).toEqual([
    { site: 'LinkedIn', search: 'Frontend Remote', count: 3 },
    { site: 'Indeed', search: 'Product Designer', count: 1 },
  ]);
});

test('formatSummaryBody produces expected lines', () => {
  const body = formatSummaryBody([
    { site: 'LinkedIn', search: 'Frontend Remote', count: 5 },
    { site: 'Indeed', search: 'Product Designer', count: 2 },
  ]);
  expect(body).toBe('5 from LinkedIn – "Frontend Remote"\n2 from Indeed – "Product Designer"');
});

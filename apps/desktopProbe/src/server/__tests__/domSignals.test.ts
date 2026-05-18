import { describe, expect, test } from 'vitest';

import { classifyFromSignals, extractDomSignals } from '../targetValidator/domSignals';

const listHtml = `<html><body>
  <a href="/jobs/123">SWE</a><a href="/jobs/124">PM</a>
  <a href="/jobs/125">Designer</a></body></html>`;

const singleHtml = `<html><head><title>Senior SWE</title></head><body>
  <h1>Senior SWE</h1><button>Apply Now</button>
  <a href="/careers">Back to all jobs</a></body></html>`;

const landingHtml = `<html><body><h1>Join us</h1>
  <a href="/jobs">See open roles</a></body></html>`;

const junkHtml = `<html><body><a href="mailto:a@b.com">See all jobs</a></body></html>`;

describe('classifyFromSignals', () => {
  test('jobs list', () => {
    const s = extractDomSignals(listHtml, 'https://x.com/careers');
    expect(classifyFromSignals(s).kind).toBe('jobs_list');
  });

  test('single job uses back-to-jobs as suggestion', () => {
    const c = classifyFromSignals(extractDomSignals(singleHtml, 'https://x.com/jobs/1'));
    expect(c.kind).toBe('single_job');
    if (c.kind === 'single_job') expect(c.suggestedHref).toBe('/careers');
  });

  test('landing → suggestedHref points to /jobs', () => {
    const c = classifyFromSignals(extractDomSignals(landingHtml, 'https://x.com/'));
    expect(c.kind).toBe('careers_landing');
    if (c.kind === 'careers_landing') expect(c.suggestedHref).toBe('/jobs');
  });

  test('mailto/junk hrefs are ignored', () => {
    const c = classifyFromSignals(extractDomSignals(junkHtml, 'https://x.com/'));
    expect(c.kind).toBe('unrelated');
  });
});

import { describe, it, expect } from '@jest/globals';

import { classifyLocation, LOCATION_BUCKETS } from '../classifyLocation';

describe('classifyLocation', () => {
  it('returns unspecified for null/empty/whitespace', () => {
    expect(classifyLocation(null)).toBe('unspecified');
    expect(classifyLocation(undefined)).toBe('unspecified');
    expect(classifyLocation('')).toBe('unspecified');
    expect(classifyLocation('   ')).toBe('unspecified');
  });

  it('detects remote (case-insensitive, word boundary)', () => {
    expect(classifyLocation('Remote')).toBe('remote');
    expect(classifyLocation('Philippines - Remote')).toBe('remote');
    expect(classifyLocation('REMOTE - US')).toBe('remote');
    // word boundary: "Remotely" should not match
    expect(classifyLocation('Remotely managed team in Berlin')).toBe('onsite');
  });

  it('detects hybrid', () => {
    expect(classifyLocation('Hybrid - San Francisco')).toBe('hybrid');
    expect(classifyLocation('London (Hybrid)')).toBe('hybrid');
  });

  it('remote wins over hybrid when both appear', () => {
    expect(classifyLocation('Remote / Hybrid')).toBe('remote');
  });

  it('defaults to onsite for plain city strings', () => {
    expect(classifyLocation('Dongguan, China')).toBe('onsite');
    expect(classifyLocation('San Francisco, CA')).toBe('onsite');
  });

  it('exports the canonical bucket list', () => {
    expect(LOCATION_BUCKETS).toEqual(['remote', 'hybrid', 'onsite', 'unspecified']);
  });

  it('pins documented false positives (descriptive "remote")', () => {
    // These are intentional false positives — see classifyLocation.ts JSDoc.
    // Keep them pinned so the next editor doesn't "fix" them and break the mirror.
    expect(classifyLocation('Remote-first')).toBe('remote');
    expect(classifyLocation('fully remote')).toBe('remote');
    expect(classifyLocation('Remote office in NYC')).toBe('remote');
  });
});

// Normalizes a company name so "REI Co-op" and "REI, Inc." compare equal.
// MUST stay identical to public.company_key in
// apps/backend/supabase/migrations/20261008000000_referral_contacts.sql.
// Shared fixtures: __fixtures__/companyKey.fixtures.json (jest here, SQL via
// apps/backend/scripts/company-key-parity.mjs).
// Limitation, shared with the SQL twin: any character outside a-z0-9 (accents,
// non-latin scripts) is treated as a space.

const LEGAL_SUFFIXES = new Set([
  'inc',
  'incorporated',
  'llc',
  'ltd',
  'limited',
  'co',
  'corp',
  'corporation',
  'company',
  'gmbh',
  'plc',
  'lp',
  'llp',
  'sa',
  'ag',
  'bv',
  'pty',
  'pllc',
]);

export function companyKey(name?: string | null): string {
  if (!name) return '';
  let s = name.toLowerCase();
  s = s.replace(/\bco-?op\b/g, ' ');
  s = s.replace(/\bcooperative\b/g, ' ');
  s = s.replace(/&/g, ' and ');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  let tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens[0] === 'the') tokens = tokens.slice(1);
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens = tokens.slice(0, -1);
  }
  return tokens.join(' ');
}

/** True when both names normalize to the same non-empty key (aliases are applied in SQL only). */
export function sameCompany(a?: string | null, b?: string | null): boolean {
  const keyA = companyKey(a);
  return keyA !== '' && keyA === companyKey(b);
}

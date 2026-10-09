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
  const s = name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ');
  const raw = s.split(/\s+/).filter(Boolean);
  // Drop co-op words on whole tokens, not regex word boundaries, so this matches the SQL twin
  // for non-ASCII text: "co" "op", "coop", "cooperative".
  let tokens: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 'co' && raw[i + 1] === 'op') {
      i += 1;
    } else if (raw[i] === 'coop' || raw[i] === 'cooperative') {
      continue;
    } else {
      tokens.push(raw[i]);
    }
  }
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

// Proves one user cannot read or write another user's connections or referral_outreach.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... node apps/backend/scripts/referral-rls-check.mjs
// Creates two throwaway users and deletes them at the end.
const url = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.SUPABASE_ANON_KEY;
if (!url || !service || !anon) {
  console.error('set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY');
  process.exit(2);
}

const admin = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
const stamp = Date.now();
const password = `Tmp-${stamp}-pw!`;

async function createUser(label) {
  const email = `rls-${label}-${stamp}@first2apply-qa.example.com`;
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = await res.json();
  const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const { access_token } = await login.json();
  return {
    id: user.id,
    headers: { apikey: anon, Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
  };
}

let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failures++;
};

const a = await createUser('a');
const b = await createUser('b');
try {
  const insert = await fetch(`${url}/rest/v1/connections`, {
    method: 'POST',
    headers: { ...a.headers, Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: a.id, linkedin_url: `https://linkedin.com/in/rls-${stamp}`, company: 'RLS Co' }),
  });
  const [row] = await insert.json();
  check('owner can insert a connection', !!row?.id);

  const bRead = await (await fetch(`${url}/rest/v1/connections?select=id`, { headers: b.headers })).json();
  check('other user cannot read it', Array.isArray(bRead) && bRead.length === 0);

  const bForge = await fetch(`${url}/rest/v1/connections`, {
    method: 'POST',
    headers: b.headers,
    body: JSON.stringify({ user_id: a.id, linkedin_url: `https://linkedin.com/in/forged-${stamp}` }),
  });
  check('other user cannot insert rows as the owner', bForge.status >= 400);

  // Any existing job that belongs to somebody else (service role lookup).
  const [foreignJob] = await (
    await fetch(`${url}/rest/v1/jobs?select=id&user_id=neq.${b.id}&limit=1`, { headers: admin })
  ).json();

  const bOutreach = await fetch(`${url}/rest/v1/referral_outreach`, {
    method: 'POST',
    headers: b.headers,
    body: JSON.stringify({ user_id: b.id, job_id: foreignJob.id, connection_id: row.id }),
  });
  check('other user cannot attach outreach to a connection they do not own', bOutreach.status >= 400);

  const bOwn = await fetch(`${url}/rest/v1/connections`, {
    method: 'POST',
    headers: { ...b.headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: b.id,
      linkedin_url: `https://linkedin.com/in/rls-b-${stamp}`,
      company: 'RLS B Co',
    }),
  });
  const [bRow] = await bOwn.json();
  const bForeignJob = await fetch(`${url}/rest/v1/referral_outreach`, {
    method: 'POST',
    headers: b.headers,
    body: JSON.stringify({ user_id: b.id, job_id: foreignJob.id, connection_id: bRow.id }),
  });
  check(
    'user cannot attach outreach to a job they do not own, even with their own connection',
    bForeignJob.status >= 400,
  );
} finally {
  for (const u of [a, b]) {
    await fetch(`${url}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: admin });
  }
}
console.log(failures === 0 ? 'OK' : `FAILED: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

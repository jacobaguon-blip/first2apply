// End-to-end check of the draft-referral edge function against the REAL database, with a fake instant model.
// Usage (Deno):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... F2A_QA_EMAIL=... F2A_QA_PASSWORD=... \
//   deno run -A --no-check --sloppy-imports apps/backend/scripts/draft-referral-e2e.ts
// Asserts: wrong-company contacts are rejected, a draft is saved with status "drafted", regenerating keeps a
// later status ("asked"), and the prompt sent to the model never contains the contact's last name or profile url.
const need = (k: string) => Deno.env.get(k) ?? (console.error(`set ${k}`), Deno.exit(2));
const url = need('SUPABASE_URL');
const service = need('SUPABASE_SERVICE_ROLE_KEY');
const anon = need('SUPABASE_ANON_KEY');
const email = need('F2A_QA_EMAIL');
const password = need('F2A_QA_PASSWORD');

const prompts: string[] = [];
const fake = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
  const body = await req.json();
  prompts.push(JSON.stringify(body.messages));
  return Response.json({
    id: 'fake',
    object: 'chat.completion',
    choices: [
      { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '"Hi Avery, this is a fake draft."' } },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
});
const port = (fake.addr as Deno.NetAddr).port;

Deno.env.set('F2A_AI_PROVIDER', 'local');
Deno.env.set('F2A_OLLAMA_URL', `http://127.0.0.1:${port}/v1`);
Deno.env.set('F2A_WEBHOOK_SECRET', 'e2e');
const { handle } = await import('../supabase/functions/draft-referral/index.ts');

const adminH = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
const get = async (path: string) => (await fetch(`${url}/rest/v1/${path}`, { headers: adminH })).json();

const login = await (
  await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
).json();
const jwt = login.access_token as string;
const userId = login.user.id as string;

const call = async (job_id: number, connection_id: number) =>
  (
    await handle(
      new Request('http://local/draft-referral', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, apikey: anon, 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id, connection_id }),
      }),
    )
  ).json();

let failures = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${JSON.stringify(extra)}`}`);
  if (!ok) failures++;
};

const [jobA] = await get(`jobs?select=id&title=eq.QA%20Remote%20Engineer&user_id=eq.${userId}`);
const [jobOther] = await get(`jobs?select=id&title=eq.QA%20Onsite%20Technician&user_id=eq.${userId}`);
const [avery] = await get(`connections?select=id,last_name,linkedin_url&first_name=eq.Avery&user_id=eq.${userId}`);

const wrong = await call(jobOther.id, avery.id);
check('contact at another company is rejected', wrong.error?.code === 'contact_not_at_company', wrong);

await fetch(`${url}/rest/v1/referral_outreach?user_id=eq.${userId}&job_id=eq.${jobA.id}&connection_id=eq.${avery.id}`, {
  method: 'DELETE',
  headers: adminH,
});

const first = await call(jobA.id, avery.id);
check('first call returns a saved draft', first.outreach?.draft === 'Hi Avery, this is a fake draft.', first);
check('new outreach starts as drafted', first.outreach?.status === 'drafted', first);

const prompt = prompts.join('\n');
check('prompt contains the first name', prompt.includes('Avery'));
check('prompt does not contain the last name', !prompt.includes(avery.last_name), avery.last_name);
check('prompt does not contain the profile url', !prompt.includes('linkedin.com'));
check('prompt includes the CV', prompt.includes('technical support engineering'));

await fetch(`${url}/rest/v1/referral_outreach?id=eq.${first.outreach.id}`, {
  method: 'PATCH',
  headers: adminH,
  body: JSON.stringify({ status: 'asked' }),
});
const second = await call(jobA.id, avery.id);
check('regenerating keeps the existing status', second.outreach?.status === 'asked', second);
check('regenerating reuses the same row', second.outreach?.id === first.outreach.id, second);

await fetch(`${url}/rest/v1/referral_outreach?id=eq.${first.outreach.id}`, { method: 'DELETE', headers: adminH });
await fake.shutdown();
console.log(failures === 0 ? 'OK' : `FAILED: ${failures}`);
Deno.exit(failures === 0 ? 0 : 1);

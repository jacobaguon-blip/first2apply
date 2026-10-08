# first2apply scenarios

## AI provider selection

Triggering condition: an edge function builds its model client through `buildOpenAiClient` with `F2A_AI_PROVIDER` set (or unset).

Expected behavior:
- Unset means `local` (Ollama), the household default.
- `openai` uses `OPENAI_API_KEY` and the OpenAI base URL.
- A cloud provider such as `gemini` uses its own key, base URL and model, and never falls back to another provider.
- An unrecognized value fails loudly at startup. It must not silently select `local`, because that hides a misconfiguration behind slow, low-quality parses.

Regression coverage: none yet (target: a Deno test next to `_shared/localFetch.test.ts`).

## Company matching

Triggering condition: a job's company name is compared with a contact's company (the badge, the contacts panel, drafting).

Expected behavior:
- "REI Co-op" and "REI, Inc." match. "Meta Platforms, Inc." and "Metaverse Labs" do not.
- Empty or missing names never match anything, including each other.
- Spelling variants that normalization cannot merge (for example "Recreational Equipment, Inc." and "REI") are merged only through `company_aliases`.
- The TypeScript and SQL implementations give identical keys for the shared fixtures.

Regression coverage: `libraries/core/src/__tests__/companyKey.test.ts` and `apps/backend/scripts/company-key-parity.mjs` (needs cloud credentials, run by hand before and after any change to the rules).

## Referral outreach follow-up

Triggering condition: a contact is marked "asked" and the follow-up date passes.

Expected behavior:
- Each follow-up date produces at most one nudge. Moving the date later and letting it pass nudges again.
- Replied, referred, no reply and declined clear the follow-up date, so nobody is nudged for them.
- Two probes running at once never double-send, and a failed Pushover send is retried on the next run.
- Contact email addresses are never stored, and the model never receives a contact's last name or profile URL.

Regression coverage: `libraries/core/src/__tests__/referral.test.ts` and `libraries/scraper/src/__tests__/referralNudge.test.ts`.


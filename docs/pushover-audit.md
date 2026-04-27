# Pushover audit

**Backlog item 3.** Generated 2026-04-25.

## Summary

Pushover is invoked from a **single call site** via a **single helper** (`apps/desktopProbe/src/server/pushover.ts`). No call-site divergence. No serverProbe equivalent yet (item 4 would add one).

## Call sites

| File | Line | Caller | Trigger |
|------|------|--------|---------|
| `apps/desktopProbe/src/server/jobScanner.ts` | 415–423 | `JobScanner._showNotification` | New jobs detected during a scan cycle, gated on `pushoverEnabled && appToken && userKey`. |

That's it. No other call sites in the workspace (`grep -rn sendPushover apps/ libraries/`).

## Helper

`apps/desktopProbe/src/server/pushover.ts` exports `sendPushover(opts)`:

```ts
sendPushover({
  appToken: string;
  userKey: string;
  title: string;
  message: string;
  url?: string;
  urlTitle?: string;
})
```

POSTs `application/x-www-form-urlencoded` to `https://api.pushover.net/1/messages.json`. Throws on non-2xx.

## Payload conventions (current)

| Field | Source | Example |
|-------|--------|---------|
| `title` | hardcoded | `"Job Search Update"` |
| `message` | computed | `"3 new jobs at Acme, Foo and 2 others are now available!"` |
| `url` | not set | (none — the desktop notification handles deep linking) |
| `urlTitle` | default `"Open"` if `url` set | n/a today |

## Configuration

- `appToken` / `userKey` resolved at call time: `ENV.pushover.appToken || settings.pushoverAppToken` (env wins, for headless deploys).
- `pushoverEnabled` is true if either env vars are present OR the user toggled it in settings.
- UI lives in `apps/desktopProbe/src/pages/settings.tsx` (lines ~204–238).

## Gaps identified

| Gap | Severity | Recommendation |
|-----|----------|----------------|
| **No retry on transient failure.** `fetch` rejects bubble up; jobScanner only `.catch(...err => log)`. A flaky network drops notifications silently. | MAJOR | Add exponential backoff: max 3 attempts, base 500ms, jitter. |
| **No 429 respect.** Pushover returns 429 with `Retry-After` header on rate-limit; current code retries nothing and treats 429 as fatal. | MAJOR | Honor `Retry-After` (parse seconds; cap at 60s). |
| **No mock transport for dev/CI.** Tests can't run without hitting real API. | MAJOR | Honor `F2A_PUSHOVER_MOCK=1` — short-circuit to console.log + return ok. |
| **No structured logging.** `console.error` only; no request_id, no timing. | MINOR | Inject the project logger. |
| **No payload typing for actions** (item 11 would add approve/reject URLs). | MINOR | Extend `SendPushoverOpts` with `actionUrls?: { approve: string; reject: string }`. |
| **No serverProbe parity** (item 4). | DEFERRED | Item 4 will copy the helper into the server probe; both should import a shared module from `libraries/notifications/pushover.ts` to avoid drift. |

## Refactor delivered in this PR

- Replace inline helper with hardened version: mock transport, retry-with-backoff, 429 respect.
- Same external API (`sendPushover(opts)` signature unchanged) so the single call site needs no change.
- Tests cover: mock mode, success, retry-then-success, 429 with Retry-After, exhausted retries.
- Future: extract to `libraries/notifications/` when item 4 lands.

## Rate-limit reference (Pushover)

- Per-application monthly limit: 10,000 messages (April 2026 free tier).
- Per-message rate: ~5/sec sustained per app key.
- 429 includes `X-Limit-App-Remaining` headers; we don't currently inspect these. **Recommendation:** log them on every response so the user can see remaining budget.

## Action items for user (Monday)

- [ ] Provide real Pushover app token / user key in `.env` (currently mocked).
- [ ] Decide whether to expose Retry-After messaging in the UI.
- [ ] Confirm whether item 11's approval URLs should be Pushover supplementary URLs (`url=` field) or native Pushover Open Client actions (more complex, requires Pushover Glances/Open Client API).

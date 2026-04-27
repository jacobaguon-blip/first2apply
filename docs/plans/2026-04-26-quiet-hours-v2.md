# Quiet Hours v2 (cloud-aligned)

Date: 2026-04-26
Branch: `backlog/02-quiet-hours-v2`
Closes: BACKLOG item 2

## Why "v2"

The original `backlog/02-quiet-hours` design added `profiles.quiet_hours_*`
columns and a new `notification_queue` table. That branch is **scrapped**: by
the time we got to integrating it, the cloud Supabase project had already
landed a more capable schema on `chore/migration-drift-recovery`:

- `public.user_settings` — per-user quiet-hours config + claim ledger
- `public.claim_summary_send(uuid, timestamptz)` RPC — atomic per-window claim
- `jobs.notified_pushover_at` + partial index on unmarked rows

Building v2 on this existing surface avoids both a duplicate migration and
the queue table that the cloud design intentionally omitted.

## Schedule shape

`user_settings.quiet_hours_schedule` is `jsonb` with no SQL constraint on
shape, so we pin it here:

```json
{
  "monday":    { "start": "22:00", "end": "07:00" },
  "tuesday":   { "start": "22:00", "end": "07:00" },
  "wednesday": { "start": "22:00", "end": "07:00" },
  "thursday":  { "start": "22:00", "end": "07:00" },
  "friday":    { "start": "23:00", "end": "08:00" },
  "saturday":  { "start": "23:00", "end": "09:00" },
  "sunday":    { "start": "22:00", "end": "07:00" }
}
```

- Each day key is **optional** — omitting it means *no* quiet hours that day.
- `start > end` denotes a window crossing midnight: it begins on the listed
  day at `start` (local time) and ends the *following* calendar day at `end`.
- Times are 24-hour `HH:MM` interpreted in `quiet_hours_timezone` (an IANA
  zone, default `UTC`).
- `quiet_hours_grace_minutes` (0–60 in the UI, 0+ in SQL) extends the *end*
  of an active window outward — useful for "let the morning summary land
  fifteen minutes after I've actually woken up".

The TypeScript projection of this shape lives in
`libraries/core/src/types.ts`:

```ts
export type QuietHoursWindow = { start: string; end: string };
export type QuietHoursSchedule = Partial<Record<QuietHoursDay, QuietHoursWindow>>;
```

`DbSchema['public']['Tables']['user_settings']` and
`DbSchema['public']['Functions']['claim_summary_send']` are also extended so
the rest of the codebase can call these surfaces with full type safety.

## Window-check logic

`apps/desktopProbe/src/server/notifications/quietHours.ts` exports:

- `isInQuietHours(schedule, timezone, graceMinutes, now)` — pure function,
  no I/O.
- `nextWindowEnd(schedule, timezone, now)` — best-effort lookup of when the
  *currently active* window ends. Returns `null` if not currently quiet.

DST and timezone handling rely entirely on `Intl.DateTimeFormat` — we never
add or subtract hours manually. This means:

- Spring-forward (e.g. 2026-03-08 PT, the 02:00 hour does not exist): the
  previous day's `22:00 → 07:00` window still resolves correctly because
  Intl reports local wall-clock time, and our "minutes-of-day" comparison
  does not care that an hour was skipped.
- Fall-back (e.g. 2026-11-01 PT, 01:00–02:00 happens twice): same story; the
  window is defined by wall-clock minutes-of-day, and we only ever ask Intl
  "what is the local clock at this UTC instant".

The seven test cases in `quietHours.test.ts` cover wrap-around, DST in both
directions, an empty schedule, grace, and a non-Pacific tz.

## Dispatcher flow

`apps/desktopProbe/src/server/notifications/dispatch.ts` exports
`dispatchPushoverSummary(supabase, input)`. The flow:

1. **Fetch** the caller's `user_settings` row. If missing, fall back to a
   plain `sendPushover` (preserves upstream behaviour for users who have not
   yet configured quiet hours).
2. **Quiet check.** If `quiet_hours_enabled` and `isInQuietHours(...)`:
   - Compute `windowEnd` via `nextWindowEnd`.
   - Stamp `jobs.notified_pushover_at = windowEnd` for every job in the
     batch. The partial index `jobs_user_notified_pushover_idx` only covers
     rows where this column is null, so stamped jobs disappear from the
     scanner's "needs notification" set until the next periodic scan
     re-evaluates them after the window closes (logic outside this PR can
     un-stamp on window end if desired; for v2 the next batch's rows will be
     considered).
   - Return `skipped_quiet_hours`. **No queue table is involved** — the
     marker on `jobs` is the durable state.
3. **Per-window claim.** Outside quiet hours, compute a deterministic
   "window key" (top-of-the-current-hour UTC, advanced by 1h) and call
   `claim_summary_send(p_user_id, p_window_end)`. The RPC atomically updates
   `user_settings.last_summary_sent_at` only if the existing value is null
   or older than `p_window_end`, returning the row count. Only the first
   caller in a given window gets `1` and proceeds to send; concurrent
   workers get `0` and short-circuit with `skipped_already_claimed`.
4. **Send.** Plain Pushover POST.

This gives us "at most one summary per user per hour" semantics on top of
the existing Pushover infrastructure, with no scheduled-jobs daemon and no
new tables.

## Why this beats the scrapped design

| concern | scrapped v1 | v2 (this branch) |
| --- | --- | --- |
| storage | new `profiles.quiet_hours_*` columns + new `notification_queue` table | existing `user_settings` + `jobs.notified_pushover_at` |
| dedup | application-level scan of queue | `claim_summary_send` RPC (atomic) |
| catch-up | needed a worker to drain the queue post-window | next periodic scan re-considers unstamped rows |
| schema risk | two new tables to maintain & RLS | zero new tables |
| migration ordering | must land before app upgrade | already applied on cloud |

## Files

- `libraries/core/src/types.ts` — types + DbSchema entries
- `libraries/ui/src/lib/supabaseApi.ts` — `getUserSettings` / `upsertUserSettings`
- `apps/desktopProbe/src/server/notifications/quietHours.ts` — window check
- `apps/desktopProbe/src/server/notifications/dispatch.ts` — dispatcher
- `apps/desktopProbe/src/server/notifications/quietHours.test.ts` — `npx tsx` tests
- `apps/desktopProbe/src/server/rendererIpcApi.ts` — IPC handlers
- `apps/desktopProbe/src/lib/electronMainSdk.tsx` — renderer SDK
- `apps/desktopProbe/src/pages/settings.tsx` — Quiet Hours UI section

## Out of scope (follow-up)

- Wiring the dispatcher into `jobScanner.ts` (it currently still calls
  `sendPushover` directly). The scaffolding is in place; the swap is a
  small follow-up that needs renderer-side tests.
- A periodic sweeper to clear `notified_pushover_at` markers once their
  window has elapsed (so the same job can re-trigger if it remains "new"
  past the deferral). Today, deferred jobs simply roll into the next
  scanner pass naturally as new rows arrive.
- Server-side scheduled "send the summary at exactly window-end" — v2's
  design intentionally piggybacks on the next periodic scan instead of
  spawning a wake-up timer.

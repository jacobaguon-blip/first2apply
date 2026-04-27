# Quiet Hours — Design

**Date:** 2026-04-24
**Status:** Approved (brainstorming)

## Summary

Add a "quiet hours" feature to first2apply. During user-configured windows, suppress desktop notifications and Pushover messages. When a window ends, fire a single summary ("X new jobs while you were away") broken down by source search/site.

Driven by a deployment where a Raspberry Pi runs the probe 24/7 and is responsible for Pushover delivery, while one or more desktop clients (laptop, etc.) may also be running. Settings sync through Supabase and are cached locally on every device for offline resilience.

## Goals

- Stop notification noise during configured quiet windows, on both desktop and Pushover channels.
- Deliver a single, consolidated end-of-window summary so the user doesn't miss that jobs landed.
- Let the Pi drive Pushover independent of whether desktop clients are awake.
- Keep working when Supabase is unreachable.

## Non-goals

- Pausing scraping / scans during quiet hours (scans continue; only notifications are affected).
- Per-search or per-site quiet-hours overrides.
- Multiple arbitrary windows per day.
- Mobile app support (out of scope).

## Configuration model

### Schedule

- Per-day-of-week, Mon–Sun. Each day has: `enabled`, `start` (HH:mm), `end` (HH:mm).
- A day's `end < start` means the window spans midnight into the next day.
- UI helpers: **Copy to all days**, **Copy to weekdays**.

### Timezone

- IANA timezone string (e.g. `America/Los_Angeles`).
- Default: auto-detect from the OS.
- User can override via a searchable dropdown.
- All window calculations use this timezone. DST handled by the TZ library (`date-fns-tz` or `luxon`).

### Grace period

- Integer minutes, default `0` (strict).
- If a new job arrives within `grace_minutes` of window end, treat as already outside quiet hours and notify immediately on both channels.

### Pushover owner device

- Exactly one probe instance is designated as the Pushover sender via `pushover_owner_device_id`.
- Setting this on a device writes that device's id to Supabase, implicitly un-setting it elsewhere.
- Non-owner devices never call the Pushover API, regardless of quiet-hours state.

## Data model

### Supabase

Extend the user settings row (new table `user_settings` if none exists yet) with:

| Column | Type | Notes |
|---|---|---|
| `quiet_hours_enabled` | `boolean` | master toggle |
| `quiet_hours_timezone` | `text` | IANA tz |
| `quiet_hours_schedule` | `jsonb` | `{ mon: {enabled, start, end}, ... }` |
| `quiet_hours_grace_minutes` | `integer` | default `0` |
| `pushover_owner_device_id` | `text` | nullable |
| `last_summary_sent_at` | `timestamptz` | dedupe guard for summary send |
| `updated_at` | `timestamptz` | for reconciling local vs remote |

Jobs table: add `notified_pushover_at: timestamptz` (nullable). Any row with `null` that was created during the last quiet-hours window qualifies for the summary.

### Local (per device)

File: `quiet-hours-settings.json` in the probe's user-data dir. Contains the same fields as above plus `synced_at`. Read-first on every tick; refreshed from Supabase in the background.

## Runtime behavior

### Per-scan notification decision

For each newly-ingested job:

1. Load current settings (cache, TTL ~60s).
2. Compute `in_quiet_hours_now` using schedule + timezone + grace period.
3. **Desktop (this device):** if `in_quiet_hours_now`, skip desktop notification; else notify normally.
4. **Pushover:** if this device is not the Pushover owner, skip. If owner and `in_quiet_hours_now`, skip. Otherwise send.
5. Jobs that weren't Pushover-notified retain `notified_pushover_at = NULL` (default).

Grace period applies uniformly: if `minutes_until_window_end <= grace_minutes`, `in_quiet_hours_now` is treated as `false`.

### End-of-window summary — Pushover (owner device)

A scheduler tick runs every ~60s on the owner. It tracks whether the previous tick was inside quiet hours. On an inside→outside transition:

1. Query jobs created during the just-ended window with `notified_pushover_at IS NULL`.
2. If `count > 0`:
   - Aggregate by source (site + search).
   - Conditionally update `last_summary_sent_at` (only if its current value is older than window-end) — this acts as the dedupe lock.
   - If the conditional update affected one row, send the Pushover summary.
   - Stamp `notified_pushover_at = now()` on the aggregated rows.
3. If `count == 0`, skip (no empty summary).

On Pushover API failure: retry with exponential backoff. Leave `notified_pushover_at` null so a later tick retries. Surface persistent failures in the settings UI.

### End-of-window summary — desktop (per device)

Each probe instance independently tracks its own "was in quiet hours" state in-memory. On an inside→outside transition, it counts jobs created during the window it observed and fires a single local desktop notification. No DB coordination needed — desktop summaries are per-device by design.

### Catch-up after owner downtime

If the owner device was offline when a window ended, on next tick it checks whether `last_summary_sent_at < most_recent_window_end`. If so, it runs the summary query as if it had just transitioned, sending a catch-up for any still-unnotified jobs.

### Ownership change mid-window

New owner takes over on next tick. The `notified_pushover_at IS NULL` + `last_summary_sent_at` guards ensure neither double-send nor missed send.

## Settings UI

Location: `apps/desktopProbe/src/pages/settings.tsx`, new "Quiet Hours" section.

Contents:

- Master toggle: **Enable quiet hours**
- Timezone: auto-detected, editable (searchable IANA dropdown)
- Per-day rows (Mon–Sun): enable toggle + start/end time pickers
- Buttons: **Copy to all days**, **Copy to weekdays**
- Grace period input: "Notify immediately if quiet hours end within __ minutes" (default `0`)
- Checkbox: **This device sends Pushover notifications** — writes `pushover_owner_device_id` to Supabase (only one device can hold it)

Write flow: UI writes to Supabase first. On success, local file is updated. On failure, surface error and do not update local.

## Offline / network resilience

- Settings persist to the local JSON file on every successful Supabase read.
- Startup reads local-first, then refreshes from Supabase in the background.
- If Supabase is unreachable, the probe honors the last-known local settings indefinitely.
- On reconnect, the probe reads Supabase and overwrites local if remote `updated_at` is newer.
- Pushover sends themselves require internet; queued summaries retry on next tick once connectivity returns.

## Notification content

Both channels use source-grouped format (B):

```
Title: 8 new jobs while you were away
Body:
5 from LinkedIn – "Frontend Remote"
2 from Indeed – "Product Designer"
1 from RemoteOK – "Full-Stack"
```

Clicking/tapping opens the app to the new-jobs list.

## Edge cases

- **DST:** handled by TZ library; a window like `02:00–06:00` on a spring-forward night behaves per TZ rules.
- **Midnight-spanning windows:** `end < start` on a day means it runs into the next day. "In quiet hours" check must consider the prior day's schedule too.
- **No new jobs:** summary suppressed (no empty notification).
- **Owner unchecked on all devices:** no Pushover sends at all (valid state; warn in UI).

## Testing

- Unit: `is_in_quiet_hours(now, schedule, tz, grace)` — covers tz, DST, midnight-span, grace period.
- Unit: schedule helpers — `copyToAll`, `copyToWeekdays`.
- Integration: simulate window end with unnotified jobs → verify Pushover payload shape and `notified_pushover_at` stamping.
- Concurrency: two simulated owner instances racing → conditional `last_summary_sent_at` update ensures exactly one send.
- Offline: Supabase mocked unreachable → settings load from local file; scheduler keeps honoring them.
- Catch-up: owner offline across window end, comes back → summary fires on next tick.

## Out of scope / follow-ups

Tracked separately in `BACKLOG.md`:

- Review and standardize Pushover notification functions and message format across the app.
- Rebuild first2apply as a headless server version (the deployment model this feature assumes).

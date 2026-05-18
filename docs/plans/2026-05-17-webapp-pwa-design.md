# PWA for `apps/webapp` — Design

**Date:** 2026-05-17
**Author:** Jacob (with Claude)
**Status:** Draft v2 (post Devil's-Advocate round 1 + decision-frameworks)

## 1. Goal

Convert the Next.js 15 web app at `apps/webapp` into an installable Progressive Web App that:

1. Can be added to the iOS home screen from **both** Safari and Chrome on iOS.
2. Launches in standalone mode (no browser chrome) from the home icon.
3. Works offline for the app shell **and** the user's most-recently-synced jobs list.
4. Stays within iOS Safari's storage and lifetime budgets (≈50 MB combined Cache+IDB, ~7-day eviction window).
5. Has a remotely-triggerable kill switch so a bad deploy never bricks installed users.

## 2. Non-goals

- No PWA wrapping of `apps/desktopProbe` (Electron stays as-is).
- No push notifications (separate feature; iOS 16.4+).
- No background sync (iOS support is unreliable).
- No offline mutation queue / replay. Mutations require network.
- No full precache of the entire job DB — only the last-synced page in IDB.
- No PWA-specific changes to `apps/landingPage` or `apps/blog`.

## 3. iOS constraints (load-bearing)

- All iOS browsers use WebKit. Service workers + manifest work; Chromium-only APIs (`beforeinstallprompt`) do not.
- "Add to Home Screen" on iOS is a manual user action.
- Storage: ~50 MB shared Cache + IDB; eviction after total pressure or ~7 days of non-use, including the SW registration itself.
- Apple meta tags (`apple-mobile-web-app-capable`, `apple-touch-icon`, status-bar style) are required for a polished launch.

## 4. Architecture

### 4.1 Manifest (hand-authored)

`apps/webapp/public/manifest.webmanifest`:

- `name`, `short_name`, `description`
- `start_url: "/?source=pwa"`, `scope: "/"`, `id: "/"`
- `display: "standalone"`, `orientation: "portrait"`
- `theme_color`, `background_color` matched to current theme
- Icons: 192×192, 512×512, and 512×512 maskable (PNG)
- Apple touch icon as a separate `<link rel="apple-touch-icon" sizes="180x180">` in `<head>`

### 4.2 Service worker

`@serwist/next` (actively maintained, supports Next 15 app router + React Compiler).

`apps/webapp/src/app/sw.ts`:

| Asset class | Strategy | Notes |
|---|---|---|
| Built JS/CSS/fonts | `CacheFirst`, build-hash versioned | Precached on install |
| Static HTML navigations (no `?_rsc` and no `RSC` header) | `NetworkFirst`, 3s timeout, fallback `/offline` | |
| `/login`, `/offline` | Precached | Always available offline |
| **RSC payloads** (URL contains `_rsc` or `RSC` header) | **`NetworkOnly`** | Never cache — prevents hydration mismatches (H5) |
| **All `/api/*`, all Supabase REST/RPC, anything with `Authorization`** | **`NetworkOnly`** | Never cached by SW (C1). App-layer IDB handles offline reads. |
| Images | `CacheFirst` + `ExpirationPlugin` (max 50, 30 days) | Stay under iOS budget |
| Default | `NetworkOnly` | No accidental caching |

Mutations (POST/PUT/DELETE/PATCH) are never cached or queued — they fail fast offline (H1).

### 4.3 Offline jobs data (app-layer, not SW)

Jobs lists are cached in **IndexedDB** at the app layer, keyed by `user.id`:

- On successful fetch: write the response to IDB under `jobs:{userId}:{queryKey}` with a timestamp.
- On page load while offline (`!navigator.onLine` or fetch throws `TypeError`): read the latest entry for the current `user.id` from IDB and render.
- On `signOut` / `signIn`: clear all `jobs:*` IDB entries to prevent cross-user leakage (C1).

This decouples cache lifetime from SW Cache Storage and gives us provable user isolation.

### 4.4 Offline page

`apps/webapp/src/app/offline/page.tsx` — minimal branded route. Precached. Links to retry.

### 4.5 Install affordance

`apps/webapp/src/app/components/installPrompt.tsx`:

- iOS detection robust to iPadOS-reports-as-Mac: `('standalone' in navigator) || /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && 'ontouchend' in document)`
- Standalone detection: `(window.navigator as any).standalone === true || matchMedia('(display-mode: standalone)').matches`
- Show dismissible banner only when iOS && !standalone
- Dismissal in `localStorage` with a version key so future releases can re-show

### 4.6 Apple meta (hand-edited in `layout.tsx`)

```tsx
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="First2Apply" />
<meta name="theme-color" content="#0b0b0b" />
{/* Apple splash links for common iPhone sizes — generated, hand-pasted */}
```

### 4.7 Kill switch (C2)

Three independent layers, any of which recovers a stuck install:

1. **`?nosw=1` bypass.** SW checks `self.location.search` on `fetch` events; if any client URL contained `nosw=1`, the SW calls `self.registration.unregister()` and `clients.matchAll().then(cs => cs.forEach(c => c.navigate(c.url)))`. Users (or support) can recover with one URL.
2. **Compile-time kill flag.** `sw.ts` imports a `KILL_SW` constant. Flip to `true`, build, deploy — on `activate`, the SW unregisters itself and reloads all clients. Recovers everyone on next visit.
3. **`/__sw/unregister` page.** A static HTML page served by Next that runs `navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))` and clears all caches. Linked from the offline page footer.

### 4.8 SW lifecycle telemetry (H6)

`swRegister.tsx` on the client:

- `console.info` on `controllerchange`, `updatefound`, `installed`, `activated`
- `navigator.sendBeacon('/api/sw-event', JSON.stringify({event, swVersion, ts}))` (best-effort, no PII)
- A no-op API route `/api/sw-event` for v1 — collect in logs only; defer dashboards

### 4.9 Auth-expiry handling (H2)

- `/login` and `/offline` are precached.
- A client-side fetch interceptor catches 401 from server actions and shows a "Session expired — reconnect" toast instead of redirecting. If online, it triggers Supabase token refresh; if offline, it disables the affected UI.

### 4.10 Cold-return UX (H3)

On boot, the client checks IDB for a `lastSyncAt` marker. If missing (fresh install or evicted state) and offline, the user is sent to `/offline` with a "Welcome back — we need to reconnect to sync your jobs" message. If online, a small toast shows "Syncing…" while the first fetch completes.

## 5. Security / privacy

- SW never caches authenticated responses (§4.2). Cross-user leakage is structurally impossible because the SW only sees public/static traffic.
- IDB-backed jobs cache is keyed by `user.id` and cleared on auth state change.
- Logout flow: `supabase.auth.onAuthStateChange(SIGNED_OUT)` → clear all `jobs:*` IDB entries and call `caches.delete()` for the image cache (in case it held avatars).
- SW scope is the whole origin (required for nav handling). HTTPS-only.
- CSP: a follow-up audit (M4) — registering a SW expands persistence surface for XSS. Tracked, not blocking v1 because there's no untrusted user-rendered HTML on `apps/webapp` today.

## 6. Icons & splash screens

`pwa-asset-generator` in **icons-only mode** to avoid clobbering hand-edited files (H4):

```
npx pwa-asset-generator ./brand/logo.svg ./public/icons \
  --type png --favicon --maskable \
  --opaque false --padding "10%"
```

No `--index`, no `--manifest` flags. Manifest + Apple meta are hand-edited. Splash screen `<link>` tags are pasted in from the generator's stdout. Command documented in `apps/webapp/README.md`.

## 7. Files to touch

**New:**
- `apps/webapp/public/manifest.webmanifest`
- `apps/webapp/public/icons/*` (generated, committed)
- `apps/webapp/src/app/sw.ts`
- `apps/webapp/src/app/offline/page.tsx`
- `apps/webapp/src/app/__sw/unregister/page.tsx` (plain client component)
- `apps/webapp/src/app/api/sw-event/route.ts` (no-op v1)
- `apps/webapp/src/app/components/installPrompt.tsx`
- `apps/webapp/src/app/components/swRegister.tsx`
- `apps/webapp/src/app/components/offlineGate.tsx`
- `apps/webapp/src/lib/jobsCache.ts` (IDB wrapper, user-keyed)
- `apps/webapp/src/lib/authInterceptor.ts` (401 handler)

**Modified:**
- `apps/webapp/package.json` (deps: `@serwist/next`, `serwist`, `idb`; devDep `pwa-asset-generator`)
- `apps/webapp/next.config.ts` (wrap with `withSerwist`)
- `apps/webapp/src/app/layout.tsx` (manifest/meta/Apple links + `<SwRegister/>` + `<InstallPrompt/>`)
- `apps/webapp/src/app/jobs/*` (wrap mutating controls in `<OfflineGate>`; read through `jobsCache` on offline error)
- `apps/webapp/README.md` (PWA section + kill-switch ops)

## 8. Validation

- `pnpm --filter @first2apply/webapp build` succeeds; `public/sw.js` emitted.
- `pnpm --filter @first2apply/webapp typecheck` clean.
- Lighthouse PWA audit ≥ 90 on a production build served locally.
- **Auth-isolation test:** sign in as User A → fetch jobs → sign out → sign in as User B → DevTools IDB shows no `jobs:{userA}` entries; jobs list does not flash User A's data.
- **Kill-switch tests:**
  - Append `?nosw=1` → reload twice → `navigator.serviceWorker.getRegistrations()` returns `[]`.
  - Build with `KILL_SW=true` → install → next visit on stale build self-unregisters.
  - `/__sw/unregister` clears registrations and Cache Storage.
- **RSC test:** Navigate between routes after a deploy → no hydration mismatch warnings in console.
- **Manual on real iPhone (via Tailscale):**
  - Safari A2HS → standalone launch.
  - Chrome iOS A2HS → standalone launch.
  - Airplane mode + relaunch → shell renders, last-synced jobs visible (from IDB), uncached nav → `/offline`.
  - Sign-out → sign-in as different user → no leakage.
  - Force-quit & relaunch after 8 days simulated (clear caches manually) → cold-return UX fires.

## 9. Rollout

1. Ship behind no flag — PWA assets are inert for non-installers.
2. Release notes call out "Add to Home Screen on iPhone" as a new capability.
3. Monitor `/api/sw-event` ingestion for `activated` events post-deploy. If <50% of expected clients activate within 24h of a release, investigate before the next deploy.
4. **Kill-switch runbook** in `apps/webapp/README.md`: when to flip `KILL_SW`, how to verify, how to roll forward.

## 10. Risks (post-decision)

- iOS storage eviction still wipes IDB after ~7d idle. Mitigation: cold-return UX (§4.10); acknowledged as a WebKit constraint we don't fight.
- SW + React Compiler interaction is novel. Mitigation: pin known-good versions; if build fails, disable React Compiler in `apps/webapp` (one-line config), file an issue.
- `sendBeacon` to `/api/sw-event` can be blocked by privacy extensions on desktop. Mitigation: it's best-effort observability, not load-bearing.
- CSP audit (M4) deferred. Mitigation: tracked; no XSS surface today on this app.

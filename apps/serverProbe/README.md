# first2apply-server-probe

Headless server-side probe scaffold. Spec: `spec.md` §5 Item 4 + §9.1.

## Status (2026-04-25 weekend run)

- Scaffold only. Compiles cleanly, runs `--probe-once` against `tests/fixtures/scrape/*.json` when `F2A_MOCK_SCRAPE=1`.
- Live scraping path: NOT wired (the desktop scrapers are bound to `app.whenReady()` and `BrowserView` — porting them to Xvfb-headed Electron is a Monday item).
- Electron + electron-builder packaging: deferred to Monday.

## Run

```sh
pnpm --filter first2apply-server-probe build
F2A_MOCK_SCRAPE=1 node apps/serverProbe/dist/main.js --probe-once
```

## Monday TODO

1. Wire real Electron app shell (`app.whenReady()` + `BrowserView`) under Xvfb.
2. Import `apps/desktopProbe/src/server/jobScanner.ts` & friends; share via a workspace package.
3. Add `electron-builder.yml` for `--linux --arm64` build.
4. Wire systemd unit `f2a-server-probe.service` to start on boot (already templated in `deploy/pi/systemd/`).

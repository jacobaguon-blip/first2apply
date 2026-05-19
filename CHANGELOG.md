# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 2026-05-19
- `16:57` -- chore(backend): bump queue-pending-link cap 30 → 200 _(session `b13081bb`)_
  - `apps/backend/supabase/functions/queue-pending-link/index.ts`
- `16:28` -- feat(career-ops): Tier 2 evaluate-job + careers-page chooser _(session `ffe92ae1`)_
  - `apps/backend/supabase/functions/_shared/careerOpsPrompts.ts`
  - `apps/backend/supabase/functions/evaluate-job/deno.json`
  - `apps/backend/supabase/functions/evaluate-job/index.ts`
  - `apps/desktopProbe/src/components/createLink.tsx`
  - `apps/desktopProbe/src/components/home/jobDetails.tsx`
- `15:17` -- chore(release): bump desktop to 2.4.0 _(session `8234ad6e`)_
  - `apps/desktopProbe/package.json`
- `14:51` -- feat(career-ops): Tier 1 — master CV + tailored CV + PDF export _(session `63bcbdd6`)_
  - `apps/backend/supabase/functions/_shared/careerOpsPrompts.ts`
  - `apps/backend/supabase/functions/parse-cv/deno.json`
  - `apps/backend/supabase/functions/parse-cv/index.ts`
  - `apps/backend/supabase/functions/tailor-cv/deno.json`
  - `apps/backend/supabase/functions/tailor-cv/index.ts`
- `07:42` -- feat(desktop): 2-hop discovery — follow careers page to ATS when needed _(session `24196dcd`)_
  - `apps/desktopProbe/src/server/pendingLinkDrainer.ts`
- `07:27` -- feat(desktop): editable pending entries + 7-day completed history + more ATS hints _(session `70538a86`)_
  - `apps/backend/supabase/migrations/20260519000000_pending_links_history.sql`
  - `apps/desktopProbe/src/components/pendingFromIphone.tsx`
  - `apps/desktopProbe/src/lib/electronMainSdk.tsx`
  - `apps/desktopProbe/src/server/pendingLinkDrainer.ts`
  - `apps/desktopProbe/src/server/rendererIpcApi.ts`
- `05:14` -- fix(desktop): require careers-looking path in DDG fallback results _(session `18f75bd9`)_
  - `apps/desktopProbe/src/server/pendingLinkDrainer.ts`

## 2026-05-18
- `21:59` -- feat(desktop): DuckDuckGo fallback for careers-page discovery + URL scheme tolerance _(session `18f75bd9`)_
  - `apps/backend/supabase/functions/queue-pending-link/index.ts`
  - `apps/desktopProbe/src/server/pendingLinkDrainer.ts`
- `18:31` -- feat(desktop): careers-page auto-discovery + "Pending from iPhone" panel _(session `b6978153`)_
  - `apps/desktopProbe/package.json`
  - `apps/desktopProbe/src/components/iphoneShareSettings.tsx`
  - `apps/desktopProbe/src/components/pendingFromIphone.tsx`
  - `apps/desktopProbe/src/lib/electronMainSdk.tsx`
  - `apps/desktopProbe/src/pages/links.tsx`
- `15:10` -- feat(pi): front PWA with Caddy at first2apply.maadcloud.com _(session `0cd0d67c`)_
  - `apps/webapp/README.md`
  - `deploy/pi/systemd/f2a-web-ui.service`
- `14:02` -- docs(session): pwa-on-pi session record + backlog updates _(session `5087e999`)_
  - `BACKLOG.md`
  - `docs/sessions/2026-05-18-pwa-on-pi.md`
- `13:03` -- fix(deploy): wait for service to listen before smoke _(session `5087e999`)_
  - `scripts/deploy-webapp-to-pi.sh`
- `12:59` -- chore(webapp): gitignore Serwist build outputs _(session `5087e999`)_
  - `apps/webapp/.gitignore`
- `12:57` -- chore(webapp): untrack Serwist build outputs (regenerated each build) _(session `5087e999`)_
  - `apps/webapp/public/sw.js`
  - `apps/webapp/public/swe-worker-f61931bc2770d10b.js`
- `12:53` -- fix(deploy): default PI_SSH_TARGET to maadkal@<tailscale-ip> _(session `c1ddff3e`)_
  - `scripts/deploy-webapp-to-pi.sh`
- `12:21` -- feat(webapp): host PWA on the Raspberry Pi via Next.js standalone _(session `51817e59`)_
  - `.claude/plans/2026-05-18-pwa-pi-deploy.md`
  - `apps/webapp/README.md`
  - `apps/webapp/next.config.ts`
  - `apps/webapp/package.json`
  - `apps/webapp/public/sw.js`
- `12:10` -- feat(desktop): iPhone Sharing settings panel (tokens + endpoint copy) _(session `51817e59`)_
  - `apps/desktopProbe/src/components/iphoneShareSettings.tsx`
  - `apps/desktopProbe/src/lib/electronMainSdk.tsx`
  - `apps/desktopProbe/src/pages/settings.tsx`

## 2026-05-17
- `22:29` -- feat(desktop): company target URL validator + sweep _(session `02a8c8d0`)_
  - `docs/sessions/2026-05-11-pi-manual-scan-and-service-role-auth-fix.md`
  - `recon-build-notes-phase2-prompt.md`
- `22:28` -- feat(desktop): validate company target URLs before saving with smart suggestions _(session `02a8c8d0`)_
  - `apps/desktopProbe/package.json`
  - `apps/desktopProbe/src/components/createCompanyTarget.tsx`
  - `apps/desktopProbe/src/lib/electronMainSdk.tsx`
  - `apps/desktopProbe/src/server/__tests__/domSignals.test.ts`
  - `apps/desktopProbe/src/server/__tests__/targetValidator.test.ts`
- `21:50` -- feat(desktop): validate company target URLs before saving; recommend correct jobs-list URL when the pasted link is a single job, careers landing, or unrelated page
  - `apps/desktopProbe/src/server/targetValidator/urlShape.ts`
  - `apps/desktopProbe/src/server/targetValidator/domSignals.ts`
  - `apps/desktopProbe/src/server/targetValidator/index.ts`
  - `apps/desktopProbe/src/server/targetValidator/singleShotFetcher.ts`
  - `apps/desktopProbe/src/server/rendererIpcApi.ts`
  - `apps/desktopProbe/src/lib/electronMainSdk.tsx`
  - `apps/desktopProbe/src/components/createCompanyTarget.tsx`
- `21:35` -- feat: iOS share-sheet queue → desktop drain → targeted website _(session `e459dfcd`)_
  - `apps/backend/supabase/functions/_shared/cors.ts`
  - `apps/backend/supabase/functions/queue-pending-link/deno.json`
  - `apps/backend/supabase/functions/queue-pending-link/index.ts`
  - `apps/backend/supabase/migrations/20260517120000_pending_links.sql`
  - `apps/backend/supabase/migrations/20260517120100_user_api_tokens.sql`
- `21:32` -- feat(webapp): installable PWA with offline shell and kill switch _(session `e459dfcd`)_
  - `apps/webapp/README.md`
  - `apps/webapp/next.config.ts`
  - `apps/webapp/package.json`
  - `apps/webapp/public/manifest.webmanifest`
  - `apps/webapp/public/sw.js`
- `21:07` -- docs(webapp): add PWA design plan v2 _(session `e459dfcd`)_
  - `docs/plans/2026-05-17-webapp-pwa-design.md`

## 2024-01-12
- **Backfilled** `.gitignore` — Initial commit
- **Backfilled** `.vscode/extensions.json` — feat: boilerplate project
- **Backfilled** `desktopProbe/components.json` — feat: add shadcn lib
- **Backfilled** `desktopProbe/package-lock.json` — feat: working router
- **Backfilled** `.vscode/settings.json` — feat: working prototype
- **Backfilled** `.vscode/settings.json` — Create login and signup pages
- **Backfilled** `desktopProbe/src/components/loginCard.tsx` — Update login and signup with links
- **Backfilled** `desktopProbe/package-lock.json` — feat: cron job and notification
- **Backfilled** `desktopProbe/src/components/loginCard.tsx` — feat: working auth
- **Backfilled** `supabase/seed.sql` — feat: seed sql with tables
- **Backfilled** `supabase/seed.sql` — feat: add RLS policies to seed.sql

## 2024-01-13
- **Backfilled** `desktopProbe/src/components/cronSchedule.tsx` — feat: add schedule component
- **Backfilled** `desktopProbe/src/components/cronSchedule.tsx` — feat: cron engine working
- **Backfilled** `desktopProbe/package-lock.json` — feat: dark mode
- **Backfilled** `desktopProbe/src/pages/login.tsx` — Hide navbar for login and signup
- **Backfilled** `desktopProbe/src/components/ui/card.tsx` — Add new screen size and make card responive for small screens
- **Backfilled** `.vscode/launch.json` — feat: scan all htmls in one edge function call
- **Backfilled** `desktopProbe/src/app.tsx` — Create dashboard for home page
- **Backfilled** `desktopProbe/package-lock.json` — feat: componetnts layout
- **Backfilled** `desktopProbe/src/app.tsx` — feat: mostly working UI

## 2024-01-14
- **Backfilled** `desktopProbe/src/components/cronSchedule.tsx` — feat: reworked settings
- **Backfilled** `desktopProbe/src/pages/navbar.tsx` — Create navbar
- **Backfilled** `desktopProbe/src/server/jobScanner.ts` — feat: implemented runtime settings
- **Backfilled** `desktopProbe/src/index.ts` — fix: session storage
- **Backfilled** `desktopProbe/src/pages/home.tsx` — fix: settings loading and display only visible jobs
- **Backfilled** `desktopProbe/src/app.tsx` — feat: add remoteok provider
- **Backfilled** `supabase/seed.sql` — fix: table schema
- **Backfilled** `supabase/seed.sql` — fix: links schema
- **Backfilled** `desktopProbe/src/components/loginCard.tsx` — Update login and signup to use the primary color
- **Backfilled** `desktopProbe/src/server/jobHelpers.ts` — feat: add we work remotely
- **Backfilled** `desktopProbe/src/components/loginCard.tsx` — Refactor login and signup to forms
- **Backfilled** `desktopProbe/src/components/ui/button.tsx` — Change accent color and fix default button hover color
- **Backfilled** `desktopProbe/src/components/createLink.tsx` — Remove unused imports and containers
- **Backfilled** `desktopProbe/src/server/jobHelpers.ts` — feat: add indeed and glassdoor
- **Backfilled** `desktopProbe/src/server/helpers.ts` — fix: download links in sequence
- **Backfilled** `desktopProbe/src/index.css` — Fix shades of primary color

## 2024-01-15
- **Backfilled** `desktopProbe/forge.config.ts` — feat: tray menu
- **Backfilled** `desktopProbe/src/app.tsx` — feat: navigation from tray menu
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — Complete homepage ui
- **Backfilled** `desktopProbe/src/components/ui/skeleton.tsx` — Fix skeleton bg color
- **Backfilled** `desktopProbe/src/pages/defaultLayout.tsx` — Fix default layout max width

## 2024-01-18
- **Backfilled** `desktopProbe/src/components/createLink.tsx` — Links page ui and delete unused dashboard
- **Backfilled** `desktopProbe/src/index.css` — Slightly darker blacks
- **Backfilled** `desktopProbe/src/pages/settings.tsx` — Style settings page

## 2024-01-20
- **Backfilled** `desktopProbe/src/app.tsx` — feat: handle naviation from notification
- **Backfilled** `supabase/functions/_shared/jobParser.ts` — fix: stabilize job parsers
- **Backfilled** `supabase/functions/_shared/jobParser.ts` — feat: add site providers in DB
- **Backfilled** `supabase/functions/_shared/jobParser.ts` — fix: parsing
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — feat: apply button working

## 2024-01-21
- **Backfilled** `supabase/seed.sql` — chore: update seed sql
- **Backfilled** `desktopProbe/images/trayIconTemplate.png` — fix: tray icon
- **Backfilled** `desktopProbe/images/trayIconTemplate.png` — fix: tray icon and logo on navbar
- **Backfilled** `desktopProbe/forge.config.ts` — feat: wip installers
- **Backfilled** `desktopProbe/package.json` — chore: update author
- **Backfilled** `desktopProbe/package.json` — chore: update description
- **Backfilled** `desktopProbe/forge.config.ts` — fix: minor stuff
- **Backfilled** `desktopProbe/forge.config.ts` — fix: win32
- **Backfilled** `desktopProbe/forge.config.ts` — fix: exe icon
- **Backfilled** `desktopProbe/package-lock.json` — Create tab component
- **Backfilled** `desktopProbe/src/components/cronSchedule.tsx` — Update homepage to handle multiple scenario cases
- **Backfilled** `desktopProbe/images/trayIcon.ico` — fix: win32
- **Backfilled** `desktopProbe/src/server/jobScanner.ts` — fix: win32 notification

## 2024-01-22
- **Backfilled** `desktopProbe/src/index.ts` — feat: encrypt user session before storing to disk
- **Backfilled** `desktopProbe/forge.config.ts` — fix: add app bundle id
- **Backfilled** `desktopProbe/forge.config.ts` — fix: add app bundle id
- **Backfilled** `desktopProbe/src/index.ts` — fix(win32): show taskbar icon when window is shown

## 2024-01-24
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — Archive job
- **Backfilled** `desktopProbe/src/components/linksList.tsx` — Delete link

## 2024-01-25
- **Backfilled** `desktopProbe/src/components/createLink.tsx` — List all sites
- **Backfilled** `desktopProbe/src/server/htmlDownloader.ts` — feat: trigger infinite load when scraping site
- **Backfilled** `desktopProbe/forge.config.ts` — fix: forge config default CSP
- **Backfilled** `assets/sitesIcons/glassdoor-long.png` — Add sites icons
- **Backfilled** `desktopProbe/src/index.css` — Fix card bg color
- **Backfilled** `desktopProbe/src/components/cronSchedule.tsx` — Make interval selector background glass
- **Backfilled** `desktopProbe/src/app.tsx` — feat: add side logos
- **Backfilled** `supabase/seed.sql` — fix: seeq sql
- **Backfilled** `desktopProbe/src/components/linksList.tsx` — Open link listing outside
- **Backfilled** `desktopProbe/src/server/supabaseApi.ts` — fix: limit to 200 jobs
- **Backfilled** `desktopProbe/src/hooks/error.tsx` — feat: logout button
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — fix: add keys
- **Backfilled** `desktopProbe/src/pages/settings.tsx` — fix: email settings description
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — fix: jobs list spacing
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — fix: remove unneeded key

## 2024-01-27
- **Backfilled** `desktopProbe/src/pages/home.tsx` — Remove unused import
- **Backfilled** `desktopProbe/src/components/createLink.tsx` — Update createLinks with useSites hook and change ui
- **Backfilled** `desktopProbe/src/components/ui/toast.tsx` — Add success toast variant
- **Backfilled** `desktopProbe/src/components/createLink.tsx` — Send toast when new link is saved and fix sites text color
- **Backfilled** `desktopProbe/src/pages/links.tsx` — Show newly saved link first
- **Backfilled** `desktopProbe/src/components/linksList.tsx` — Fix link id type
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — Job title max width

## 2024-01-29
- **Backfilled** `desktopProbe/src/components/skeletons/CreateLinkSkeleton.tsx` — Create skeletons for homepage and links
- **Backfilled** `desktopProbe/src/components/cronSchedule.tsx` — Small fix to CronSchedule semantics
- **Backfilled** `desktopProbe/src/app.tsx` — Load saved links using a context and use skeletons for loading
- **Backfilled** `desktopProbe/src/app.tsx` — Load setting in context and add skeleton
- **Backfilled** `desktopProbe/src/pages/home.tsx` — Add count jobs to tabs
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — Handle state for no jobs to show
- **Backfilled** `desktopProbe/src/components/linksList.tsx` — Add icon to link avatar
- **Backfilled** `desktopProbe/src/server/supabaseApi.ts` — fix: ts compile

## 2024-01-30
- **Backfilled** `assets/sitesIcons/glassdoor-long.png` — feat: rework icons

## 2024-02-01
- **Backfilled** `desktopProbe/forge.config.ts` — feat: add deeplink support
- **Backfilled** `desktopProbe/src/index.ts` — fix: deep link
- **Backfilled** `desktopProbe/src/index.ts` — fix: properly close all open resources
- **Backfilled** `desktopProbe/src/index.css` — Change dark theme
- **Backfilled** `desktopProbe/src/app.tsx` — feat: e2e password reset
- **Backfilled** `desktopProbe/src/index.ts` — fix: deeplink handling win32
- **Backfilled** `desktopProbe/src/server/htmlDownloader.ts` — fix: improve error handling for job scanner
- **Backfilled** `desktopProbe/src/server/rendererIpcApi.ts` — fix: shell open

## 2024-02-05
- **Backfilled** `desktopProbe/package-lock.json` — Add help page
- **Backfilled** `desktopProbe/src/app.tsx` — Fix app to send home
- **Backfilled** `desktopProbe/src/components/ui/button.tsx` — Make setting bigger

## 2024-02-06
- **Backfilled** `desktopProbe/src/components/linksList.tsx` — Make links list bigger

## 2024-02-07
- **Backfilled** `desktopProbe/src/pages/home.tsx` — Add Applied tab and query params

## 2024-02-08
- **Backfilled** `desktopProbe/src/index.ts` — feat: show deeplink error
- **Backfilled** `desktopProbe/src/pages/settings.tsx` — feat: show user email in settings page
- **Backfilled** `desktopProbe/src/app.tsx` — feat: working status field and tabs
- **Backfilled** `supabase/seed.sql` — Fix sql
- **Backfilled** `desktopProbe/forge.config.ts` — chore: osx sign config
- **Backfilled** `desktopProbe/package-lock.json` — feat: add infinite scroll
- **Backfilled** `desktopProbe/src/pages/home.tsx` — refactor: job status update method
- **Backfilled** `desktopProbe/src/env.ts` — fix: open dev tools only in dev mode
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — Make buttons for mark as applied and archived work

## 2024-02-09
- **Backfilled** `desktopProbe/src/index.ts` — fix: navigation to new tab
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — Fix spacing for jobsList and its skeleton
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — fix: pagination with sorting based on last updated date
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — Add scroll to top
- **Backfilled** `desktopProbe/src/server/supabaseApi.ts` — fix: jobs listing using db function
- **Backfilled** `desktopProbe/src/pages/home.tsx` — fix: load more jobs when archiving until list does empty
- **Backfilled** `desktopProbe/src/components/createLink.tsx` — Fix spinner when saving link
- **Backfilled** `desktopProbe/src/components/createLink.tsx` — Fix toast for saving unsupported links
- **Backfilled** `desktopProbe/src/components/createLink.tsx` — fix: error handling
- **Backfilled** `desktopProbe/src/components/createLink.tsx` — fix: save link loading text
- **Backfilled** `desktopProbe/src/server/supabaseApi.ts` — fix: crash with empty data
- **Backfilled** `desktopProbe/src/index.ts` — fix: remove debug dialog
- **Backfilled** `desktopProbe/src/components/signupCard.tsx` — fix: handle errors in signup card
- **Backfilled** `desktopProbe/src/index.ts` — fix: per env session file
- **Backfilled** `desktopProbe/src/lib/types.ts` — fix: remove 1 minute cron option
- **Backfilled** `desktopProbe/src/components/loginCard.tsx` — fix: loading state for login and signup

## 2024-02-10
- **Backfilled** `desktopProbe/package-lock.json` — chore: move luxon to desktop probe
- **Backfilled** `desktopProbe/src/pages/signup.tsx` — fix: signup page error handling
- **Backfilled** `desktopProbe/src/components/signupCard.tsx` — fix typo
- **Backfilled** `desktopProbe/src/components/createLink.tsx` — fix form reset on create link error
- **Backfilled** `supabase/functions/_shared/jobParser.ts` — fix: support for job site subdomains
- **Backfilled** `supabase/functions/_shared/jobParser.ts` — fix: compare only domain name without tld

## 2024-02-12
- **Backfilled** `desktopProbe/forge.config.ts` — chore: add appx maker
- **Backfilled** `desktopProbe/package.json` — chore: try without author email
- **Backfilled** `desktopProbe/forge.config.ts` — chore: update publisher
- **Backfilled** `desktopProbe/forge.config.ts` — chore: try fix appx
- **Backfilled** `desktopProbe/forge.config.ts` — chore: fix publisher display name
- **Backfilled** `desktopProbe/forge.config.ts` — chore: fix appx publisher
- **Backfilled** `desktopProbe/forge.config.ts` — chore: try use forge option for store compat
- **Backfilled** `desktopProbe/forge.config.ts` — chore: try using undocumented option
- **Backfilled** `desktopProbe/forge.config.ts` — fix: appx package name

## 2024-02-13
- **Backfilled** `desktopProbe/forge.config.ts` — chore: fix appx icons
- **Backfilled** `desktopProbe/packagers/appx/SampleAppx.150x150.png` — chore: rework appx icons
- **Backfilled** `desktopProbe/src/index.css` — fix light theme primary foreground color
- **Backfilled** `desktopProbe/packagers/appx/SampleAppx.44x44.targetsize-44_altform-unplated.png.png` — chore: try fix win taskbar icon
- **Backfilled** `desktopProbe/packagers/appx/SampleAppx.44x44.targetsize-44_altform-unplated.png` — chore: fix taskbar icon
- **Backfilled** `desktopProbe/forge.config.ts` — chore: try fix appx icons
- **Backfilled** `desktopProbe/packagers/appx/icons/SampleAppx.150x150.png` — chore: try fix incons
- **Backfilled** `desktopProbe/packagers/appx/AppXManifest.xml` — chore: remove appx bg color
- **Backfilled** `desktopProbe/packagers/appx/AppXManifest.xml` — Revert "chore: remove appx bg color"
- **Backfilled** `supabase/functions/_shared/jobParser.ts` — fix: glassdoor parser

## 2024-02-15
- **Backfilled** `supabase/functions/_shared/jobParser.ts` — fix: blacklisted paths

## 2024-02-17
- **Backfilled** `README.md` — chore: readme

## 2024-02-18
- **Backfilled** `desktopProbe/src/components/linksList.tsx` — side navbar
- **Backfilled** `desktopProbe/src/pages/defaultLayout.tsx` — fix default layout margin
- **Backfilled** `desktopProbe/src/components/navbar.tsx` — remove isHidden from navbar
- **Backfilled** `desktopProbe/src/pages/forgotPassword.tsx` — Also fix fogot password
- **Backfilled** `desktopProbe/src/components/navbar.tsx` — fix padding for navbar on big screens
- **Backfilled** `desktopProbe/forge.config.ts` — feat: publish artifacts to S3 along with release json
- **Backfilled** `desktopProbe/package-lock.json` — feat: implement auto updater
- **Backfilled** `desktopProbe/package.json` — chore: new version

## 2024-02-19
- **Backfilled** `supabase/functions/_shared/jobParser.ts` — add job parser for Dice
- **Backfilled** `README.md` — feat(desktopProbe): auto updater for macos
- **Backfilled** `desktopProbe/package-lock.json` — feat: add pino logger
- **Backfilled** `desktopProbe/package-lock.json` — feat: add support for mezmo pino transport
- **Backfilled** `desktopProbe/src/index.ts` — feat: add metadata to logger and flush on exit
- **Backfilled** `desktopProbe/package-lock.json` — feat: amplitude tracking
- **Backfilled** `supabase/functions/_shared/jobParser.ts` — add job parser for flexjobs

## 2024-02-20
- **Backfilled** `supabase/functions/_shared/jobParser.ts` — add parser for bestjobs

## 2024-02-26
- **Backfilled** `blog/.env.example` — feat: add blog

## 2024-02-28
- **Backfilled** `desktopProbe/src/index.ts` — fix: session loading
- **Backfilled** `supabase/functions/_shared/jobParser.ts` — fix: glassdoor parser
- **Backfilled** `desktopProbe/src/index.ts` — fix: better handling for quit from dock
- **Backfilled** `supabase/functions/_shared/jobParser.ts` — add: job parser for echojobs

## 2024-02-29
- **Backfilled** `desktopProbe/webpack.main.config.ts` — fix: partially the webpack config for pino
- **Backfilled** `desktopProbe/src/server/jobScanner.ts` — feat: wip scraping job description
- **Backfilled** `desktopProbe/src/server/jobScanner.ts` — fix: replace logger usage
- **Backfilled** `desktopProbe/package-lock.json` — feat(scraper): retry when a page is redirecting to a paywall
- **Backfilled** `desktopProbe/src/server/htmlDownloader.ts` — fix(scraper): hide window and make authwall a warn log
- **Backfilled** `desktopProbe/src/server/jobScanner.ts` — fix: html scanner
- **Backfilled** `desktopProbe/src/lib/electronMainSdk.tsx` — feat: working job description parsing
- **Backfilled** `supabase/functions/_shared/jobParser.ts` — add: job parser for remotive

## 2024-03-02
- **Backfilled** `supabase/functions/_shared/jobParser.ts` — add: job parser for remote.io
- **Backfilled** `supabase/functions/_shared/jobParser.ts` — add: job parser for builtin jobs
- **Backfilled** `supabase/functions/_shared/jobParser.ts` — add: job parser for naukri jobs

## 2024-03-04
- **Backfilled** `desktopProbe/package-lock.json` — feat: working jd in app browser
- **Backfilled** `desktopProbe/src/pages/home.tsx` — feat: wip scrape on demand
- **Backfilled** `desktopProbe/.eslintrc.json` — feat: reviews implemetation wip
- **Backfilled** `supabase/functions/_shared/jobParser.ts` — fix: add optional chaining where missing
- **Backfilled** `supabase/functions/_shared/jobParser.ts` — fix: add missing optional chaining
- **Backfilled** `desktopProbe/src/components/cronSchedule.tsx` — Add cron job to settings
- **Backfilled** `desktopProbe/src/components/navbar.tsx` — fix: extend navbar after higher breakpoint
- **Backfilled** `desktopProbe/src/pages/home.tsx` — fix: on demand jd scanning

## 2024-03-05
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — feat: extended main job sites
- **Backfilled** `desktopProbe/package-lock.json` — fix: replace pino with plain logdna
- **Backfilled** `desktopProbe/src/index.ts` — fix: open external urls in default browser
- **Backfilled** `desktopProbe/src/components/navbar.tsx` — feat: add theme toggle

## 2024-03-06
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — fix: on demand JD scraping
- **Backfilled** `desktopProbe/src/components/navbar.tsx` — fix: navbar tooltips
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — fix: sanize only linkedin and remove regex
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — feat: wip
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — fix: remove node in remoteok
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — fix: job list ui
- **Backfilled** `desktopProbe/src/components/navbar.tsx` — fix: navbar and tooltip
- **Backfilled** `desktopProbe/src/components/createLink.tsx` — feat(searches): add explainer card with gif how to copy URL
- **Backfilled** `desktopProbe/src/components/jobDetails.tsx` — fix: job list
- **Backfilled** `desktopProbe/src/components/navbar.tsx` — fix: navbar
- **Backfilled** `desktopProbe/src/pages/home.tsx` — fix: border
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — feat: wip
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — fix: markdown removal tries
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — fix: dont select job when archiving + jd parse reverse order
- **Backfilled** `desktopProbe/src/pages/home.tsx` — feat: add refresh list btn

## 2024-03-07
- **Backfilled** `desktopProbe/src/components/jobDetails.tsx` — fix: job details
- **Backfilled** `desktopProbe/src/components/jobDetails.tsx` — fix: job details
- **Backfilled** `desktopProbe/src/pages/home.tsx` — fix: new jobs tab
- **Backfilled** `desktopProbe/package-lock.json` — feat: add new link from using dialog
- **Backfilled** `desktopProbe/src/components/jobDetails.tsx` — feat: automatically apply for jobs
- **Backfilled** `desktopProbe/src/components/jobSummary.tsx` — fix: conditionally show buttons in job summary
- **Backfilled** `desktopProbe/src/components/jobDetails.tsx` — feat: failure state for job description panel
- **Backfilled** `desktopProbe/src/components/createLink.tsx` — fix: links page
- **Backfilled** `desktopProbe/src/components/createLink.tsx` — fix: create link modal
- **Backfilled** `desktopProbe/src/components/createLink.tsx` — fix: badge variant
- **Backfilled** `desktopProbe/package.json` — chore: minor version bump
- **Backfilled** `desktopProbe/packagers/appx/AppXManifest.xml` — fix: appx manifest version
- **Backfilled** `desktopProbe/src/index.ts` — fix: deeplink navigation only for app protocol urls
- **Backfilled** `desktopProbe/forge.config.ts` — fix: use autogenerated appx manifest
- **Backfilled** `desktopProbe/package.json` — chore: patch version
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — fix: no jobs message
- **Backfilled** `desktopProbe/src/components/skeletons/JobsListSkeleton.tsx` — fix: jobs skeleton
- **Backfilled** `desktopProbe/forge.config.ts` — Revert "fix: use autogenerated appx manifest"
- **Backfilled** `desktopProbe/packagers/appx/AppXManifest.xml` — chore: bump appx version
- **Backfilled** `assets/sitesIcons/bestjobs.png` — chore: icons for new sites

## 2024-03-08
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — feat: jd parsers for all missing providers
- **Backfilled** `desktopProbe/src/pages/links.tsx` — fix: no links ui
- **Backfilled** `desktopProbe/src/components/jobSummary.tsx` — fix: render just company logo

## 2024-03-09
- **Backfilled** `desktopProbe/package-lock.json` — fix: added get and policies
- **Backfilled** `desktopProbe/src/components/reviewSuggestionPopup.tsx` — fix: delete review popup

## 2024-03-10
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — feat(jobs): add parser for robert half
- **Backfilled** `desktopProbe/package-lock.json` — fix: links list

## 2024-03-11
- **Backfilled** `desktopProbe/src/index.ts` — fix: do not clear the cache on every app start
- **Backfilled** `blog/app/tag-data.json` — feat: blog data
- **Backfilled** `blog/app/api/newsletter/route.ts` — fix: blog build
- **Backfilled** `blog/next.config.js` — fix: blog base path
- **Backfilled** `blog/app/Main.tsx` — fix: move blog pages top level
- **Backfilled** `blog/app/Main.tsx` — fix: import paths for images
- **Backfilled** `blog/components/Footer.tsx` — fix(blog): remove external links to tailwind template
- **Backfilled** `blog/app/sitemap.ts` — fix: base path fixes
- **Backfilled** `blog/public/static/images/canada/lake.jpg` — chore: cleanup blog images
- **Backfilled** `blog/data/authors/default.mdx` — fix(blog): author image
- **Backfilled** `desktopProbe/src/components/skeletons/CreateLinkSkeleton.tsx` — fix: links list skeleton
- **Backfilled** `blog/contentlayer.config.ts` — fix(blog): canonical urls
- **Backfilled** `blog/next.config.js` — fix(blog): images remote patterns
- **Backfilled** `blog/app/layout.tsx` — fix(blog): search component

## 2024-03-12
- **Backfilled** `blog/data/siteMetadata.js` — feat(blog): add google analytics tracking
- **Backfilled** `blog/data/authors/default.mdx` — feat(blog): new article about searching multiple job sites
- **Backfilled** `blog/app/tag-data.json` — feat(blog): add article about resume tailoring
- **Backfilled** `blog/layouts/PostLayout.tsx` — fix(blog): prev, next article links
- **Backfilled** `desktopProbe/src/components/linksList.tsx` — fix: add site name to search list
- **Backfilled** `desktopProbe/src/server/supabaseApi.ts` — fix: add backoff retries to supabase calls
- **Backfilled** `desktopProbe/packagers/appx/AppXManifest.xml` — chore: update appx manifest version
- **Backfilled** `desktopProbe/package.json` — chore: minor version bump
- **Backfilled** `desktopProbe/.eslintrc.json` — feat: reviews implemetation wip
- **Backfilled** `desktopProbe/src/lib/electronMainSdk.tsx` — fix: added get and policies
- **Backfilled** `desktopProbe/src/pages/home.tsx` — fix: undelete review popup
- **Backfilled** `desktopProbe/src/components/navbar.tsx` — fix: duplicated icon import
- **Backfilled** `desktopProbe/src/pages/home.tsx` — fix: hide review cta
- **Backfilled** `desktopProbe/src/index.ts` — fix: add safe storage detection
- **Backfilled** `desktopProbe/images/trayIcon.png` — feat: add tray icon for linux

## 2024-03-13
- **Backfilled** `desktopProbe/forge.config.ts` — chore: add executable name to packager config
- **Backfilled** `desktopProbe/forge.config.ts` — fix: deb maker
- **Backfilled** `desktopProbe/forge.config.ts` — fix: accidental commit
- **Backfilled** `desktopProbe/src/server/autoUpdater.ts` — feat: support for manual update install on linux
- **Backfilled** `desktopProbe/src/server/autoUpdater.ts` — feat: manually check for updates on linux
- **Backfilled** `desktopProbe/src/server/autoUpdater.ts` — fix: linux autoupdate notification message
- **Backfilled** `desktopProbe/src/server/autoUpdater.ts` — fix: linux auto updater logging
- **Backfilled** `desktopProbe/src/server/autoUpdater.ts` — fix: do not block app start when checking for updates
- **Backfilled** `desktopProbe/src/server/autoUpdater.ts` — fix: only set actions on darwin
- **Backfilled** `desktopProbe/src/server/autoUpdater.ts` — fix: update notification title
- **Backfilled** `desktopProbe/src/server/autoUpdater.ts` — fix: final touches for linux updater
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: glassdoor parser

## 2024-03-14
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: improve detections of job list parser outages
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — feat: check for no results screen
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: no results detection for indeed
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: no results handling for remoteio
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: duplicate conflict and dice parser
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — feat: html dump for failed parses
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: glassdoor empty results page

## 2024-03-16
- **Backfilled** `desktopProbe/.eslintrc.json` — feat: job labels

## 2024-03-17
- **Backfilled** `blog/app/sitemap.ts` — fix(blog): sitemap generation
- **Backfilled** `desktopProbe/src/components/jobSummary.tsx` — fix: layout changes
- **Backfilled** `supabase/seed.sql` — chore: make labels column required with default empty array
- **Backfilled** `desktopProbe/src/components/jobSummary.tsx` — feat: add view job btn
- **Backfilled** `desktopProbe/src/lib/electronMainSdk.tsx` — fix: apply btn removes item from list and selects next item
- **Backfilled** `desktopProbe/src/components/jobDetails.tsx` — fix: get job by id was returning an array
- **Backfilled** `desktopProbe/src/server/htmlDownloader.ts` — fix: html downloader pool and use 5 instances
- **Backfilled** `desktopProbe/src/server/htmlDownloader.ts` — fix: better handling of html download errors, do not stop other links from scraping
- **Backfilled** `desktopProbe/src/components/createLink.tsx` — fix: do not wait to scan jobs when adding a new link

## 2024-03-18
- **Backfilled** `desktopProbe/package-lock.json` — feat: csv exporter

## 2024-03-19
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — Fix: remove archive button and add label to job
- **Backfilled** `desktopProbe/src/components/jobSummary.tsx` — Fix: ensure label selector wraps to next line on smaller screens for better visibility
- **Backfilled** `desktopProbe/src/components/skeletons/jobsSkeleton.tsx` — Fix: remove archive button from job skeleton and fix width of content for smaller screens
- **Backfilled** `desktopProbe/src/components/jobSummary.tsx` — fix: label selector and update skeleton
- **Backfilled** `desktopProbe/src/lib/labels.ts` — fix: colors for labels and order

## 2024-03-20
- **Backfilled** `desktopProbe/package-lock.json` — feat: tab actions button and menu
- **Backfilled** `desktopProbe/package-lock.json` — feat: tab actions button and menu

## 2024-03-22
- **Backfilled** `desktopProbe/src/server/autoUpdater.ts` — feat(autoUpdater): show alert every time the cron job runs
- **Backfilled** `landingPage/.eslintrc.json` — feat: project boilerplate
- **Backfilled** `blog/data/blog/eliminate-endless-tab-refreshing-when-searching-for-new-jobs.mdx` — fix(blog): add some links and images
- **Backfilled** `blog/package.json` — fix(blog): remove cross-env
- **Backfilled** `landingPage/src/styles/globals.css` — fix: update global styles to match the desktop app
- **Backfilled** `desktopProbe/package-lock.json` — feat: bulk archive and delete
- **Backfilled** `desktopProbe/src/components/jobSummary.tsx` — feat: delete job button
- **Backfilled** `desktopProbe/src/components/CsvExporter.tsx` — fix: csv export

## 2024-03-23
- **Backfilled** `desktopProbe/package-lock.json` — chore: lock
- **Backfilled** `desktopProbe/src/components/reviewSuggestionPopup.tsx` — fix: link for windows users, small fixes

## 2024-03-26
- **Backfilled** `supabase/seed.sql` — fix: merge conflicts
- **Backfilled** `landingPage/package-lock.json` — feat: add first sections of landing page
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — fix: label width
- **Backfilled** `desktopProbe/src/components/jobSummary.tsx` — fix: buttons
- **Backfilled** `desktopProbe/src/components/jobSummary.tsx` — fix: button background
- **Backfilled** `desktopProbe/src/pages/home.tsx` — fix: bulk actions background
- **Backfilled** `desktopProbe/src/components/skeletons/jobsSkeleton.tsx` — fix: update skeletons
- **Backfilled** `desktopProbe/src/app.tsx` — feat: add update review and some layout changes
- **Backfilled** `desktopProbe/src/pages/feedback.tsx` — fix: windows store deeplink
- **Backfilled** `desktopProbe/src/pages/feedback.tsx` — fix: win store condition
- **Backfilled** `desktopProbe/package.json` — chore: minor version bump
- **Backfilled** `desktopProbe/package-lock.json` — feat: persist window size between restarts
- **Backfilled** `desktopProbe/package-lock.json` — chore: npm audit fix
- **Backfilled** `desktopProbe/src/pages/feedback.tsx` — fix: feedback ui
- **Backfilled** `desktopProbe/src/server/supabaseApi.ts` — fix: optional description
- **Backfilled** `desktopProbe/packagers/appx/AppXManifest.xml` — chore: bump appx version

## 2024-03-27
- **Backfilled** `landingPage/.eslintrc.json` — feat: project boilerplate
- **Backfilled** `landingPage/src/styles/globals.css` — fix: update global styles to match the desktop app
- **Backfilled** `landingPage/package-lock.json` — feat: add first sections of landing page

## 2024-03-28
- **Backfilled** `landingPage/public/assets/job-labels.png` — fix(landingPage): header content

## 2024-03-29
- **Backfilled** `supabase/functions/scan-job-description/index.ts` — fix: jd parse errors when body doesn't change
- **Backfilled** `desktopProbe/src/server/jobScanner.ts` — fix: reference link/job ids in error logs

## 2024-03-30
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix(parser): handle no results list for indeed individual company page
- **Backfilled** `landingPage/package-lock.json` — feat: responsive navbar
- **Backfilled** `desktopProbe/src/index.ts` — fix: scale down to 2 web scraper windows
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: ts error
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — fix: archive and delete buttons in jobs list
- **Backfilled** `desktopProbe/package-lock.json` — feat: enable auto-update notifications on win32
- **Backfilled** `desktopProbe/src/components/deleteJobDialog.tsx` — feat: delete jobs dialog in list with option to ignore warning
- **Backfilled** `desktopProbe/package.json` — chore: patch version
- **Backfilled** `landingPage/src/components/navbar.tsx` — feat: download app page
- **Backfilled** `landingPage/src/pages/download.tsx` — fix: logo for linux
- **Backfilled** `landingPage/src/pages/privacy-policy.tsx` — feat: privacy policy and terms of service pages
- **Backfilled** `landingPage/src/components/footer.tsx` — feat: footer

## 2024-03-31
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: indeed parser for company page listing
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — fix(indeed): company name and external url for individual company listings

## 2024-04-02
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: flexjobs parser
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: indeed parser for individual company

## 2024-04-04
- **Backfilled** `blog/data/blog/why-cant-you-land-a-tech-job-myth-vs-reality.mdx` — feat(blog): article about job search muths
- **Backfilled** `blog/data/blog/why-cant-you-land-a-tech-job-myth-vs-reality.mdx` — fix(blog): add share image for latest article
- **Backfilled** `blog/data/blog/why-cant-you-land-a-tech-job-myth-vs-reality.mdx` — fix(blog): image path

## 2024-04-07
- **Backfilled** `landingPage/package-lock.json` — feat: finalize all sections

## 2024-04-08
- **Backfilled** `blog/app/tag-data.json` — feat(blog): add article about linkedin boolean searches
- **Backfilled** `blog/data/blog/how-to-use-linkedin-boolean-searches.mdx` — fix(blog): add image to linkedin boolean search article
- **Backfilled** `desktopProbe/src/pages/home.tsx` — fix: open external url on apply
- **Backfilled** `desktopProbe/src/server/htmlDownloader.ts` — fix: retry html parsing while keeping the browser window open
- **Backfilled** `desktopProbe/package-lock.json` — chore: patch version

## 2024-04-10
- **Backfilled** `landingPage/public/robots.txt` — feat: robots.txt page
- **Backfilled** `landingPage/package-lock.json` — feat(landingPage): add ga4 tracking
- **Backfilled** `landingPage/src/components/themeProvider.tsx` — fix(landingPage): dark mode
- **Backfilled** `landingPage/src/components/faqs.tsx` — feat: add more FAQs
- **Backfilled** `landingPage/public/assets/benefits-dark.png` — fix: new screenshots and wording adjusting
- **Backfilled** `landingPage/public/sitemap.xml` — feat: static sitemap.xml page
- **Backfilled** `landingPage/public/favicons/android-chrome-192x192.png` — feat: favicons
- **Backfilled** `landingPage/public/favicon.ico` — fix: remove unused stuff
- **Backfilled** `landingPage/src/components/bottomCta.tsx` — feat: bottom cta and pricing tab glitch fix
- **Backfilled** `landingPage/public/preview-image.jpeg` — feat: SEO tags and preview share image
- **Backfilled** `landingPage/src/components/bottomCta.tsx` — fix: small things
- **Backfilled** `landingPage/src/components/feedbackSection.tsx` — fix: feedback text on mobile
- **Backfilled** `landingPage/src/components/advancedMatchingSection.tsx` — fix: text size for big devices
- **Backfilled** `landingPage/src/components/pricingSection.tsx` — fix: letter spacing for small text
- **Backfilled** `landingPage/src/components/bottomCta.tsx` — fix: remove useless padding on mobile
- **Backfilled** `landingPage/src/components/pricingSection.tsx` — feat: add free of charge for now disclaimer to pricing section
- **Backfilled** `landingPage/.eslintrc.json` — fix: head meta tags + nextjs prob build
- **Backfilled** `landingPage/src/components/productSection.tsx` — fix: build
- **Backfilled** `landingPage/next.config.mjs` — fix: configure static export
- **Backfilled** `landingPage/next.config.mjs` — fix: disable image optimization
- **Backfilled** `landingPage/next.config.mjs` — fix: switch back to normal build
- **Backfilled** `landingPage/src/components/productSection.tsx` — feat: youtube video
- **Backfilled** `landingPage/src/components/faqs.tsx` — fix: email button
- **Backfilled** `landingPage/src/pages/download.tsx` — fix: missing linux download button

## 2024-04-13
- **Backfilled** `blog/app/tag-data.json` — fix(landingPage): google analytics conversion tracking
- **Backfilled** `desktopProbe/package-lock.json` — feat: up and down keyboard  navigation between jobs
- **Backfilled** `desktopProbe/src/pages/home.tsx` — fix: remove ring from tab triggers and content
- **Backfilled** `desktopProbe/src/pages/home.tsx` — feat: left and right keys for navigating between tabs
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — feat: keys for archive and delete
- **Backfilled** `desktopProbe/src/index.css` — fix: bring back the jobs list scrollbar
- **Backfilled** `desktopProbe/src/pages/home.tsx` — fix: scroll to the top of jd when selected job changes
- **Backfilled** `desktopProbe/src/app.tsx` — feat: subscription end page
- **Backfilled** `desktopProbe/src/components/skeletons/SettingsSkeleton.tsx` — feat: subscription management in settings
- **Backfilled** `landingPage/src/components/navbar.tsx` — fix(landing-page): navbar icon on mobile
- **Backfilled** `README.md` — feat: subscriptions backend and lock screen in the app
- **Backfilled** `desktopProbe/src/pages/settings.tsx` — feat: subscription management in settings page
- **Backfilled** `desktopProbe/src/hooks/session.tsx` — feat: block home screen if subscription is expired

## 2024-04-19
- **Backfilled** `desktopProbe/package-lock.json` — feat: notes without files
- **Backfilled** `desktopProbe/src/components/jobNotes.tsx` — fix: remove files ui for now
- **Backfilled** `desktopProbe/src/server/stripeConfig.ts` — feat(payments): stripe webhook edge function
- **Backfilled** `supabase/seed.sql` — feat: add missing db get user by email function
- **Backfilled** `supabase/seed.sql` — fix: seed.sql
- **Backfilled** `landingPage/package-lock.json` — feat: changelog with example content
- **Backfilled** `desktopProbe/src/components/jobNotes.tsx` — fix(notes): ux fixes
- **Backfilled** `desktopProbe/src/components/jobNotes.tsx` — fix(notes): focus on new note
- **Backfilled** `desktopProbe/src/components/jobNotes.tsx` — fix(notes): update note with space for hint
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — fix: hotkey for delete to open delete modal
- **Backfilled** `desktopProbe/src/pages/help.tsx` — feat: add some more FAQs
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — fix: scroll to item when navigating using kb
- **Backfilled** `desktopProbe/src/pages/help.tsx` — feat: add FAQ about kb navigation
- **Backfilled** `desktopProbe/package.json` — chore: minor version bump
- **Backfilled** `landingPage/src/pages/download.tsx` — feat(landingPage): update download links

## 2024-05-09
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: builtin parser

## 2024-05-17
- **Backfilled** `landingPage/src/pages/_app.tsx` — feat(landingPage): enable google tag manager
- **Backfilled** `landingPage/src/pages/download.tsx` — feat(landingPage): add gtm events for file downloads

## 2024-05-24
- **Backfilled** `blog/app/tag-data.json` — feat(blog): new article about job search hacks
- **Backfilled** `blog/data/blog/recently-laid-off-job-search-tips.mdx` — fix(blog): less clickbait

## 2024-05-29
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: indeed parser

## 2024-06-15
- **Backfilled** `desktopProbe/.prettierrc` — feat: add filters page
- **Backfilled** `desktopProbe/src/components/authGuard.tsx` — chore(desktopProbe): prettier format
- **Backfilled** `package-lock.json` — feat: advanced matching backend implementation
- **Backfilled** `desktopProbe/src/lib/electronMainSdk.tsx` — feat: wip filters page with load/save advanced matching config
- **Backfilled** `supabase/seed.sql` — fix: sql typos
- **Backfilled** `desktopProbe/src/hooks/session.tsx` — fix: session loading
- **Backfilled** `desktopProbe/src/hooks/session.tsx` — fix: session handling
- **Backfilled** `desktopProbe/src/pages/filters.tsx` — feat: filters ui

## 2024-06-16
- **Backfilled** `desktopProbe/src/lib/electronMainSdk.tsx` — fix: filtered tab handling
- **Backfilled** `supabase/functions/_shared/advancedMatching.ts` — fix: advanced matching using gpt4o
- **Backfilled** `supabase/seed.sql` — fix: profiles
- **Backfilled** `desktopProbe/src/components/pricingOptions.tsx` — fix: subscription page
- **Backfilled** `desktopProbe/src/components/pricingOptions.tsx` — feat: add subscription dialog to filters page
- **Backfilled** `desktopProbe/src/pages/filters.tsx` — fix: bump ai input limit to 300
- **Backfilled** `landingPage/src/components/pricingSection.tsx` — fix(landing page): update pricing for pro
- **Backfilled** `landingPage/public/assets/advanced-matching-dark.png` — feat(landing page): advanced matching ready
- **Backfilled** `desktopProbe/package-lock.json` — chore: bump version to 1.5

## 2024-06-17
- **Backfilled** `landingPage/src/pages/download.tsx` — fix: update download links
- **Backfilled** `supabase/seed.sql` — fix: add fk to user id for advanced matching table

## 2024-06-18
- **Backfilled** `desktopProbe/packagers/appx/AppXManifest.xml` — fix: try adding custom protocol in appx manifest

## 2024-06-19
- **Backfilled** `desktopProbe/src/components/skeletons/filtersSkeleton.tsx` — fix: add filters skeleton
- **Backfilled** `desktopProbe/src/pages/home.tsx` — fix: tab name for excluded jobs by filters
- **Backfilled** `desktopProbe/forge.config.ts` — fix: deep link for linux
- **Backfilled** `desktopProbe/package-lock.json` — chore: patch version

## 2024-06-20
- **Backfilled** `landingPage/src/pages/download.tsx` — fix: update download links

## 2024-06-27
- **Backfilled** `blog/app/tag-data.json` — feat(blog): new article about web scraping
- **Backfilled** `supabase/functions/_shared/advancedMatching.ts` — feat: use cheaper llm api after a certain threshold

## 2024-06-28
- **Backfilled** `landingPage/src/pages/_app.tsx` — fix(landingPage): consolidate events in gtm

## 2024-07-15
- **Backfilled** `landingPage/src/pages/download.tsx` — fix(landingPage): mention no credit card in download page
- **Backfilled** `supabase/functions/_shared/advancedMatching.ts` — feat(backend): switch to azure open ai service

## 2024-07-16
- **Backfilled** `landingPage/src/components/navbar.tsx` — fix(landingPage): navbar mobile dialog

## 2024-07-24
- **Backfilled** `desktopProbe/src/components/linksList.tsx` — fix: add scan debug window
- **Backfilled** `desktopProbe/package-lock.json` — chore: patch version
- **Backfilled** `desktopProbe/src/components/linksList.tsx` — fix: open debug window for every link external open

## 2024-07-27
- **Backfilled** `supabase/functions/_shared/advancedMatching.ts` — fix: skip openai api call if there is no configured used prompt
- **Backfilled** `landingPage/src/pages/download.tsx` — fix(landingPage): update app version in downloads page
- **Backfilled** `supabase/functions/_shared/subscription.ts` — fix: do not process links for users with expired subscriptions

## 2024-08-30
- **Backfilled** `supabase/functions/scan-job-description/index.ts` — fix(supabase): improve logging for JD parser

## 2024-09-04
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — fix: builtin description parser
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: remotive url parser

## 2024-09-05
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — feat: improve ux on job list cards
- **Backfilled** `supabase/functions/_shared/advancedMatching.ts` — fix: include job location in open AI prompt
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: small improvements to job list parser
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: indeed job location parsing
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — feat: add detected time on job cards
- **Backfilled** `desktopProbe/packagers/appx/AppXManifest.xml` — chore: minor version bump
- **Backfilled** `desktopProbe/package.json` — chore: bump version in  desktop probe
- **Backfilled** `landingPage/src/pages/download.tsx` — fix: download links

## 2024-09-08
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: flexjobs parser
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — fix: add linkedin parser for logged in mode
- **Backfilled** `supabase/functions/scan-job-description/index.ts` — fix: jd loading for flexjobs
- **Backfilled** `supabase/functions/scan-job-description/index.ts` — fix: html dump job description contents when failing to parse then
- **Backfilled** `supabase/functions/_shared/advancedMatching.ts` — fix: add the job tags to open AI prompt in order to exclude easy apply jobs
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: only error logs parser failures when the last retry has been reached
- **Backfilled** `supabase/functions/scan-job-description/index.ts` — fix: return info if the jd parsing failed for the client to retry

## 2024-09-10
- **Backfilled** `landingPage/src/pages/api/app-deep-link.ts` — feat(landingPage): add api route to redirect to app deep link
- **Backfilled** `README.md` — feat: send alert emails to users when links fail to scrape too many times
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — feat: send edge function logs to mezmo
- **Backfilled** `supabase/functions/_shared/types.ts` — feat: add reference to parent link_id to jobs
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — fix: description parser for flexjobs

## 2024-09-13
- **Backfilled** `supabase/functions/handle-stripe-webhook/index.ts` — fix: stripe webhook handler use lowercase emails

## 2024-09-14
- **Backfilled** `desktopProbe/src/hooks/settings.tsx` — feat: add post scan hook to send out email notifications
- **Backfilled** `desktopProbe/src/server/jobScanner.ts` — fix: add small random delay between web scrapes to add some relief to rate limits
- **Backfilled** `desktopProbe/src/components/linksList.tsx` — feat: add error state for job search items
- **Backfilled** `desktopProbe/package-lock.json` — chore: minor version bump
- **Backfilled** `landingPage/src/pages/download.tsx` — fix: download page app versions
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — fix: best jobs JD parsing
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: add no results detection to naukri
- **Backfilled** `supabase/functions/scan-job-description/index.ts` — fix: logging improvements to edge functions

## 2024-09-16
- **Backfilled** `desktopProbe/src/server/jobScanner.ts` — fix: cron job would not be started at boot time
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: avoid error logs from links that are in warning state (already sent email to users)
- **Backfilled** `desktopProbe/package-lock.json` — chore: patch fix
- **Backfilled** `desktopProbe/src/pages/subscription.tsx` — fix: add pricing table to churn customers view
- **Backfilled** `landingPage/src/pages/download.tsx` — fix: bump versions in download page

## 2024-09-19
- **Backfilled** `desktopProbe/src/components/skeletons/jobsSkeleton.tsx` — fix: update job list cards skeleton
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — fix: job list card archive button hover on light mode
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — fix: comments in jobs list
- **Backfilled** `desktopProbe/src/components/jobDetails.tsx` — feat: show image when job description failed to fetch
- **Backfilled** `desktopProbe/src/components/jobSummary.tsx` — fix: add tooltips to icon buttons

## 2024-09-21
- **Backfilled** `landingPage/src/components/faqs.tsx` — fix: use contact email address
- **Backfilled** `landingPage/src/pages/changelog.tsx` — fix: add key props in changelog file
- **Backfilled** `landingPage/src/pages/changelog.tsx` — fix: add missing key prop
- **Backfilled** `landingPage/src/components/navbar.tsx` — fix: add content to changelog page and add it to navbar
- **Backfilled** `landingPage/src/pages/changelog.tsx` — fix(landingPage): add missing key prop

## 2024-09-24
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — fix(backend): linkedin jd parser

## 2024-09-27
- **Backfilled** `blog/data/blog/navigating-tech-job-market-downturn.mdx` — feat(blog): new article about navigating the tech job market downturn

## 2024-10-01
- **Backfilled** `desktopProbe/src/pages/filters.tsx` — fix: handle many blacklisted companies

## 2024-10-03
- **Backfilled** `desktopProbe/src/pages/filters.tsx` — fix: remove quotes from blacklist company input

## 2024-10-04
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — fix: linkedin jd parsed when logged in
- **Backfilled** `supabase/functions/_shared/advancedMatching.ts` — fix: improve logging for edge functions

## 2024-10-07
- **Backfilled** `.gitignore` — feat: invoice downloader project

## 2024-10-08
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — feat: add zip reccruiter parser support
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — feat: add usa jobs parser support
- **Backfilled** `assets/sitesIcons/ziprecruiter.png` — chore: add ziprecruiter icon
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix(usajobs): company name parsing

## 2024-10-09
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — feat: add talent parser support

## 2024-10-10
- **Backfilled** `assets/sitesIcons/usajobs.png` — chore: add icon for usa jobs
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — feat: new job card
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — fix: selected job radius
- **Backfilled** `desktopProbe/src/components/skeletons/jobsSkeleton.tsx` — feat: update job list skeleton

## 2024-10-11
- **Backfilled** `desktopProbe/src/components/searchBox.tsx` — feat: add search box for jobs list
- **Backfilled** `desktopProbe/src/components/jobsList.tsx` — fix: padding

## 2024-10-14
- **Backfilled** `blog/data/blog/job-search-burnout-tips-motivation.mdx` — feat(blog): new article about tips for job search burnout
- **Backfilled** `desktopProbe/src/components/linksList.tsx` — fix: links list and skeleton spacing and text size

## 2024-10-18
- **Backfilled** `landingPage/src/components/pricingSection.tsx` — feat(landingPage): add checkout links to pricing table
- **Backfilled** `supabase/functions/post-scan-hook/index.ts` — feat(supabase): add request id to edge function loggers
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: job parser

## 2024-10-20
- **Backfilled** `supabase/config.toml` — feat: add edge function for managing users in mailerlite

## 2024-10-22
- **Backfilled** `landingPage/src/components/pricingSection.tsx` — feat: add support for passing query params to stripe checkout links

## 2024-10-29
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — fix(backend): zip recruiter parser for .com domain

## 2024-10-30
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — fix: ziprecruiter salary and jd parser

## 2024-11-04
- **Backfilled** `blog/public/static/images/job-search-burnout.jpg` — fix(blog): move pictures in images folder
- **Backfilled** `blog/data/blog/resume-format-guide.mdx` — feat(blog): new article about resume formatting
- **Backfilled** `blog/data/blog/best-job-search-sites-2024.mdx` — feat(blog): new article about top job sites in 2024

## 2024-11-05
- **Backfilled** `blog/data/blog/best-job-search-sites-2024.mdx` — fix(blog): remove unwanted text from blogs
- **Backfilled** `blog/data/blog/best-job-search-sites-2024.mdx` — fix(blog): remove unwanted text from blog part 2
- **Backfilled** `blog/data/blog/resume-vs-portfolio-tech-jobs.mdf` — feat(blog): new article about resumes vs portfolios
- **Backfilled** `blog/data/blog/resume-vs-portfolio-tech-jobs.mdx` — fix(blog): file type typo
- **Backfilled** `blog/data/blog/online-interview-tips.mdx` — feat(blog): new article about online interview tips

## 2024-11-10
- **Backfilled** `.vscode/launch.json` — feat(invoiceDownloader): working mvp
- **Backfilled** `invoiceDownloader/src/main.ts` — fix(invoiceDownloader): ts build
- **Backfilled** `invoiceDownloader/src/keez/invoiceManagement.ts` — fix(invoiceDownloader): small fixes
- **Backfilled** `invoiceDownloader/src/functional.ts` — feat(invoiceDownloader): support for creating reverse charge invoices
- **Backfilled** `invoiceDownloader/package-lock.json` — feat(invoiceDownloader): add support for real exchange rate

## 2024-11-11
- **Backfilled** `blog/data/blog/best-job-search-sites-2024.mdx` — fix(blog): content syntax
- **Backfilled** `blog/data/blog/top-10-tech-skills-2024.mdx` — feat(blog): new article about in demand tech skills

## 2024-11-12
- **Backfilled** `blog/data/blog/tech-skills-to-pile-on.mdx` — feat(blog): new article about texh skills that you could pile on
- **Backfilled** `blog/data/blog/make-your-resume-stand-out.mdx` — feat(blog): new article about making your resume stand out

## 2024-11-13
- **Backfilled** `invoiceDownloader/src/keez/invoiceManagement.ts` — fix(invoiceDownloader): keez item type

## 2024-11-15
- **Backfilled** `invoiceDownloader/src/env.ts` — fix(invoiceDownloader): final version with dual item support
- **Backfilled** `supabase/functions/scan-job-description/index.ts` — fix: avoid parsing a jd twice

## 2024-11-17
- **Backfilled** `desktopProbe/package-lock.json` — feat: search and filter jobs (#39)
- **Backfilled** `.gitignore` — chore: gitignore test html file
- **Backfilled** `desktopProbe/package-lock.json` — chore: minor version bump
- **Backfilled** `README.md` — docs: add cmd for x64 macos build

## 2024-11-18
- **Backfilled** `landingPage/src/pages/changelog.tsx` — feat(landingPage): add changelog for latest release
- **Backfilled** `landingPage/src/components/footer.tsx` — fix(landingPage): svg attribute names to react-compatible syntax
- **Backfilled** `supabase/functions/handle-stripe-webhook/index.ts` — fix(supabase): use mezmo logger in stripe webhooks
- **Backfilled** `landingPage/public/assets/benefits-dark.png` — feat(landingPage): update screenshots to new ui
- **Backfilled** `landingPage/src/components/faqs.tsx` — fix(landingPage): faqs missing separator
- **Backfilled** `landingPage/src/components/pricingSection.tsx` — fix(landingPage): pricing plan select button position
- **Backfilled** `landingPage/src/components/explainerSection.tsx` — fix(landingPage): spacing
- **Backfilled** `blog/data/blog/get-the-most-out-of-email.mdx` — feat(blog): new article about getting the most out of your email
- **Backfilled** `blog/data/blog/what-motivates-you-interview-question.mdx` — feat(blog): new article about answering the what motivates you interview question
- **Backfilled** `blog/data/blog/to-follow-up-or-not.mdx` — feat(blog): new article about follow-up emailing after interviews
- **Backfilled** `supabase/functions/handle-stripe-webhook/index.ts` — fix(supabase): better error message for not user found by stripe email
- **Backfilled** `landingPage/src/components/benefitsSection.tsx` — fix(landingPage): reorganize components
- **Backfilled** `ci.txt` — chore: trigger ci

## 2024-11-22
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — fix(remotive): try to parse indeed JD

## 2024-11-24
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix(supabase): li parser when logged in
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix(glassdoor): company name parsing broken

## 2024-11-26
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: linkedin loggedin parser

## 2024-12-01
- **Backfilled** `supabase/deno.json` — feat: add support for marking sites as deprecated
- **Backfilled** `landingPage/public/assets/benefits-dark.png` — fix: update landing page to remove ziprecruiter

## 2024-12-02
- **Backfilled** `landingPage/src/pages/terms-of-service.tsx` — chore: update tos

## 2024-12-03
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — fix(backend): remotive parser

## 2024-12-04
- **Backfilled** `supabase/deno.lock` — chore: update deno lock
- **Backfilled** `supabase/functions/scan-job-description/index.ts` — fix: log job id when starting processing job descriptions
- **Backfilled** `supabase/functions/create-link/index.ts` — fix: add more logger meta to create link function

## 2024-12-06
- **Backfilled** `landingPage/src/components/feedbackSection.tsx` — feat(landingPage): add new review

## 2024-12-07
- **Backfilled** `desktopProbe/src/server/supabaseApi.ts` — fix: remove accidental line
- **Backfilled** `webapp/.eslintrc.json` — feat(webapp): project scaffolding
- **Backfilled** `invoiceDownloader/.gitignore` — feat(invoiceDownloader): download pdf invoices to folder for cold storage

## 2024-12-17
- **Backfilled** `supabase/sites_rows.csv` — chore: add sites config file
- **Backfilled** `README.md` — docs: update readme

## 2025-01-07
- **Backfilled** `landingPage/src/components/faqs.tsx` — fix: faqs

## 2025-01-19
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: linkedin parser
- **Backfilled** `desktopProbe/src/server/htmlDownloader.ts` — fix(desktopProbe): scroll every scrollable element when fetching the jobs list
- **Backfilled** `desktopProbe/package-lock.json` — fix(desktopProbe): prefill user email when purchasing a subscription
- **Backfilled** `desktopProbe/src/components/createLink.tsx` — fix(desktopProbe): don't show deprecated sites
- **Backfilled** `desktopProbe/src/pages/help.tsx` — fix(desktopProbe): faq about emails feature
- **Backfilled** `desktopProbe/package-lock.json` — chore: patch version
- **Backfilled** `landingPage/src/pages/download.tsx` — fix: download links

## 2025-01-26
- **Backfilled** `supabase/seed.sql` — Add support for deprecated column in the sql script (#42)
- **Backfilled** `supabase/seed.sql` — Fix sql script syntax error (#41)
- **Backfilled** `README.md` — docs: update README.md (#40)
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix(supabase): glassdoor parser
- **Backfilled** `supabase/functions/_shared/advancedMatching.ts` — fix(supabase): upgrade supabase lib to latest version
- **Backfilled** `supabase/deno.lock` — chore(supabase): update deno lock
- **Backfilled** `desktopProbe/package-lock.json` — feat: filter by label (#44)
- **Backfilled** `landingPage/src/pages/download.tsx` — fix(landingPage): download links

## 2025-02-02
- **Backfilled** `desktopProbe/package-lock.json` — chore: upgrade electron version and npm audit fix
- **Backfilled** `package-lock.json` — chore: upgrade supabase cli
- **Backfilled** `desktopProbe/src/server/helpers.ts` — fix: better rate limit handling against cloudflare bot detection
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix(backend): flexjobs parser
- **Backfilled** `desktopProbe/src/server/jobScanner.ts` — fix(desktopProbe): don't start a new scan if one is already in progress
- **Backfilled** `desktopProbe/src/components/home/jobSummary.tsx` — feat(desktopProbe): rework action buttons in job summary
- **Backfilled** `desktopProbe/src/server/jobScanner.ts` — fix(backend): skip cron job scan if another scan is in progress
- **Backfilled** `desktopProbe/package-lock.json` — chore: minor version
- **Backfilled** `desktopProbe/packagers/appx/AppXManifest.xml` — chore: minor version in appx manifest

## 2025-02-03
- **Backfilled** `landingPage/src/pages/download.tsx` — fix: download links

## 2025-02-05
- **Backfilled** `landingPage/src/components/footer.tsx` — feat(landingPage): add reddit logo in footer

## 2025-02-06
- **Backfilled** `desktopProbe/src/components/home/jobSummary.tsx` — fix: typo
- **Backfilled** `desktopProbe/src/server/jobScanner.ts` — fix(desktopProbe): better handling of random timeouts between jobs
- **Backfilled** `desktopProbe/src/server/htmlDownloader.ts` — fix(desktopProbe): better rate limit handling and disable linkedin passkey request
- **Backfilled** `desktopProbe/package-lock.json` — chore: patch version
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — fix(supabase): weworkremotely parser
- **Backfilled** `desktopProbe/packagers/appx/AppXManifest.xml` — chore: fix appx version

## 2025-02-08
- **Backfilled** `landingPage/src/pages/download.tsx` — fix(landingPage): download links
- **Backfilled** `desktopProbe/package-lock.json` — chore: update forge cli tools

## 2025-02-15
- **Backfilled** `desktopProbe/src/server/htmlDownloader.ts` — fix(desktopProbe): enable web security in electron scraper windows This apparently fixed the Cloudflare turnstile widget rendering
- **Backfilled** `desktopProbe/package-lock.json` — chore: patch version

## 2025-02-17
- **Backfilled** `landingPage/src/pages/download.tsx` — fix(landingPage): download links
- **Backfilled** `webapp/src/app/globals.css` — fix(webapp): colors and screen sizes
- **Backfilled** `landingPage/src/components/benefitsSection.tsx` — fix(landingPage): supported job sites

## 2025-02-21
- **Backfilled** `webapp/.eslintrc.json` — chore(webapp): add prettier and tailwind class sorting
- **Backfilled** `webapp/src/app/globals.css` — refactor(webapp): add mobile navbar, update desktop navbar, and improve layout structure
- **Backfilled** `webapp/src/components/navbar.tsx` — refactor(webapp): merge desktop and mobile navbar into a single component
- **Backfilled** `webapp/src/app/login/page.tsx` — refactor(webapp): merge login page and login card into a single component
- **Backfilled** `webapp/src/app/signup/page.tsx` — refactor(webapp): merge signup page and signup card into a single component

## 2025-02-28
- **Backfilled** `.gitignore` — fix(backend): linkedin parser

## 2025-03-01
- **Backfilled** `desktopProbe/src/index.ts` — feat: scan linkedin job descriptions in incognito mode
- **Backfilled** `desktopProbe/package-lock.json` — chore: patch version
- **Backfilled** `supabase/seed.sql` — chore: update sites csv
- **Backfilled** `LICENSE.txt` — chore: add license file

## 2025-03-03
- **Backfilled** `desktopProbe/src/components/ui/dropdown-menu.tsx` — fix(desktopProbe): make dropdown menu scrollable
- **Backfilled** `landingPage/.prettierrc` — feat(landingPage): rework order of benefits section (#49)
- **Backfilled** `landingPage/src/pages/download.tsx` — fix: download links
- **Backfilled** `landingPage/src/components/advancedMatchingSection.tsx` — fix(landingPage): escape quotes

## 2025-03-06
- **Backfilled** `desktopProbe/src/components/home/jobSummary.tsx` — feat(desktopProbe): add explainer section for filtered out jobs
- **Backfilled** `desktopProbe/src/components/linksList.tsx` — feat(desktopProbe): add copy to clipboard button for search url

## 2025-03-07
- **Backfilled** `supabase/functions/_shared/mailerLiteApi.ts` — feat(supabase): add users to mailerlite paying customers group
- **Backfilled** `desktopProbe/src/components/home/jobSummary.tsx` — feat(supabase): save LLM exclusion reason for jobs
- **Backfilled** `desktopProbe/src/server/jobScanner.ts` — fix(desktopProbe): bump scrape failure count for links when dealing with rate limits
- **Backfilled** `desktopProbe/package-lock.json` — chore: minor version
- **Backfilled** `landingPage/src/pages/download.tsx` — fix(landingPage): download links
- **Backfilled** `supabase/functions/_shared/advancedMatching.ts` — fix(supabase): pin azure version to GA

## 2025-03-10
- **Backfilled** `webapp/src/components/navbar.tsx` — fix(webapp): ensure navbar does not appear on login/signup pages
- **Backfilled** `webapp/src/app/layout.tsx` — feat(webapp): prevent zooming and scaling with viewport meta tag
- **Backfilled** `webapp/src/app/login/layout.tsx` — refactor(webapp): remove login/signup layouts and update styling
- **Backfilled** `webapp/src/app/forgot-password/layout.tsx` — refactor(webapp): merge forgot password page and card, remove layout and update styling

## 2025-03-21
- **Backfilled** `webapp/src/components/home/jobFilters.tsx` — refactor(webapp): improve job filters and tabs styling, extract tab actions and enhance ui

## 2025-03-24
- **Backfilled** `invoiceDownloader/src/keez/invoiceManagement.ts` — fix(invoiceDownloader): adjust to latest keez api version
- **Backfilled** `supabase/functions/post-scan-hook/index.ts` — fix(supabase): no new jobs check in post scan hook

## 2025-04-08
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — feat: automatically sort by recent for linkedin

## 2025-04-16
- **Backfilled** `desktopProbe/src/components/linksList.tsx` — feat: hide url from search cards

## 2025-04-17
- **Backfilled** `landingPage/src/components/head.tsx` — fix(landingPage): meta tags in headers
- **Backfilled** `blog/app/Main.tsx` — fix(blog): sitemap and broken link
- **Backfilled** `blog/data/authors/default.mdx` — fix(blog): author avatar image
- **Backfilled** `landingPage/src/pages/download.tsx` — fix(langingPage): remove unused imports
- **Backfilled** `blog/app/sitemap.ts` — fix(blog): sitemap
- **Backfilled** `blog/data/blog/get-the-most-out-of-email.mdx` — fix(blog): add middleware for google noindex on vercel domain
- **Backfilled** `blog/middleware.ts` — fix(blog): robots noindex based on custom cf header

## 2025-05-03
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix(supabase): dice parser
- **Backfilled** `desktopProbe/src/components/editLink.tsx` — feat(desktopProbe): rename link title modal
- **Backfilled** `desktopProbe/src/server/supabaseApi.ts` — fix(desktopProbe): add updateLink supabase api method
- **Backfilled** `desktopProbe/src/components/createLink.tsx` — feat(desktopProbe): new wizard for adding job searches
- **Backfilled** `supabase/functions/create-link/index.ts` — feat(backend): parse and save jobs from html received on create-link functions
- **Backfilled** `desktopProbe/src/components/createLink.tsx` — fix(desktopProbe): change job board modal overlay border color
- **Backfilled** `desktopProbe/package-lock.json` — chore: minor version bump
- **Backfilled** `desktopProbe/src/server/jobBoardModal.ts` — fix(desktopProbe): free resources from closed webcontentsview

## 2025-05-04
- **Backfilled** `landingPage/src/pages/download.tsx` — fix: download links
- **Backfilled** `landingPage/src/components/productSection.tsx` — fix: update video on landing page

## 2025-05-05
- **Backfilled** `blog/data/blog/2025-04-01-how-to-write-a-resume-for-career-change.mdx` — feat(blog): add new article

## 2025-05-06
- **Backfilled** `supabase/functions/create-link/index.ts` — fix: log html of failed links for debugging
- **Backfilled** `blog/ideas.txt` — chore(blog): save some article ideas

## 2025-05-10
- **Backfilled** `invoiceDownloader/src/keez/invoiceManagement.ts` — fix(invoiceGenerator): reverse invoices

## 2025-05-12
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix(supabase): linkedin new version
- **Backfilled** `desktopProbe/src/server/supabaseApi.ts` — feat: add simple debug html

## 2025-05-13
- **Backfilled** `supabase/functions/create-link/index.ts` — fix(backend): better error message

## 2025-05-25
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix(backend): couple of parsers

## 2025-06-12
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix(supabase): jobs list parser

## 2025-07-13
- **Backfilled** `invoiceDownloader/src/keez/invoiceManagement.ts` — fix(invoiceDownloader): date format for storno invoices

## 2025-07-14
- **Backfilled** `invoiceDownloader/package-lock.json` — feat(invoiceDownloader): add support for variable tax rates as per OSS

## 2025-07-26
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix: linkedin parser
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix(linkedin): remove salary from tags

## 2025-08-06
- **Backfilled** `invoiceDownloader/src/keez/invoiceManagement.ts` — fix(invoiceDownloader): reverse invoices generation

## 2025-09-11
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix(supabase): linkedin parser for the new UI layout
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix(supabase): linkedin parser

## 2025-09-12
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix(supabase): robertHalf no jobs handling

## 2025-10-08
- **Backfilled** `supabase/functions/_shared/jobListParser.ts` — fix(supabase): robert half parser

## 2025-10-12
- **Backfilled** `invoiceDownloader/src/keez/invoiceManagement.ts` — fix(invoiceDownloader): handle upgrades
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — fix(supabase): usa jobs parser

## 2025-10-25
- **Backfilled** `assets/sitesIcons/custom.png` — feat: custom job board parser using OpenAi LLM (#56)
- **Backfilled** `supabase/functions/create-link/index.ts` — fix(supabase): create link max allowed checks
- **Backfilled** `supabase/functions/_shared/advancedMatching.ts` — fix(supabase): increase advanced matching token usage
- **Backfilled** `supabase/functions/_shared/advancedMatching.ts` — fix(supabase): shorther exclustion reason
- **Backfilled** `blog/next-env.d.ts` — fix(blog): try fix build
- **Backfilled** `desktopProbe/package-lock.json` — chore: major version
- **Backfilled** `landingPage/src/pages/changelog.tsx` — docs: add changelog to website
- **Backfilled** `desktopProbe/package-lock.json` — chore: update appx manifest
- **Backfilled** `supabase/functions/_shared/customJobsParser.ts` — fix(supabase): remove error log line
- **Backfilled** `landingPage/src/pages/download.tsx` — fix: update download links
- **Backfilled** `landingPage/src/components/bottomCta.tsx` — fix(landingPage): update number of users
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: add ms store build action
- **Backfilled** `.github/workflows/store-release.yml` — ci: try automate windows build
- **Backfilled** `desktopProbe/package.json` — ci: add build scripts
- **Backfilled** `.github/workflows/store-release.yml` — ci: remove file
- **Backfilled** `.github/workflows/linux-release.yml` — ci: try automate linux release
- **Backfilled** `.github/workflows/linux-release.yml` — ci: specifiy environment
- **Backfilled** `.github/workflows/linux-release.yml` — ci: rename env
- **Backfilled** `.github/workflows/linux-release.yml` — ci: fix symlinks
- **Backfilled** `.github/workflows/linux-release.yml` — ci: fix env check
- **Backfilled** `.github/workflows/linux-release.yml` — ci: pull env from github secrets
- **Backfilled** `.github/workflows/linux-release.yml` — ci: pin env name to prod
- **Backfilled** `.github/workflows/linux-release.yml` — ci: use env vars
- **Backfilled** `.github/workflows/linux-release.yml` — ci: fix env usage
- **Backfilled** `.github/workflows/linux-release.yml` — ci: fix env usage
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: ms build upload to s3
- **Backfilled** `.github/workflows/linux-release.yml` — ci: fix env usage
- **Backfilled** `.github/workflows/linux-release.yml` — fix: image copy paths
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: dispatch

## 2025-10-26
- **Backfilled** `desktopProbe/package.json` — ci: add build mac script

## 2025-10-25
- **Backfilled** `.github/workflows/macos-release.yml` — ci: add macos build action
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: fix paths win32
- **Backfilled** `.github/workflows/macos-release.yml` — ci: macos envs
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: skip signing appx

## 2025-10-26
- **Backfilled** `webapp/.eslintrc.json` — chore: delete webapp project
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — fix(supabase): extract indeed details from script tag with global metadata
- **Backfilled** `supabase/functions/_shared/jobDescriptionParser.ts` — feat(supabase): add more metadata to indeed descriptions

## 2025-10-27
- **Backfilled** `.github/workflows/linux-release.yml` — ci: monorepo (#57)
- **Backfilled** `apps/desktopProbe/package.json` — ci: make script
- **Backfilled** `nx.json` — ci: fix nx depends
- **Backfilled** `libraries/core/src/error.ts` — chore: fix
- **Backfilled** `package.json` — ci: release script
- **Backfilled** `package.json` — chore(release): 2.1.0
- **Backfilled** `apps/desktopProbe/package.json` — chore: desktop release config
- **Backfilled** `apps/desktopProbe/package.json` — ci: ignore checks
- **Backfilled** `apps/desktopProbe/package.json` — ci: fix package json
- **Backfilled** `apps/desktopProbe/package.json` — ci: generate changelog
- **Backfilled** `apps/backend/package.json` — ci: fix imports
- **Backfilled** `apps/desktopProbe/packagers/appx/AppXManifest.xml` — fix: appx manifest
- **Backfilled** `apps/backend/package.json` — Revert "ci: fix imports"
- **Backfilled** `apps/desktopProbe/package.json` — ci: fix workspace imports
- **Backfilled** `.github/workflows/linux-release.yml` — ci: trigger desktop app build with special tag
- **Backfilled** `pnpm-lock.yaml` — chore: pnpm lock
- **Backfilled** `apps/landingPage/src/pages/download.tsx` — ci: pin linux download version to latest tag

## 2025-10-28
- **Backfilled** `apps/blog/package.json` — ci: build blog project
- **Backfilled** `apps/landingPage/package.json` — ci: skip landing page build

## 2025-10-29
- **Backfilled** `apps/desktopProbe/src/components/home/jobSummary.tsx` — fix(desktop): job tags iterator
- **Backfilled** `apps/desktopProbe/package.json` — chore(desktop): patch version
- **Backfilled** `package.json` — chore(release): 2.1.1
- **Backfilled** `package.json` — chore: add publish script
- **Backfilled** `package.json` — chore: bump electron version
- **Backfilled** `.gitignore` — chore: add nx config
- **Backfilled** `.env.example` — chore: dockerize local dev
- **Backfilled** `apps/desktopProbe/src/components/home/jobSummary.tsx` — fix(desktop): god damn tags bug
- **Backfilled** `apps/nodeBackend/.env.example` — chore: add node backend project
- **Backfilled** `nx` — chore: add nx cmd scripts
- **Backfilled** `apps/landingPage/tailwind.config.ts` — chore(landingPage): fix tailwind config
- **Backfilled** `apps/landingPage/package.json` — chore(landingPage): remove explicit dependencies, use monorepo root ones
- **Backfilled** `apps/landingPage/package.json` — chore: enable build
- **Backfilled** `apps/blog/package.json` — chore(blog): dedup packages
- **Backfilled** `package.json` — chore: downgrade nc
- **Backfilled** `apps/desktopProbe/forge.config.ts` — chore(desktop): try fix pfx
- **Backfilled** `apps/desktopProbe/packagers/appx/devcert.pfx` — chore: fix dev cert
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: fix windows build
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: fix ms store
- **Backfilled** `apps/desktopProbe/package.json` — chore: move electron to desktop probe
- **Backfilled** `apps/backend/supabase/seed.sql` — fix: column default
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: fix ms store
- **Backfilled** `.github/workflows/build-all-projects.yml` — ci: build all projects
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: fix ms

## 2025-10-30
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: ms store fix
- **Backfilled** `apps/backend/supabase/functions/_shared/advancedMatching.ts` — fix(backend): use deno json for package mgmt
- **Backfilled** `package.json` — chore: upgrade supabase cli
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: ms build
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: mx auth
- **Backfilled** `apps/backend/supabase/functions/create-link/deno.json` — fix: add deno json to each function
- **Backfilled** `apps/backend/supabase/functions/scan-urls/index.ts` — fix(backend): non-null tags
- **Backfilled** `apps/backend/supabase/functions/create-link/index.ts` — fix(backend): non-null tags
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: ms build
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: ms fix
- **Backfilled** `apps/backend/supabase/functions/_shared/deno.json` — ci: new pfx and also add keys
- **Backfilled** `apps/desktopProbe/package.json` — chore: rename package
- **Backfilled** `apps/desktopProbe/packagers/appx/devcert.cer` — chore: add cer devcert
- **Backfilled** `README.md` — cods: add demo video link to README

## 2025-11-01
- **Backfilled** `apps/backend/supabase/functions/create-link/index.ts` — fix(backend): custom links check only if new site is also custom

## 2025-11-05
- **Backfilled** `apps/backend/supabase/functions/_shared/jobListParser.ts` — fix(backend): linkedin no results node
- **Backfilled** `apps/desktopProbe/src/server/overlayBrowserView.ts` — fix(desktop): overlay browser view must use same partition as scrapers
- **Backfilled** `package.json` — chore(release): 2.1.2
- **Backfilled** `apps/desktopProbe/package.json` — chore: desktop app patch
- **Backfilled** `apps/landingPage/src/pages/download.tsx` — chore: update download links
- **Backfilled** `apps/desktopProbe/src/components/createLink.tsx` — fix(desktop): create link dialog was not using user input as title
- **Backfilled** `package.json` — chore(release): 2.1.3
- **Backfilled** `apps/desktopProbe/package.json` — chore: desktop app patch version
- **Backfilled** `apps/desktopProbe/package.json` — chore: remove arch flag
- **Backfilled** `.github/workflows/macos-release.yml` — ci: import mac cert to codesign build
- **Backfilled** `.github/workflows/macos-release.yml` — ci: fix macos s3 paths
- **Backfilled** `.github/workflows/macos-release.yml` — ci: fix vars
- **Backfilled** `.github/workflows/macos-release.yml` — ci: auto update release json
- **Backfilled** `.github/workflows/macos-release.yml` — ci: macos build both versions

## 2025-11-06
- **Backfilled** `apps/landingPage/src/pages/download.tsx` — chore: pin all download links to latest build
- **Backfilled** `.github/workflows/linux-release.yml` — ci: linux release json
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: ms store release json
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: test release
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: normal flow
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: win releases json
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: fix
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: fix manual step
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: fix
- **Backfilled** `.github/workflows/ms-store-release.yml` — ci: fix
- **Backfilled** `.github/workflows/linux-release.yml` — ci: linux fix

## 2025-11-07
- **Backfilled** `apps/backend/supabase/functions/_shared/jobListParser.ts` — fix(backend): dice parser
- **Backfilled** `apps/landingPage/src/components/productSection.tsx` — chore(landing): replace hero video
- **Backfilled** `apps/landingPage/src/components/feedbackSection.tsx` — fix(landing): stop carousel on mouse hover

## 2025-11-12
- **Backfilled** `apps/backend/supabase/functions/_shared/jobListParser.ts` — fix(backend): linkedin parser

## 2025-11-16
- **Backfilled** `apps/desktopProbe/src/index.ts` — feat(analytics): log user_registered events
- **Backfilled** `apps/desktopProbe/src/server/rendererIpcApi.ts` — chore(analytics): log more feature usage events
- **Backfilled** `apps/desktopProbe/src/components/home/jobNotes.tsx` — feat: make notes feature more visible
- **Backfilled** `apps/desktopProbe/src/server/jobScanner.ts` — chore: fix duplicate event
- **Backfilled** `apps/desktopProbe/package.json` — chore: desktop app release
- **Backfilled** `package.json` — chore(release): 2.2.0
- **Backfilled** `apps/desktopProbe/package.json` — chore: desktop minor version
- **Backfilled** `apps/desktopProbe/package.json` — fix: enable html content in markdown renderer
- **Backfilled** `apps/backend/supabase/functions/_shared/customJobsParser.ts` — feat(supabase): overhaul custom job board format
- **Backfilled** `package.json` — chore(release): 2.3.0
- **Backfilled** `apps/desktopProbe/package.json` — chore: desktop app minor version

## 2025-11-21
- **Backfilled** `apps/backend/supabase/functions/_shared/jobListParser.ts` — fix(backend): don't throw error on custom job board parsing

## 2025-11-22
- **Backfilled** `apps/blog/app/[...slug]/page.tsx` — fix(blog): make the next build working again
- **Backfilled** `apps/blog/components/SearchProvider.tsx` — fix(blog): crash
- **Backfilled** `apps/blog/app/articles/page/[page]/page.tsx` — fix(blog): await params
- **Backfilled** `apps/blog/app/[...slug]/page.tsx` — fix(blog): make build running again

## 2025-11-23
- **Backfilled** `package.json` — chore: update supabase cli
- **Backfilled** `apps/backend/supabase/functions/_shared/deno.json` — fix(backend): add v2 parser for linkedin
- **Backfilled** `.github/workflows/terraform.yml` — feat(webapp): initial project (#58)
- **Backfilled** `.github/workflows/azure-static-web-apps-lively-stone-0288ce00f.yml` — ci: add Azure Static Web Apps workflow file on-behalf-of: @Azure opensource@microsoft.com
- **Backfilled** `.github/workflows/terraform.yml` — ci: remove terraform
- **Backfilled** `apps/blog/next-env.d.ts` — ci: remove tf
- **Backfilled** `.github/workflows/azure-static-web-apps-lively-stone-0288ce00f.yml` — ci: fix deploy
- **Backfilled** `.github/workflows/azure-static-web-apps-lively-stone-0288ce00f.yml` — ci: use pnpm
- **Backfilled** `.github/workflows/azure-static-web-apps-lively-stone-0288ce00f.yml` — ci: try again
- **Backfilled** `.github/workflows/azure-static-web-apps-lively-stone-0288ce00f.yml` — ci: try again
- **Backfilled** `.github/workflows/azure-static-web-apps-lively-stone-0288ce00f.yml` — ci: try again
- **Backfilled** `.github/workflows/azure-static-web-apps-lively-stone-0288ce00f.yml` — ci: refactor
- **Backfilled** `.github/workflows/azure-static-web-apps-lively-stone-0288ce00f.yml` — ci: local build
- **Backfilled** `.github/workflows/azure-static-web-apps-lively-stone-0288ce00f.yml` — ci: fix build
- **Backfilled** `.github/workflows/azure-static-web-apps-lively-stone-0288ce00f.yml` — ci: dispatch
- **Backfilled** `ci.txt` — chore: ci trigger
- **Backfilled** `.github/workflows/azure-static-web-apps-lively-stone-0288ce00f.yml` — ci: try fix
- **Backfilled** `.github/workflows/azure-static-web-apps-lively-stone-0288ce00f.yml` — ci: try fix
- **Backfilled** `.github/workflows/azure-static-web-apps-ashy-bay-070c2d30f.yml` — ci: add Azure Static Web Apps workflow file on-behalf-of: @Azure opensource@microsoft.com
- **Backfilled** `.github/workflows/azure-static-web-apps-ashy-bay-070c2d30f.yml` — ci: fix build
- **Backfilled** `.github/workflows/azure-static-web-apps-ashy-bay-070c2d30f.yml` — ci: try fix
- **Backfilled** `.github/workflows/azure-static-web-apps-ashy-bay-070c2d30f.yml` — ci: cache pnpm
- **Backfilled** `.github/workflows/azure-static-web-apps-ashy-bay-070c2d30f.yml` — ci: fix deploy token
- **Backfilled** `apps/webapp/package.json` — ci: next export
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — Add or update the Azure App Service build and deployment workflow config
- **Backfilled** `apps/webapp/package.json` — ci: remove export
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — ci: app deploy
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — ci: fix
- **Backfilled** `apps/webapp/next.config.ts` — fix: next config
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — ci: fix build
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — ci: try fix
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — ci: debug
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — ci: debug
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — ci: try fix
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — ci: fix
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — fix: fix artefact
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — ci: fix cache
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — ci: fix build
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — ci: fix build
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — ci: fix
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — ci: fix build
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — ci: frozen lock file
- **Backfilled** `.github/workflows/azure-static-web-apps-ashy-bay-070c2d30f.yml` — ci: remove static wep app
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — ci: try fx
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — ci: fix build
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — ci: fix build
- **Backfilled** `.github/workflows/master_first2apply-webapp.yml` — fix: paths

## 2025-11-24
- **Backfilled** `apps/backend/supabase/functions/.env.example` — chore: prettier fix

## 2025-11-26
- **Backfilled** `apps/blog/data/siteMetadata.js` — feat(blog): new angle
- **Backfilled** `docs/seoPlan.md` — docs: seo plan for the blog
- **Backfilled** `apps/blog/data/siteMetadata.js` — chore: blog description
- **Backfilled** `apps/blog/AGENTS.md` — chore(blog): add agents md file

## 2025-11-27
- **Backfilled** `README.md` — docs: update README for monorepo setup and development instructions
- **Backfilled** `README.md` — feat: add pnpm up script for Docker services and update README documentation

## 2025-11-28
- **Backfilled** `apps/blog/app/layout.tsx` — fix(blog): use different font
- **Backfilled** `apps/blog/data/blog/2025-11-28-chatgpt-resume-tailoring-guide.mdx` — feat: add blog post on using ChatGPT for resume tailoring
- **Backfilled** `apps/blog/app/tag-data.json` — feat: update blog post title, summary, and content to focus on rapid resume tailoring, and add/reorder associated tags
- **Backfilled** `docs/content_calendar.md` — docs: add content calendar for job search hacks

## 2025-12-01
- **Backfilled** `apps/backend/supabase/functions/_shared/jobListParser.ts` — fix(backend): flexjobs parser
- **Backfilled** `apps/desktopProbe/src/components/createLink.tsx` — fix(desktop): create link form was defaulting to cancel button
- **Backfilled** `package.json` — chore(release): 2.4.0
- **Backfilled** `apps/desktopProbe/package.json` — chore(desktop): patch version
- **Backfilled** `.github/workflows/linux-release.yml` — ci(desktop): fix version getection

## 2025-12-02
- **Backfilled** `apps/backend/supabase/functions/create-link/index.ts` — feat: increase the maximum number of custom parsed links allowed per user from 5 to 10

## 2025-12-03
- **Backfilled** `package.json` — chore: update pnpm version to 10.24.0 in packageManager
- **Backfilled** `apps/backend/supabase/functions/_shared/jobListParser.ts` — fix: update Dice job external URL generation to use `data-job-guid` instead of `data-id`
- **Backfilled** `apps/backend/supabase/functions/_shared/jobDescriptionParser.ts` — fix: adjust Dice job description selector for improved parsing

## 2025-12-08
- **Backfilled** `apps/backend/supabase/functions/_shared/jobDescriptionParser.ts` — fix: update Dice job description selector
- **Backfilled** `.vscode/settings.json` — fix: remove commented out import map from Deno settings
- **Backfilled** `apps/backend/supabase/functions/_shared/__fixtures__/jobBoards/dice.html` — fix(backend): dice job description parser and add tests for it
- **Backfilled** `package.json` — fix: update pnpm package manager version and add dependency overrides

## 2026-01-16
- **Backfilled** `apps/backend/supabase/functions/_shared/jobDescriptionParser.ts` — fix(backend): enhance Dice job description selector with additional class for improved parsing

## 2026-02-01
- **Backfilled** `apps/backend/supabase/seed.sql` — fix(backend): use proper index in job queries to authenticated users by adding user_id filter

## 2026-02-02
- **Backfilled** `apps/landingPage/src/components/feedbackSection.tsx` — feat(landingPage): add user reviews to feedback section for enhanced user insights
- **Backfilled** `apps/landingPage/src/components/bottomCta.tsx` — fix(landingPage): update user count and improve job search description in BottomCta component
- **Backfilled** `package.json` — chore(dependencies): update Next.js version from 16.0.3 to 16.1.6 in package.json and pnpm-lock.yaml

## 2026-02-07
- **Backfilled** `apps/backend/supabase/functions/_shared/customJobsParser.ts` — fix(backend): change query to use maybeSingle for advanced matching and update OpenAI model to gpt-5-mini
- **Backfilled** `apps/blog/app/tag-data.json` — feat(blog): add article on ATS systems explaining resume search mechanics

## 2026-02-13
- **Backfilled** `apps/backend/supabase/functions/_shared/parsers/linkedin.ts` — fix(linkedin): add additional selector for no results in parseLinkedInJobs function
- **Backfilled** `package.json` — chore: pnpm up

## 2026-02-21
- **Backfilled** `apps/backend/supabase/functions/_shared/advancedMatching.ts` — fix(openAI): update model name to gpt-5.2 and remove deprecated models

## 2026-03-13
- **Backfilled** `.env.example` — feat: light webapp project for viewing and managing jobs (#59)

## 2026-03-14
- **Backfilled** `apps/webapp/src/app/components/clientProviders.tsx` — fix(webapp): theme provider usage
- **Backfilled** `apps/blog/app/tag-data.json` — fix(blog): regenerate tags
- **Backfilled** `apps/blog/app/tag-data.json` — feat(blog): add new blog post for web companion launch
- **Backfilled** `apps/backend/supabase/functions/_shared/__fixtures__/jobBoards/dice.html` — fix(backend): dice parser when no company logo exists
- **Backfilled** `apps/backend/supabase/functions/_shared/parsers/linkedin.ts` — fix(parser): initialize tags array in parsed job object
- **Backfilled** `apps/backend/supabase/functions/_shared/customJobsParser.ts` — fix(customJobBoard): filter jobs to ensure external URLs start with HTTPS
- **Backfilled** `apps/backend/supabase/functions/_shared/parsers/linkedin.ts` — fix(backend): linkedin parser for AI results
- **Backfilled** `apps/backend/supabase/functions/_shared/__fixtures__/jobBoards/linkedin.html` — test(backend): add unit test for linkedin parser

## 2026-03-15
- **Backfilled** `apps/blog/app/tag-data.json` — fix(blog): reorder and update tags in tag-data.json
- **Backfilled** `apps/backend/supabase/functions/_shared/parsers/linkedin.ts` — fix(backend): make linkedin scraper more strict
- **Backfilled** `apps/desktopProbe/src/components/browserWindow.tsx` — fix(desktop): update TooltipTrigger to use 'asChild' prop
- **Backfilled** `apps/backend/supabase/functions/_shared/jobListParser.test.ts` — fix(backend): new linkedin AI results format
- **Backfilled** `.github/workflows/linux-release.yml` — feat: add flatpak and rpm makers for arch linux and steam deck support (#60)
- **Backfilled** `.github/workflows/linux-release.yml` — fix(desktop): linux build and CI pipeline
- **Backfilled** `apps/desktopProbe/src/server/autoUpdater.ts` — refactor(desktop): linux update url generation
- **Backfilled** `apps/landingPage/src/pages/download.tsx` — fix(lamndingPage): update Linux .deb download link to latest version
- **Backfilled** `apps/landingPage/next.config.ts` — fix(landingPage): nextjs build
- **Backfilled** `apps/landingPage/next.config.ts` — fix(landingPage): os icons
- **Backfilled** `apps/backend/supabase/functions/_shared/jobDescriptionParser.ts` — fix(jobDescriptionParser): add additional selector for indeed

## 2026-03-17
- **Backfilled** `apps/backend/supabase/functions/create-link/index.ts` — fix(create-link): increase maximum links per user from 50 to 100

## 2026-03-18
- **Backfilled** `apps/backend/supabase/functions/_shared/jobListParser.ts` — feat: add WebPageRuntimeData support across job parsing and link creation functions
- **Backfilled** `apps/desktopProbe/src/components/createLink.tsx` — feat(desktop): integrate WebPageRuntimeData into link creation and processing
- **Backfilled** `other/emailTemplates/newJobAlert.html` — fix(emailTemplate): simplify job alert layout and improve styling
- **Backfilled** `apps/backend/package.json` — chore: add typecheck script
- **Backfilled** `libraries/core/src/sdk.ts` — fix(core): ts build
- **Backfilled** `apps/backend/supabase/functions/create-link/index.ts` — feat: add 'force' option to create link functionality across multiple components
- **Backfilled** `apps/backend/supabase/functions/create-link/index.ts` — fix: improve error message for job detection failure
- **Backfilled** `apps/desktopProbe/package.json` — chore(desktop): patch version
- **Backfilled** `package.json` — chore: bump deps version

## 2026-03-20
- **Backfilled** `apps/backend/supabase/functions/_shared/parsers/linkedin.ts` — fix(linkedin): reorder rehydration data parsing logic to prefer html instead of runtime data

## 2026-03-26
- **Backfilled** `apps/backend/supabase/functions/_shared/__fixtures__/jobBoards/remoteio.html` — fix(backend): remote io parser
- **Backfilled** `apps/backend/supabase/functions/_shared/jobDescriptionParser.ts` — fix(parser): add additional selector for LinkedIn job descriptions

## 2026-04-02
- **Backfilled** `apps/backend/supabase/functions/create-link/index.ts` — fix(create-link): enhance error message to include site name for better context
- **Backfilled** `apps/backend/supabase/functions/_shared/parsers/linkedin.ts` — fix(linkedin): new ai results UI needs both client and server side support
- **Backfilled** `libraries/core/src/sdk.ts` — fix: build
- **Backfilled** `apps/desktopProbe/package.json` — chore(desktop): patch version

## 2026-04-03
- **Backfilled** `apps/backend/supabase/functions/_shared/emails/emailTemplates.ts` — fix(email): include provider name in new job alert email template
- **Backfilled** `apps/desktopProbe/src/server/browserHelpers.ts` — fix(desktop): runtime data was not collected properly
- **Backfilled** `apps/desktopProbe/package.json` — chore(desktop): patch version

## 2026-04-12
- **Backfilled** `apps/desktopProbe/src/server/browserHelpers.ts` — fix: update URL parameter filtering to ignore 'currentJobId'

## 2026-04-14
- **Backfilled** `apps/backend/supabase/functions/_shared/openAI.ts` — fix: update supported models and default model in OpenAI client

## 2026-04-27
- **Backfilled** `apps/backend/supabase/migrations/20260418000000_initial_schema.sql` — feat(db): all migrations through 20260424120001 (cloud-aligned)
- **Backfilled** `apps/backend/supabase/functions/_shared/env.ts` — chore(logger): null-safe Mezmo / LogDNA in probe + edge functions
- **Backfilled** `apps/backend/supabase/functions/_shared/parsers/greenhouseAts.ts` — feat(parsers): Greenhouse ATS site parser
- **Backfilled** `apps/desktopProbe/src/server/pushover.ts` — feat(notifications): pushover client scaffolding
- **Backfilled** `apps/backend/supabase/functions/_shared/advancedMatching.ts` — feat(filters): AI filter profiles — full stack
- **Backfilled** `apps/desktopProbe/.env.pi.example` — feat(deploy): Pi / household packaging scaffolding
- **Backfilled** `docs/superpowers/plans/2026-04-24-quiet-hours.md` — docs: quiet hours design + plan
- **Backfilled** `apps/backend/supabase/functions/create-link/index.ts` — chore(probe): UI / IPC / SDK wiring + misc polish
- **Backfilled** `BACKLOG.md` — chore: BACKLOG + config + .env.example updates
- **Backfilled** `.gitignore` — chore: opt out of ~/.claude auto-commit hook (.no-auto-commit + .gitignore)
- **Backfilled** `MONDAY-STATUS.md` — chore: align with local master tree
- **Backfilled** `apps/backend/supabase/migrations/20260424120000_quiet_hours.sql` — feat(db): include cloud-recovery migrations on the trunk
- **Backfilled** `apps/backend/supabase/functions/_shared/logger.ts` — fix(typecheck): unblock landing-page + partial backend typecheck
- **Backfilled** `libraries/core/src/database.types.ts` — chore(types): regenerate canonical Database types from cloud schema
- **Backfilled** `apps/desktopProbe/src/pages/filters.tsx` — feat(filters): explicit Save button for AI filter profile prompt
- **Backfilled** `apps/desktopProbe/src/server/pushover.ts` — feat(notifications): pushover audit + hardened helper
- **Backfilled** `apps/backend/supabase/migrations/20260425105000_keywords.sql` — feat(ai): keyword extraction (mission + JD) with mock fallback + budget module
- **Backfilled** `apps/backend/supabase/migrations/20260425110000_master_content_and_accounts.sql` — feat(content): master resume / cover letter schema + upload UI
- **Backfilled** `apps/backend/supabase/migrations/20260425115000_tailored_versions.sql` — feat(ai): per-profile tailored resume + cover letter builders
- **Backfilled** `apps/desktopProbe/src/lib/electronMainSdk.tsx` — feat(notifications): quiet hours v2 (cloud-aligned)
- **Backfilled** `apps/serverProbe/README.md` — feat(server): foundational serverProbe + serverWebUI + Pi deploy scripts
- **Backfilled** `apps/backend/supabase/migrations/20260425120000_approval_tokens.sql` — feat(notifications): approval flow stub with HMAC token + jti replay protection
- **Backfilled** `apps/desktopProbe/src/pages/connections.tsx` — feat(connections): LinkedIn CSV importer + enrichment (mock-first)
- **Backfilled** `decisions-notion.md` — chore: weekend autonomous build tooling + decisions log
- **Backfilled** `apps/desktopProbe/src/server/jobScanner.ts` — feat(notifications): route jobScanner pushover sends through dispatchPushoverSummary (#14)
- **Backfilled** `BACKLOG.md` — docs(backlog): log status='deleted' enum mismatch as known bug (#15)
- **Backfilled** `BACKLOG.md` — fix(db): add 'deleted' to "Job Status" enum (#16)
- **Backfilled** `.merge-train-log.md` — docs(plans): server-probe design (Pi 24/7 scraper) (#17)
- **Backfilled** `apps/desktopProbe/package.json` — chore(test): vitest setup + JobScanner regression tests (PR 1 of 5) (#18)
- **Backfilled** `apps/desktopProbe/package.json` — feat(scraper): extract libraries/scraper from desktopProbe (PR 2 of 5) (#19)

## 2026-04-28
- **Backfilled** `apps/serverProbe/package.json` — feat(serverProbe): Electron headless shell (PR 3 of 5) (#20)
- **Backfilled** `apps/backend/supabase/migrations/20260428000000_ai_usage_rls.sql` — fix(db): enable RLS on ai_usage_daily for multi-user safety
- **Backfilled** `apps/serverProbe/.dockerignore` — feat(deploy): Dockerfile + Pi systemd update + deploy.sh (PR 4 of 5) (#21)
- **Backfilled** `apps/desktopProbe/package.json` — chore(desktop): bump to 2.3.5 for household v0 deployment
- **Backfilled** `.github/CODEOWNERS` — feat(ci): GitHub Actions CI + release (PR 5 of 5) (#22)
- **Backfilled** `apps/backend/supabase/functions/_shared/env.ts` — fix(post-scan-hook): make mailer from-address env-driven (#23)
- **Backfilled** `apps/desktopProbe/packagers/household/publish-release.sh` — fix(packagers/household): pnpm + per-build PUSHOVER_USER_KEY scrub
- **Backfilled** `BACKLOG.md` — test(quietHours): add predicate tests + scraper vitest setup
- **Backfilled** `apps/desktopProbe/packagers/household/apply-update.sh` — feat(packagers/household): switch to push-based deploy
- **Backfilled** `apps/backend/supabase/migrations/20260428200000_fix_ensure_personal_account.sql` — fix(household-deploy): unblock signup + hardened scripts
- **Backfilled** `apps/backend/supabase/migrations/20260428100000_links_delete_jobs_trigger.sql` — fix(db): clean up orphaned jobs when a link is removed
- **Backfilled** `BACKLOG.md` — feat(household-deploy): travel-proof deploys via Tailscale fallback

## 2026-04-29
- **Backfilled** `BACKLOG.md` — fix(db): drop self-referencing account_members RLS policy + doc updates
- **Backfilled** `apps/desktopProbe/src/app.tsx` — feat(desktop): wire Master Content page (resume + cover letter persistence) (#24)
- **Backfilled** `apps/desktopProbe/package.json` — chore(desktop): bump to 2.3.6 for master-content release

## 2026-05-11
- **Backfilled** `apps/desktopProbe/src/env.ts` — chore: nightly sweep — update apps (7 files)
- **Backfilled** `apps/backend/supabase/functions/_shared/edgeFunctions.ts` — feat(probe): manual-scan HTTP control endpoint + service-role auth fix
- **Backfilled** `apps/desktopProbe/webpack.plugins.ts` — feat(desktop): bake F2A_PROBE_URL/SECRET via webpack EnvironmentPlugin

## 2026-05-12
- **Backfilled** `BACKLOG.md` — chore: nightly sweep — update BACKLOG.md (1 file)

## [Unreleased]

### Added
- Pi probe HTTP control server (`apps/serverProbe/src/controlServer.ts`) on port 7879 with bearer-token auth: `POST /scan/link/:id`, `POST /scan/user/:userId`, `GET /status`. Lets the desktop app trigger immediate Pi-side scans over Tailscale.
- Desktop "Scan all now" button on the Searches/Targets page + per-link refresh now routes through the Pi when reachable, with automatic fallback to the local scanner.
- `scanAllMyLinks()` SDK method (`apps/desktopProbe/src/lib/electronMainSdk.tsx`).
- `F2A_PROBE_URL` / `F2A_PROBE_SECRET` webpack EnvironmentPlugin entries so the renderer can be configured at build time.

### Changed
- Edge functions `scan-urls`, `scan-job-description`, `post-scan-hook`, `create-link` and `_shared/jobListParser.ts` now tolerate service-role JWT callers (probe / Pi control). Effective user is derived from `link.user_id` or `job.user_id` instead of `auth.getUser()`.

### Fixed
- Pi probe could not write `last_scraped_at` for any link: `auth.getUser()` rejected the service-role JWT with `"invalid claim: missing sub claim"`, silently no-oping every edge function call. Fixed by detecting service-role in `_shared/edgeFunctions.ts` and skipping `getUser()`.

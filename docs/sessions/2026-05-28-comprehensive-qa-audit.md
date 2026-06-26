# 2026-05-28 — Comprehensive QA Audit + Fixes (webapp + desktop)

## Original Issue
Run a systematic QA audit of both apps covering visual consistency, responsiveness, dark/light mode, button states, forms, navigation, and accessibility. Create a `/webapp-qa` skill with checklist. Fix all issues found and verify with Playwright.

## Follow-up Issues
- Webapp dev server crashed with `import.meta.webpackHot` — blocked browser testing, required root-cause investigation
- User requested autonomous execution — full QA + fixes without interaction

## Completed Tasks
- [x] Full UI inventory of both apps (14 desktop pages, 7 webapp routes, all components)
- [x] Created `/webapp-qa` skill with 80+ item checklist across 8 categories
- [x] Built Playwright test suite — confirmed HTTP 500 infrastructure bug
- [x] Ran 5 parallel code-level QA audits — 37 findings (9 HIGH, 14 MEDIUM, 14 LOW)
- [x] Root-caused dev server crash — react-refresh-loader injects `import.meta.webpackHot` into CJS files; switched `--webpack` → `--turbopack`
- [x] Fixed 13 accessibility labels across 8 files (icon buttons + form inputs)
- [x] Fixed LoginCard label-input association (removed conflicting explicit `id` props)
- [x] Fixed dark mode invisible spinner (`border-gray-900` → `border-foreground`)
- [x] Fixed hard-coded button hover color (`#809966` → `primary`)
- [x] Fixed double-submit on forgotPassword + resetPassword (added `isSubmitting` guard)
- [x] Fixed missing spinner size on forgotPasswordCard (added `h-4 w-4`)
- [x] Restored focus rings on jobTabs TabsTrigger elements
- [x] Converted 3 raw `<button>` to `<Button>` component
- [x] Added error boundaries — desktop RouteErrorBoundary + 404; webapp not-found/error/global-error
- [x] Re-ran Playwright QA — 0 findings, all pages pass in light/dark/mobile/tablet/desktop

## Key Findings
- Webapp dev `--webpack` mode was broken since inception — Turbopack works fine
- 23 of 37 QA issues fixed (all HIGH + MEDIUM), 14 LOW remain in backlog
- App has solid foundations: shadcn/ui, Radix accessibility, proper dark mode CSS variables

## Next Steps
- [ ] Commit and deploy the QA fixes [→ P1]
- [ ] Add character counters to filters inputs [→ P3]
- [ ] Remove dead `/connections` page or wire it up [→ P3]
- [ ] Add `max-w-full` to skeleton fixed-width components [→ P3]
- [ ] Standardize inline error display pattern [→ P2]
- [ ] Add required field indicators to forms [→ P2]
- [ ] Render `<FormMessage>` in desktop app forms [→ P2]

## Session Stats
- Turns: ~20 | Tokens: ~400k | Cost: ~$8-12 (Opus)

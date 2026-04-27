# first2apply-server-web-ui

Next.js 15 + Tailwind + shadcn/ui scaffold. Spec: `spec.md` §5 Item 4.

## Status (2026-04-25 weekend run)

- Scaffold: package.json + tsconfig + `app/page.tsx` + `lib/approval-token.ts` (with tests).
- `pnpm install` of `next`/`react`/`tailwindcss`/`shadcn-ui` deferred to Monday — those installs touch the lockfile and the user wanted a hand-on-the-wheel choice for versions.
- The `lib/approval-token.ts` module is fully implemented and tested (HMAC sign + verify, expiry, replay prevention via jti).

## Monday TODO

1. `pnpm install next@15 react@19 react-dom@19 tailwindcss@^4 @next/font shadcn-ui` (or whatever lockfile snapshot the user prefers).
2. `pnpm dlx shadcn@latest init` for components.
3. Implement `/login`, `/dashboard`, `/admin/users`, `/admin/probes`, `/profile/quiet-hours`, `/profile/master-content` per spec §5 Item 4.
4. Wire `APPROVAL_HMAC_SECRET` env loading and Postgres-backed `ApprovalDb` (using `approval_tokens` table — see migration `20260425120000_approval_tokens.sql`).

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## PWA

This app is an installable PWA. Design doc: `docs/plans/2026-05-17-webapp-pwa-design.md`.

- Manifest: `public/manifest.webmanifest`
- Service worker source: `src/app/sw.ts` (bundled by `@serwist/next` to `public/sw.js` on build)
- Offline page: `/offline`
- Kill-switch page: `/sw-reset`

### Build note

Serwist v9 requires webpack; `dev` and `build` scripts pass `--webpack` (Next 16 defaults to Turbopack).

### Kill switch (ops)

If a bad SW reaches production:

1. **Per-user recovery:** send the user to `https://<host>/?nosw=1` — the SW unregisters and the page reloads clean. Or send them to `/sw-reset`.
2. **Fleet-wide recovery:** flip `KILL_SW = true` in `src/app/sw.ts`, bump the version, ship. Installed clients self-unregister on next activation.

### Regenerating icons

Hand-edit `public/manifest.webmanifest`. For new icon sets:

```
npx pwa-asset-generator ./brand/logo.svg ./public/icons \
  --type png --favicon --maskable --opaque false --padding "10%"
```

Do **not** pass `--manifest` or `--index` — those flags clobber hand-edited files.


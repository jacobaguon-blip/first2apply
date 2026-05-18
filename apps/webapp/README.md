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

## Hosted on the Raspberry Pi

Design: `.claude/plans/2026-05-18-pwa-pi-deploy.md`.

The webapp runs on the Pi as a Next.js standalone bundle under the existing
`f2a-web-ui.service` systemd unit (port 3030, `EnvironmentFile=/opt/first2apply/.env`).
The Pi already fronts `*.maadcloud.com` with a Caddy container using Cloudflare
DNS-01 Let's Encrypt certs. The PWA is reachable at
**https://first2apply.maadcloud.com** for any device on the maadcloud tailnet.

### One-time Pi setup

1. Copy the updated systemd unit:
   ```
   sudo cp deploy/pi/systemd/f2a-web-ui.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable f2a-web-ui.service
   ```
2. Ensure the `first2apply` user exists and owns `/opt/first2apply/builds/web-ui`.
3. Ensure `/opt/first2apply/.env` on the Pi contains both
   `SUPABASE_URL=…` and `SUPABASE_ANON_KEY=…` for the cloud Supabase project
   users should connect to.
4. Add a sudoers stanza so the deploy can restart the unit without a password
   (`sudo visudo -f /etc/sudoers.d/f2a-web-ui`):
   ```
   first2apply ALL=(ALL) NOPASSWD: /bin/systemctl restart f2a-web-ui.service, /bin/systemctl stop f2a-web-ui.service, /bin/systemctl start f2a-web-ui.service
   ```
5. Add a Caddy site block for the PWA in `/home/maadkal/maadcloud/Caddyfile`:
   ```
   first2apply.maadcloud.com {
       import cloudflare_tls
       reverse_proxy 172.17.0.1:3030   # docker bridge gateway to host

       header /sw.js Cache-Control "no-cache, no-store, must-revalidate"
       header /sw.js Service-Worker-Allowed "/"
       header /manifest.webmanifest Cache-Control "no-cache"
   }
   ```
   Reload Caddy:
   ```
   docker exec maadcloud-caddy caddy reload --config /etc/caddy/Caddyfile
   ```
   If the bind-mounted Caddyfile change doesn't reflect inside the container,
   `docker restart maadcloud-caddy` forces a re-read.

   Note: `f2a-web-ui.service` binds to `0.0.0.0:3030` (not loopback) so the
   dockerized Caddy can reach it via the docker bridge gateway `172.17.0.1`.
   The Pi sits behind NAT and only :80/:443 are publicly exposed via Caddy,
   so raw :3030 stays internal to the Pi.
6. Cloudflare DNS: add an A record `first2apply.maadcloud.com → 100.93.137.31`
   (the Pi's tailnet IP), DNS-only (grey cloud). Caddy obtains the LE cert via
   DNS-01 within ~30s of the next request.

### Deploying

From this repo on your laptop:

```
./scripts/deploy-webapp-to-pi.sh
```

Override the SSH target if needed: `PI_SSH_TARGET=user@host ./scripts/deploy-webapp-to-pi.sh`.

The script will:
- Refuse to deploy if `apps/webapp` has uncommitted changes (commit first).
- Refuse to deploy if the Pi's env file is missing Supabase keys.
- Build `apps/webapp` standalone, rsync, restart the unit, and run a deep smoke
  against `/`, `/sw.js`, `/manifest.webmanifest`, `/offline`, `/sw-reset` —
  verifying the SW body contains the `sw-activated` literal so we know we
  served the real worker.

### Kill switch on the hosted version

Same flow as the desktop dev version, plus a redeploy:

1. Edit `apps/webapp/src/app/sw.ts`: set `KILL_SW = true`, bump `SW_VERSION`.
2. Commit.
3. `./scripts/deploy-webapp-to-pi.sh`.

All installed iPhone clients will self-unregister on next activation. For an
individual user, send them `https://<host>/?nosw=1` or `https://<host>/sw-reset`.

### Regenerating icons

Hand-edit `public/manifest.webmanifest`. For new icon sets:

```
npx pwa-asset-generator ./brand/logo.svg ./public/icons \
  --type png --favicon --maskable --opaque false --padding "10%"
```

Do **not** pass `--manifest` or `--index` — those flags clobber hand-edited files.


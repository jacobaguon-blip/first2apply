# Running the First 2 Apply probe on a Raspberry Pi

This bundle runs the Electron probe headlessly on a Raspberry Pi (linux/arm64)
under an Xvfb virtual display. Job alerts go to your phone via Pushover; the
native desktop notification is kept as a best-effort fallback.

## Prerequisites

- Raspberry Pi 5 (or Pi 4 with 8GB) running 64-bit Raspberry Pi OS / Debian.
- Docker Engine + Compose plugin (`docker compose version` must work).
- An SSD attached via USB3 and `/var/lib/docker` moved to it
  (SD cards will not survive running this for long).
- A Supabase Cloud project (free tier is fine) with the first2apply schema
  applied (see `apps/backend/README.md`).
- A [Pushover](https://pushover.net) account: create an Application to get an
  app token, and grab your user key from the dashboard.

## Set-up

1. `git clone git@github.com:jacobaguon-blip/first2apply.git /opt/first2apply`
2. `cd /opt/first2apply/apps/desktopProbe`
3. `cp .env.pi.example .env.pi` and fill in `SUPABASE_URL`, `SUPABASE_KEY`,
   `PUSHOVER_APP_TOKEN`, `PUSHOVER_USER_KEY`.
4. `docker compose -f docker-compose.pi.yml build` (takes a while — Electron
   + workspace libs compile inside the image).
5. `docker compose -f docker-compose.pi.yml up -d`
6. `docker compose -f docker-compose.pi.yml logs -f probe` to watch it come up.

## First-run authentication

The probe expects a user to be logged in to Supabase. The easiest way on a
headless Pi:

- **Option A (recommended):** Log in once on your Mac with the same build
  pointed at the same `SUPABASE_URL`. Copy the Electron userData dir
  (`~/Library/Application Support/first2apply-desktop`) onto the Pi as
  `./data/.config/first2apply-desktop`. The stored session token is portable.
- **Option B:** Uncomment the `x11vnc` block in `docker-compose.pi.yml`,
  rebuild, tunnel port 5900 to your Mac over SSH, connect with a VNC viewer,
  log in via the rendered UI, then comment x11vnc back out.

## systemd (optional, makes the probe come up on boot)

```
# /etc/systemd/system/first2apply-probe.service
[Unit]
Description=First 2 Apply probe
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/first2apply/apps/desktopProbe
ExecStart=/usr/bin/docker compose -f docker-compose.pi.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.pi.yml down

[Install]
WantedBy=multi-user.target
```

`sudo systemctl enable --now first2apply-probe.service`

## Troubleshooting

- **Chromium crashes immediately:** confirm the container has
  `ELECTRON_DISABLE_SANDBOX=1` and that you are not running an older Pi kernel
  that lacks the required syscalls. `docker compose logs probe` will usually
  show the segfault.
- **No Pushover alerts:** verify the env vars reached the container with
  `docker compose exec probe env | grep PUSHOVER`. The probe always prefers env
  vars over in-app settings.
- **Probe runs but scans fail:** residential IPs are usually fine, but
  LinkedIn/Indeed occasionally serve a captcha. Check the probe logs for
  auth/captcha errors and log in interactively via the x11vnc path above to
  solve them.

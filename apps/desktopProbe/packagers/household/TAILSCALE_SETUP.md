# Tailscale setup for travel-proof household deploys

The deploy script (`deploy-to-her.sh`) defaults to the Tailscale MagicDNS
hostname for her Mac so deploys work from any network. This is one-time
setup — after this, you never touch it again.

## Why

`Jacobs-MacBook-Pro-2.local` is mDNS/Bonjour, which only resolves on the
same broadcast domain. Deploys break the moment either Mac is off home
Wi-Fi (coffee shop, hotel, parents' house, etc.). Tailscale gives both
machines stable hostnames that resolve from anywhere.

## Pre-checked

- ✓ Tailscale already installed and signed in on YOUR Mac (`jacobs-macbook-pro-3`).
- ✓ Your tailnet (`jacob.aguon@`) already has the Pi (`raspberrypi`) on it.

## What to do (on her Mac)

1. **Install Tailscale.** The Mac App Store version is fine, or:
   ```
   brew install --cask tailscale-app
   ```
   (You can run that over the existing SSH session as long as Homebrew is
   available on her Mac. If not, App Store is faster.)

2. **Sign in.** Launch Tailscale → click the menu bar icon → Sign in →
   pick the same Google account you used on YOUR Mac (the one tied to
   `jacob.aguon@`). It'll open a browser, you click Connect.

3. **Confirm she joined.** Back on YOUR Mac:
   ```
   tailscale status | grep -i jacobs-macbook-pro-2
   ```
   You should see her machine listed with an IP in the `100.x.x.x` range.

4. **Verify hostname matches the script default.** Tailscale auto-derives
   the hostname from her Mac's `LocalHostName`, so it should be
   `jacobs-macbook-pro-2`. If Tailscale chose something different, run:
   ```
   tailscale status | awk '/jacob.aguon@.*macOS/ && !/this/ {print $2}'
   ```
   …and update the first entry in `~/.f2a/deploy.config` on YOUR Mac.

5. **Test it.** From your Mac:
   ```
   bash apps/desktopProbe/packagers/household/deploy-to-her.sh --dry-run
   ```
   Output should show `Selected jacobaguon@jacobs-macbook-pro-2` and all
   preflight checks passing.

## Done

After this, every `deploy-to-her.sh` invocation tries the Tailscale name
first. If for some reason Tailscale is down, it falls back to `.local`.
You can ignore `TARGET=` env vars entirely — config file handles it.

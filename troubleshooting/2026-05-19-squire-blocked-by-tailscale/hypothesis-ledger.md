# Hypothesis Ledger — first2apply: Squire (Twingate) returns 403 when Tailscale DNS is on
Last updated: 2026-05-19T17:00-06:00
Created by: /troubleshoot-project (paired with /systematic-debugging)

## Problem Frame
DOING:     Open https://us-west-2.squire.ductone.com in Chrome with Twingate connected.
EXPECTING: Page loads (works when Tailscale is off / Tailscale DNS toggle is off).
GETTING:   403 Forbidden, response header `server: awselb/2.0`. Only happens with Tailscale "Use Tailscale DNS Settings" enabled.

## Repro
1. Toggle Tailscale "Use Tailscale DNS Settings" ON (split DNS configured for ts.net via API).
2. Curl `https://us-west-2.squire.ductone.com` → HTTP/2 403 from awselb/2.0.
3. Toggle Tailscale DNS OFF → page loads.

## Environment
- Mac, macOS 25.3
- Tailscale active (utun7, 100.71.64.91); Twingate active (utun4, 100.96.0.2)
- Split DNS via Tailscale API: `{"ts.net": ["100.100.100.100"]}` (only ts.net should hit Tailscale's resolver)

## Hypotheses

### H1: Tailscale hijacks the 100.x route, so traffic to Twingate's gateway IP never reaches utun4
**Gate:** `route get 100.96.37.196` returns utun4 (Twingate).
**Evidence:**
  - `route get 100.96.37.196` → `interface: utun4` (Twingate). ✓
  - `netstat -rn`: route `100.96/12 → utun4`; Tailscale only installs /32 host routes for its peers on utun7. No L3 hijack.
**Result:** ❌ disproven

### H2: System resolver returns wrong IP for Squire when Tailscale DNS is on
**Gate:** `dscacheutil -q host -a name us-west-2.squire.ductone.com` returns public AWS IPs instead of Twingate's 100.96.37.196 gateway IP.
**Evidence:**
  - `dig @100.95.0.251 us-west-2.squire.ductone.com +short` → `100.96.37.196` (Twingate, correct, in-tunnel path)
  - `dig @100.100.100.100 us-west-2.squire.ductone.com +short` → `50.112.89.11`, `44.224.147.105` (public AWS ALB IPs)
  - `dig us-west-2.squire.ductone.com +short` (default) → `100.96.37.196` (uses Twingate via resolver #1)
  - **`dscacheutil -q host -a name us-west-2.squire.ductone.com` → `44.224.147.105`, `50.112.89.11` (PUBLIC IPs only, no Twingate IP)**
  - Chrome and almost all macOS apps use `getaddrinfo` → mDNSResponder → same path as dscacheutil.
**Result:** ✅ confirmed

## Root Cause
With "Use Tailscale DNS Settings" enabled, macOS's mDNSResponder (the resolver path used by `dscacheutil`, `getaddrinfo`, Chrome, and most apps) returns the **public** AWS ALB IPs for `us-west-2.squire.ductone.com` instead of Twingate's tunnel gateway IP `100.96.37.196`. Chrome connects directly to the public ALB, which sees a non-corporate source IP and returns 403.

The Tailscale "split DNS" admin-console setting `{"ts.net": ["100.100.100.100"]}` is meant to restrict Tailscale's resolver to ts.net queries only, but in practice mDNSResponder's resolver ordering on this Mac is still routing `ductone.com` lookups through Tailscale's resolver (which forwards to a public upstream), drowning out Twingate's correct answer. `dig` happens to query resolver #1 directly and gets Twingate's answer; system apps don't.

Twingate's tunnel is fine. The DNS resolution path is the break.

## Fix
Revert split DNS and go back to the pre-existing, known-good config: keep Tailscale DNS off, use a `/etc/hosts` pin for the bare `raspberrypi` name (the original workaround from memory `feedback_tailscale_dns_twingate.md`).

Actions:
1. Delete the Tailscale split-DNS entry via the API.
2. Toggle "Use Tailscale DNS Settings" OFF on the Mac.
3. Add `100.93.137.31 raspberrypi` to `/etc/hosts`.

## Verification
- After revert, `dscacheutil -q host -a name us-west-2.squire.ductone.com` should NOT return the public AWS IPs (only the Twingate one once resolved through the tunnel).
- Squire loads in Chrome.
- F2A's "Pi unreachable" probe still passes because /etc/hosts pin resolves `raspberrypi` to its tailnet IP.

## Summary
Tailscale's "split DNS" scoping is not honored end-to-end by macOS mDNSResponder. Even with Tailscale's admin console restricted to `ts.net`, system-level DNS lookups for `ductone.com` returned the public AWS IPs instead of Twingate's in-tunnel gateway IP, causing Squire's ALB to 403 the request. The fix is to keep Tailscale DNS off entirely on this Mac and rely on a `/etc/hosts` pin for the Raspberry Pi's bare hostname.

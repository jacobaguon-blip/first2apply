# What changes for you — local AI on the Pi

## Before

You opened the job app and the newest postings were a week old. Clicking Scan
seemed to spin forever and never brought anything in. The reason wasn't the
app — it was that the outside service it relies on to read job pages had run
out of its paid allowance, so every page came back empty.

## After

The app no longer depends on the outside paid service at all. The little home
computer now does the reading itself, using a private assistant that runs
right on it. Everything stays on your private network. Nothing leaves the
house except the saved job listings, which still land in your normal job list
the same way they always have.

## What you'll do differently

Nothing in your daily routine changes. You open the app, you scan, you see
new jobs. The only thing that's different under the hood is who is doing the
reading.

There is one thing to know: the home computer is slower than the paid cloud
service was. A scan that used to finish in a couple of minutes will now take
longer — sometimes much longer for a big careers page. New jobs will still
appear, just not all at once. If you click Scan, walk away and come back to
it; don't sit and stare. The hourly automatic check will catch up everything
on its own.

## What stays the same

Your job list, the way it looks, the way you mark jobs applied or archived,
the email or phone alerts, the resume tailoring, the fit scores — none of
that changed. You sign in the same way. Your phone still works the same way.
The data still lives in the same place.

## If something goes wrong

If new jobs stop showing up entirely, two things can be checked. First, is
Tailscale connected on your machine? If not, the app can't reach the home
computer at all. Second, is the home computer turned on and reachable. If
both of those are fine and jobs still aren't coming in, the paid cloud
service can be turned back on as a fallback — a single setting flip on the
home computer, no app update needed.

// Minimal sink for SW lifecycle beacons (plan §4.8).
// v1: log only. No PII. No dashboards.

export async function POST(req: Request) {
  try {
    const body = await req.text();
    // Keep payload bounded; sendBeacon limits us anyway.
    if (body.length < 2048) {
      console.info('[sw-event]', body);
    }
  } catch {
    // ignore
  }
  return new Response(null, { status: 204 });
}

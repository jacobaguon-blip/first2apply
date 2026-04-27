export async function sendPushover(opts: {
  appToken: string;
  userKey: string;
  title: string;
  message: string;
  url?: string;
  urlTitle?: string;
}) {
  const params = new URLSearchParams({
    token: opts.appToken,
    user: opts.userKey,
    title: opts.title,
    message: opts.message,
    ...(opts.url ? { url: opts.url, url_title: opts.urlTitle ?? 'Open' } : {}),
  });

  const response = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Pushover API ${response.status}: ${body}`);
  }
}

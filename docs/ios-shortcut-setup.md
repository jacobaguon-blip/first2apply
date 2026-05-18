# iOS Share-Sheet → First 2 Apply

Lets you share a job-board URL (LinkedIn search, company careers page, etc.) from iPhone Safari → it shows up in the desktop dashboard automatically.

## How it works

1. Tap **Share** in Safari → **First 2 Apply** shortcut.
2. The shortcut posts the URL to a Supabase edge function with a personal token.
3. The desktop app polls every 60 seconds, opens the URL in a hidden browser to capture the page DOM, and creates a normal link.
4. Failures (e.g. unsupported site) show up in the dashboard "Pending from iPhone" panel with an error and a retry button.

## One-time setup

### 1. Generate a personal token on your desktop

Until the Settings UI ships, generate one from DevTools:

1. Open First 2 Apply on the desktop where you're signed in as the same user the iPhone should share to.
2. View → Toggle Developer Tools (or `Cmd+Option+I`).
3. Console → paste:
   ```js
   await window.electron.ipcRenderer.invoke('create-api-token', { label: 'iPhone' })
   ```
4. Copy the `token` value from the response. **You'll only see it once.** If you lose it, generate a new one and revoke the old one with `revoke-api-token`.

### 2. Install the Shortcut on iPhone

Build it once (takes 2 minutes):

1. **Shortcuts app** → `+` → Add Action.
2. **Receive** → input from **Share Sheet** → accepts **URLs**.
3. Add action **Get Contents of URL**:
   - URL: `https://<your-supabase-project>.supabase.co/functions/v1/queue-pending-link`
   - Method: **POST**
   - Headers:
     - `x-f2a-token` = `<token from step 1>`
     - `Content-Type` = `application/json`
   - Request Body: **JSON**
     - `url` = Shortcut Input
     - `title` = (optional) Shortcut Input → Name
4. Add **If** action: `Contents of URL` contains `"id"` → **Show Notification** "Queued for First 2 Apply" → Otherwise → **Show Notification** "Failed: <Contents of URL>".
5. Name it **First 2 Apply**, enable **Show in Share Sheet**.

### 3. Try it

Open any URL in Safari → **Share** → **First 2 Apply** → "Queued" notification. Within 60 seconds, check the desktop dashboard.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `invalid-token` | Token revoked or mistyped | Regenerate, paste into Shortcut |
| `queue-full` | 30 pending links not yet drained | Open the desktop app so it can drain |
| Dashboard shows row as **failed: site not supported** | URL isn't a known job board and you don't have the custom-parsing premium flag | Retry won't help — site needs a parser |
| Dashboard shows **failed: <network error>** | Transient — already retried up to 3 times | Hit **Retry** in the panel |

## Security notes

- Tokens are stored in Supabase as `sha256(token)`. The raw token only ever lives in the iCloud-synced Shortcut.
- Revoke at any time via `await window.electron.ipcRenderer.invoke('revoke-api-token', { id: <id> })`. List tokens with `list-api-tokens`.
- Tokens never expire automatically. Rotate periodically if paranoid.

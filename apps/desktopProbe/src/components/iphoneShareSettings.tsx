import {
  ApiToken,
  createApiToken,
  listApiTokens,
  revokeApiToken,
  openExternalUrl,
  startShortcutInstall,
  stopShortcutInstall,
  ShortcutInstallPayload,
  saveShortcutFile,
} from '@/lib/electronMainSdk';
import { Button, Input, Label } from '@first2apply/ui';
import { useEffect, useState } from 'react';

const SHORTCUT_DOC_URL = 'https://github.com/jacobaguon-blip/first2apply/blob/master/docs/ios-shortcut-setup.md';

export function IPhoneShareSettings({ supabaseUrl }: { supabaseUrl: string }) {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [install, setInstall] = useState<ShortcutInstallPayload | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/queue-pending-link`;

  const refresh = async () => {
    setLoading(true);
    try {
      const { tokens } = await listApiTokens();
      setTokens(tokens);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!install) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [install]);

  const onShowInstallQR = async () => {
    setInstallError(null);
    try {
      const { token } = await createApiToken('iPhone Share (QR install)');
      setNewToken(token); // also surface raw token in case user wants manual fallback
      const payload = await startShortcutInstall({ endpoint, token });
      setInstall(payload);
      await refresh();
    } catch (e) {
      setInstallError((e as Error).message);
    }
  };

  const [airdropPath, setAirdropPath] = useState<string | null>(null);
  const onAirdrop = async () => {
    setInstallError(null);
    setAirdropPath(null);
    try {
      const { token } = await createApiToken('iPhone Share (AirDrop)');
      setNewToken(token);
      const { path } = await saveShortcutFile({ endpoint, token });
      setAirdropPath(path);
      await refresh();
    } catch (e) {
      setInstallError((e as Error).message);
    }
  };

  const onCloseInstall = async () => {
    setInstall(null);
    try {
      await stopShortcutInstall();
    } catch {
      /* ignore */
    }
  };

  const remainingSec = install ? Math.max(0, Math.floor((install.expiresAt - now) / 1000)) : 0;

  const onCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const { token } = await createApiToken('iPhone Share');
      setNewToken(token);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const onRevoke = async (id: number) => {
    try {
      await revokeApiToken(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const active = tokens.filter((t) => !t.revoked_at);
  const revoked = tokens.filter((t) => t.revoked_at);

  return (
    <div className="space-y-4 rounded-lg border p-6">
      <div className="space-y-1">
        <h2 className="text-lg">iPhone Sharing</h2>
        <p className="text-sm font-light">
          Build a small iOS Shortcut once, then sharing any URL from Safari adds it to your dashboard.
        </p>
        <ol className="list-decimal space-y-1 pl-5 pt-2 text-sm">
          <li>
            On iPhone, open <span className="font-medium">Shortcuts</span> → tap <span className="font-medium">+</span>.
          </li>
          <li>
            Add action <span className="font-medium">"Receive from Share Sheet"</span> → input type <span className="font-medium">URLs</span>.
          </li>
          <li>
            Add action <span className="font-medium">"Get Contents of URL"</span>:
            URL = the endpoint below; Method = <span className="font-medium">POST</span>;
            Headers: <span className="font-mono text-xs">x-f2a-token</span> = the generated token,{' '}
            <span className="font-mono text-xs">Content-Type</span> = <span className="font-mono text-xs">application/json</span>;
            Body: JSON, one field <span className="font-mono text-xs">url</span> = magic variable <span className="font-medium">Shortcut Input</span>.
          </li>
          <li>
            Add action <span className="font-medium">"Show Notification"</span> with text "Queued for First 2 Apply".
          </li>
          <li>
            Rename to <span className="font-medium">First2Apply</span> → tap (i) → toggle <span className="font-medium">Use with Share Sheet</span> ON.
          </li>
          <li>
            Test: Safari → any URL → Share → First2Apply → look for "Queued" toast → check your dashboard ~60s later.
          </li>
        </ol>
      </div>

      <div className="space-y-1">
        <Label>Shortcut endpoint (paste into the Shortcut's URL field)</Label>
        <div className="flex gap-2">
          <Input readOnly value={endpoint} onFocus={(e) => e.currentTarget.select()} />
          <Button variant="outline" onClick={() => onCopy(endpoint)}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      </div>

      {newToken && (
        <div className="space-y-2 rounded-md border border-green-500/40 bg-green-50 p-4 dark:bg-green-950/30">
          <p className="text-sm font-medium">Copy this token now — you won't see it again.</p>
          <div className="flex gap-2">
            <Input readOnly value={newToken} onFocus={(e) => e.currentTarget.select()} />
            <Button onClick={() => onCopy(newToken)}>{copied ? 'Copied!' : 'Copy token'}</Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setNewToken(null)}>
            Done
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {installError && <p className="text-sm text-destructive">{installError}</p>}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Active tokens</Label>
          <div className="flex gap-2">
            <Button onClick={onCreate} disabled={creating}>
              {creating ? 'Generating…' : 'Generate iPhone token'}
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : active.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active tokens yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-normal">Label</th>
                <th className="py-1 font-normal">Created</th>
                <th className="py-1 font-normal">Last used</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {active.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="py-2">{t.label}</td>
                  <td className="py-2">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="py-2">{t.last_used_at ? new Date(t.last_used_at).toLocaleString() : 'never'}</td>
                  <td className="py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => onRevoke(t.id)}>
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {revoked.length > 0 && (
          <details className="pt-2 text-sm text-muted-foreground">
            <summary className="cursor-pointer">{revoked.length} revoked token(s)</summary>
            <ul className="mt-2 space-y-1">
              {revoked.map((t) => (
                <li key={t.id}>
                  {t.label} — revoked {new Date(t.revoked_at!).toLocaleDateString()}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

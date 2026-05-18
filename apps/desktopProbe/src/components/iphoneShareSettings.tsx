import {
  ApiToken,
  createApiToken,
  listApiTokens,
  revokeApiToken,
  openExternalUrl,
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
          Generate a personal token, paste it into the First 2 Apply iOS Shortcut, then share any URL from Safari to add it
          to your dashboard.{' '}
          <a
            className="cursor-pointer text-primary underline"
            onClick={(e) => {
              e.preventDefault();
              openExternalUrl(SHORTCUT_DOC_URL);
            }}
          >
            Setup walkthrough →
          </a>
        </p>
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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Active tokens</Label>
          <Button onClick={onCreate} disabled={creating}>
            {creating ? 'Generating…' : 'Generate iPhone token'}
          </Button>
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

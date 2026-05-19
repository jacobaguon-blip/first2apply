import {
  PendingLinkRow,
  deletePendingLink,
  listPendingLinks,
  retryPendingLink,
} from '@/lib/electronMainSdk';
import { Button } from '@first2apply/ui';
import { useEffect, useState } from 'react';

const POLL_MS = 10_000;

export function PendingFromIphone() {
  const [rows, setRows] = useState<PendingLinkRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const { rows } = await listPendingLinks();
      setRows(rows);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, []);

  if (rows.length === 0 && !error) return null;

  return (
    <section className="mt-12">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-medium tracking-wide">Pending from iPhone</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            URLs shared from the First2Apply iOS Shortcut. Pending entries are queued; failed entries hit an error during processing.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          Refresh
        </Button>
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-4 space-y-2">
        {rows.map((r) => (
          <div
            key={r.id}
            className={
              'rounded-md border p-4 ' +
              (r.status === 'failed' ? 'border-destructive/40 bg-destructive/5' : 'border-border')
            }
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.title || r.url}</p>
                <p className="break-all text-xs text-muted-foreground">{r.url}</p>
                <p className="mt-1 text-xs">
                  <span
                    className={
                      'inline-block rounded px-2 py-0.5 ' +
                      (r.status === 'failed'
                        ? 'bg-destructive text-destructive-foreground'
                        : 'bg-yellow-200 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100')
                    }
                  >
                    {r.status === 'failed' ? `Failed (attempt ${r.attempts})` : `Pending (attempt ${r.attempts})`}
                  </span>{' '}
                  <span className="text-muted-foreground">· {new Date(r.created_at).toLocaleString()}</span>
                </p>
                {r.error_message && (
                  <p className="mt-2 break-words text-sm text-destructive">{r.error_message}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {r.status === 'failed' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await retryPendingLink(r.id);
                      refresh();
                    }}
                  >
                    Retry
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await deletePendingLink(r.id);
                    refresh();
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

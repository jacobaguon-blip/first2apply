import {
  PendingLinkRow,
  deletePendingLink,
  listPendingLinks,
  retryPendingLink,
  updatePendingLink,
} from '@/lib/electronMainSdk';
import { Button, Input } from '@first2apply/ui';
import { useEffect, useState } from 'react';

const POLL_MS = 10_000;
const COMPLETED_HORIZON_DAYS = 7;

type Filter = 'all' | 'pending' | 'failed' | 'completed';

export function PendingFromIphone() {
  const [rows, setRows] = useState<PendingLinkRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<number, { url: string; title: string }>>({});
  const [filter, setFilter] = useState<Filter>('all');

  const refresh = async () => {
    try {
      const { rows } = await listPendingLinks();
      const horizon = Date.now() - COMPLETED_HORIZON_DAYS * 86_400_000;
      const visible = rows.filter(
        (r) => r.status !== 'completed' || (r.completed_at && new Date(r.completed_at).getTime() >= horizon),
      );
      setRows(visible);
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

  const counts = {
    pending: rows.filter((r) => r.status === 'pending').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    completed: rows.filter((r) => r.status === 'completed').length,
  };

  const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  const startEdit = (r: PendingLinkRow) => {
    setEditing((s) => ({ ...s, [r.id]: { url: r.url, title: r.title ?? '' } }));
  };
  const cancelEdit = (id: number) => {
    setEditing((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
  };
  const saveEdit = async (id: number) => {
    const draft = editing[id];
    if (!draft) return;
    try {
      await updatePendingLink({ id, url: draft.url, title: draft.title });
      cancelEdit(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="mt-12">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-medium tracking-wide">Pending from iPhone</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            URLs shared from the First2Apply iOS Shortcut. Completed entries are kept for {COMPLETED_HORIZON_DAYS} days as a recent-activity log.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          Refresh
        </Button>
      </div>

      <div className="mt-2 flex gap-2 text-xs">
        {(['all', 'pending', 'failed', 'completed'] as Filter[]).map((f) => {
          const label =
            f === 'all'
              ? `All (${rows.length})`
              : `${f.charAt(0).toUpperCase()}${f.slice(1)} (${counts[f as keyof typeof counts]})`;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                'rounded-md border px-2 py-1 ' +
                (filter === f ? 'border-primary bg-primary/10' : 'border-border')
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-4 space-y-2">
        {shown.map((r) => {
          const isEditing = !!editing[r.id];
          const isCompleted = r.status === 'completed';
          const isFailed = r.status === 'failed';
          return (
            <div
              key={r.id}
              className={
                'rounded-md border p-4 ' +
                (isFailed
                  ? 'border-destructive/40 bg-destructive/5'
                  : isCompleted
                  ? 'border-green-500/40 bg-green-50/50 dark:bg-green-950/20'
                  : 'border-border')
              }
            >
              {isEditing ? (
                <div className="space-y-2">
                  <Input
                    placeholder="Real careers/jobs URL (e.g. recruiting.paylocity.com/...)"
                    value={editing[r.id].url}
                    onChange={(e) => setEditing((s) => ({ ...s, [r.id]: { ...s[r.id], url: e.target.value } }))}
                  />
                  <Input
                    placeholder="Title (optional)"
                    value={editing[r.id].title}
                    onChange={(e) => setEditing((s) => ({ ...s, [r.id]: { ...s[r.id], title: e.target.value } }))}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(r.id)}>
                      Save & retry
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => cancelEdit(r.id)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.title || r.url}</p>
                    <p className="break-all text-xs text-muted-foreground">{r.url}</p>
                    <p className="mt-1 text-xs">
                      <span
                        className={
                          'inline-block rounded px-2 py-0.5 ' +
                          (isFailed
                            ? 'bg-destructive text-destructive-foreground'
                            : isCompleted
                            ? 'bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-100'
                            : 'bg-yellow-200 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100')
                        }
                      >
                        {isFailed
                          ? `Failed (attempt ${r.attempts})`
                          : isCompleted
                          ? '✓ Added'
                          : `Pending (attempt ${r.attempts})`}
                      </span>{' '}
                      <span className="text-muted-foreground">
                        · {new Date(isCompleted && r.completed_at ? r.completed_at : r.created_at).toLocaleString()}
                      </span>
                    </p>
                    {r.error_message && !isCompleted && (
                      <p className="mt-2 break-words text-sm text-destructive">{r.error_message}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {!isCompleted && (
                      <Button variant="outline" size="sm" onClick={() => startEdit(r)}>
                        Edit URL
                      </Button>
                    )}
                    {isFailed && (
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
                      {isCompleted ? 'Dismiss' : 'Delete'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

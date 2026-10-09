// Pure helpers for the save-connections IPC handler. Kept outside src/server/connections/
// because the vitest config excludes that folder.

export const MAX_CONNECTION_ROWS = 20000;
export const CONNECTIONS_CHUNK_SIZE = 500;

export type ConnectionInput = {
  firstName: string;
  lastName: string;
  url: string;
  company: string;
  position: string;
  connectedOnIso: string | null;
};

/** Only accept plain YYYY-MM-DD dates, anything else becomes null. */
export function validIsoDate(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function chunk<T>(items: T[], size = CONNECTIONS_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Drops rows without a url, then dedupes by trimmed lowercase url (last row wins).
 * Returns normalized rows (trimmed url, validated date) plus counts of what was dropped.
 */
export function prepareConnections(rows: ConnectionInput[]): {
  rows: ConnectionInput[];
  skippedNoUrl: number;
  duplicatesDropped: number;
} {
  const byKey = new Map<string, ConnectionInput>();
  let skippedNoUrl = 0;
  let usable = 0;
  for (const r of rows) {
    const url = String(r?.url ?? '').trim();
    if (url === '') {
      skippedNoUrl++;
      continue;
    }
    usable++;
    byKey.set(url.toLowerCase(), {
      firstName: r.firstName ?? '',
      lastName: r.lastName ?? '',
      url,
      company: r.company ?? '',
      position: r.position ?? '',
      connectedOnIso: validIsoDate(r.connectedOnIso),
    });
  }
  return { rows: [...byKey.values()], skippedNoUrl, duplicatesDropped: usable - byKey.size };
}

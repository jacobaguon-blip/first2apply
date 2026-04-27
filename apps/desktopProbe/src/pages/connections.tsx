// Item 12 — LinkedIn Connections import page.
// CSV parsing happens in the renderer; persistence + enrichment are stubbed
// (mock-first per spec §9.5; live transport requires F2A_ENRICH_LIVE=1).

import { Button } from '@first2apply/ui';
import { Label } from '@first2apply/ui';
import { useMemo, useState } from 'react';

import { parseConnectionsCsv, type Connection } from '@/server/connections/csv';

import { DefaultLayout } from './defaultLayout';

export function ConnectionsPage() {
  const [filename, setFilename] = useState<string | null>(null);
  const [rows, setRows] = useState<Connection[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (f: File) => {
    setError(null);
    setWarnings([]);
    setRows([]);
    setFilename(f.name);
    const text = await f.text();
    try {
      const { connections, warnings } = parseConnectionsCsv(text);
      setRows(connections);
      setWarnings(warnings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const companyCount = useMemo(() => new Set(rows.map((r) => r.company)).size, [rows]);

  return (
    <DefaultLayout className="space-y-4 p-6 md:p-10">
      <h1 className="text-2xl font-medium tracking-wide">LinkedIn connections</h1>
      <p className="text-sm font-light">
        Export your LinkedIn connections as CSV (Settings → Data privacy → Get a copy of your
        data → Connections), then upload here. Enrichment uses a local fixture by default; live
        web search is opt-in via <code>F2A_ENRICH_LIVE=1</code>.
      </p>

      <div className="rounded-lg border p-6 space-y-4">
        <div className="space-y-1">
          <Label htmlFor="cx-file">CSV file</Label>
          <input
            id="cx-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          {filename && <p className="text-xs font-light">selected: {filename}</p>}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {rows.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm">
              Parsed <b>{rows.length}</b> connections across <b>{companyCount}</b> companies.
              {warnings.length > 0 && <span className="ml-2 text-yellow-600">{warnings.length} warnings.</span>}
            </p>
            <div className="max-h-64 overflow-auto rounded border text-xs">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Company</th>
                    <th className="p-2 text-left">Position</th>
                    <th className="p-2 text-left">Connected</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.firstName} {r.lastName}</td>
                      <td className="p-2">{r.company}</td>
                      <td className="p-2">{r.position}</td>
                      <td className="p-2">{r.connectedOnIso ?? r.connectedOn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRows([]);
                  setFilename(null);
                  setWarnings([]);
                }}
              >
                Clear
              </Button>
              <Button
                onClick={() => {
                  // TODO(monday): wire to electronMainSdk.importConnections({ rows }).
                  // eslint-disable-next-line no-console
                  console.info('[connections] import (stub)', { count: rows.length });
                }}
              >
                Import
              </Button>
            </div>
          </div>
        )}
      </div>
    </DefaultLayout>
  );
}

// LinkedIn connections import. CSV parsing runs in the renderer, Save upserts into the
// per-user `connections` table (re-importing updates people, it never deletes anyone).

import { Button, Label } from '@first2apply/ui';
import { companyKey } from '@first2apply/core';
import { useMemo, useState } from 'react';

import { saveConnections, type SaveConnectionsResult } from '@/lib/electronMainSdk';
import { parseConnectionsCsv, type Connection } from '@/server/connections/csv';

import { DefaultLayout } from './defaultLayout';

export function ConnectionsPage() {
  const [filename, setFilename] = useState<string | null>(null);
  const [rows, setRows] = useState<Connection[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SaveConnectionsResult | null>(null);

  const onFile = async (f: File) => {
    setError(null);
    setWarnings([]);
    setRows([]);
    setResult(null);
    setFilename(f.name);
    try {
      const { connections, warnings } = parseConnectionsCsv(await f.text());
      setRows(connections);
      setWarnings(warnings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      setResult(
        await saveConnections(
          rows.map((r) => ({
            firstName: r.firstName,
            lastName: r.lastName,
            url: r.url,
            company: r.company,
            position: r.position,
            connectedOnIso: r.connectedOnIso,
          })),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const companyCount = useMemo(() => new Set(rows.map((r) => companyKey(r.company)).filter(Boolean)).size, [rows]);

  return (
    <DefaultLayout className="space-y-4 p-6 md:p-10">
      <h1 className="text-2xl font-medium tracking-wide">LinkedIn connections</h1>
      <p className="text-sm font-light">
        Export your LinkedIn connections as CSV (Settings, Data privacy, Get a copy of your data, Connections), then
        upload it here and press Save. Jobs at companies where you know someone get a contacts badge. Email addresses
        are never stored.
      </p>

      <div className="space-y-4 rounded-lg border p-6">
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
          <div className="space-y-3">
            <p className="text-sm">
              Parsed <b>{rows.length}</b> connections across <b>{companyCount}</b> companies.
              {warnings.length > 0 && <span className="ml-2 text-yellow-600">{warnings.length} warnings.</span>}
            </p>
            <Button onClick={() => void onSave()} disabled={saving} data-testid="save-connections">
              {saving ? 'Saving...' : 'Save connections'}
            </Button>
            {result && (
              <p className="text-sm" data-testid="save-result">
                Saved {result.saved}: {result.created} new, {result.updated} updated
                {result.skippedNoUrl > 0 && `, ${result.skippedNoUrl} skipped (no profile URL)`}.
              </p>
            )}
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
                      <td className="p-2">
                        {r.firstName} {r.lastName}
                      </td>
                      <td className="p-2">{r.company}</td>
                      <td className="p-2">{r.position}</td>
                      <td className="p-2">{r.connectedOnIso ?? r.connectedOn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 100 && <p className="text-xs font-light">Showing the first 100 of {rows.length}.</p>}
          </div>
        )}
      </div>
    </DefaultLayout>
  );
}

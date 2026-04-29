// Item 9 — Master Content page (account-level).
// Allows pasting JSON for now (PDF/DOCX parser is Monday work).

import { Button } from '@first2apply/ui';
import { Label } from '@first2apply/ui';
import { useEffect, useState } from 'react';

import { upsertMasterContent, getMasterContent } from '../lib/electronMainSdk';
import { DefaultLayout } from './defaultLayout';

type Section = 'resume' | 'cover_letter';

export function MasterContentPage() {
  const [tab, setTab] = useState<Section>('resume');
  const [resumeJson, setResumeJson] = useState('{\n  "version": 1\n}');
  const [coverJson, setCoverJson] = useState('{\n  "version": 1\n}');
  const [filename, setFilename] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [resume, cover] = await Promise.all([
          getMasterContent({ kind: 'resume' }),
          getMasterContent({ kind: 'cover_letter' }),
        ]);
        if (resume?.content_jsonb) setResumeJson(JSON.stringify(resume.content_jsonb, null, 2));
        if (cover?.content_jsonb) setCoverJson(JSON.stringify(cover.content_jsonb, null, 2));
      } catch (e) {
        setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, []);

  const onFile = async (f: File) => {
    setStatus(null);
    setFilename(f.name);
    if (f.name.endsWith('.json')) {
      const text = await f.text();
      if (tab === 'resume') setResumeJson(text);
      else setCoverJson(text);
      return;
    }
    // PDF/DOCX parser is a Monday item; surface clearly.
    setStatus({
      kind: 'err',
      msg: 'PDF/DOCX parsing is not yet wired. Paste JSON, or upload a .json file (see tests/fixtures/master-content for shape).',
    });
  };

  const onSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const raw = tab === 'resume' ? resumeJson : coverJson;
      const parsed = JSON.parse(raw);
      if (parsed.version !== 1) throw new Error('JSON must include "version": 1');
      await upsertMasterContent({ kind: tab, content: parsed, filename });
      setStatus({ kind: 'ok', msg: 'Saved.' });
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const value = tab === 'resume' ? resumeJson : coverJson;
  const setValue = tab === 'resume' ? setResumeJson : setCoverJson;

  return (
    <DefaultLayout className="space-y-4 p-6 md:p-10">
      <h1 className="text-2xl font-medium tracking-wide">Master content</h1>
      <p className="text-sm font-light">
        One master resume and one master cover letter per account. Tailored versions for each job
        are generated from these.
      </p>

      <div className="flex gap-2">
        <Button variant={tab === 'resume' ? 'default' : 'outline'} onClick={() => setTab('resume')}>
          Resume
        </Button>
        <Button
          variant={tab === 'cover_letter' ? 'default' : 'outline'}
          onClick={() => setTab('cover_letter')}
        >
          Cover letter
        </Button>
      </div>

      <div className="rounded-lg border p-6 space-y-4">
        <div className="space-y-1">
          <Label htmlFor="mc-file">Upload (.json supported now; .pdf/.docx Monday)</Label>
          <input
            id="mc-file"
            type="file"
            accept=".json,application/json,.pdf,.docx"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          {filename && <p className="text-xs font-light">selected: {filename}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="mc-json">Content (JSON)</Label>
          <textarea
            id="mc-json"
            className="h-64 w-full rounded-md border bg-background p-2 font-mono text-xs"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>

        {status && (
          <p className={status.kind === 'ok' ? 'text-sm text-green-600' : 'text-sm text-red-600'}>
            {status.msg}
          </p>
        )}

        <div className="flex justify-end">
          <Button onClick={onSave} disabled={saving} aria-label="Save master content">
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </DefaultLayout>
  );
}

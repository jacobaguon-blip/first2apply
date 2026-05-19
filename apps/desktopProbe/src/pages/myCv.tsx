import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Button } from '@first2apply/ui';
import { Label } from '@first2apply/ui';

import { useCareerOps } from '../hooks/careerOps';
import { useError } from '../hooks/error';
import { getMasterCv, parseCv, saveMasterCv } from '../lib/electronMainSdk';
import { DefaultLayout } from './defaultLayout';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export function MyCvPage() {
  const { enabled, loading: flagLoading } = useCareerOps();
  const { handleError } = useError();

  const [markdown, setMarkdown] = useState('');
  const [filename, setFilename] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const row = await getMasterCv();
        if (row) {
          setMarkdown(row.markdown ?? '');
          setFilename(row.source_filename ?? null);
        }
      } catch (e) {
        handleError({ error: e, title: 'Failed to load master CV' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onPickFile = async (f: File) => {
    setParsing(true);
    setStatus(null);
    try {
      const contentBase64 = await fileToBase64(f);
      const res = await parseCv({ filename: f.name, mimetype: f.type, contentBase64 });
      if (res?.markdown) {
        setMarkdown(res.markdown);
        setFilename(res.source_filename ?? f.name);
        setStatus({
          kind: 'ok',
          msg: res.warning ? `Parsed with warning: ${res.warning}` : 'Parsed and saved.',
        });
      } else {
        setStatus({ kind: 'err', msg: 'Parser returned no markdown.' });
      }
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setParsing(false);
    }
  };

  const onSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await saveMasterCv({ markdown, source_filename: filename });
      setStatus({ kind: 'ok', msg: 'Saved.' });
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  if (flagLoading) return <DefaultLayout className="p-6">Loading…</DefaultLayout>;
  if (!enabled) {
    return (
      <DefaultLayout className="p-6">
        <p className="text-sm">Career Ops is disabled. Enable it in Settings → Experimental features.</p>
      </DefaultLayout>
    );
  }

  return (
    <DefaultLayout className="space-y-4 p-6 md:p-10">
      <h1 className="text-2xl font-medium tracking-wide">My CV</h1>
      <p className="text-sm font-light">
        Drop a PDF or DOCX to extract a markdown master CV. Edit below, then save.
      </p>

      <div className="rounded-lg border p-4 space-y-2">
        <Label htmlFor="cv-file">Upload resume (PDF, DOCX, MD, TXT)</Label>
        <input
          id="cv-file"
          type="file"
          accept=".pdf,.docx,.md,.txt"
          disabled={parsing}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer?.files?.[0];
            if (f) onPickFile(f);
          }}
          onDragOver={(e) => e.preventDefault()}
        />
        {filename && <p className="text-xs text-muted-foreground">Source file: {filename}</p>}
        {parsing && <p className="text-xs">Parsing…</p>}
      </div>

      {status && (
        <p className={`text-sm ${status.kind === 'ok' ? 'text-green-600' : 'text-destructive'}`}>
          {status.msg}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Markdown</Label>
          <textarea
            className="font-mono w-full h-[60vh] rounded-md border p-3 text-sm"
            value={markdown}
            disabled={loading}
            onChange={(e) => setMarkdown(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="space-y-1">
          <Label>Preview</Label>
          <div className="prose prose-sm dark:prose-invert max-w-none h-[60vh] overflow-auto rounded-md border p-3">
            <Markdown remarkPlugins={[remarkGfm]}>{markdown || '_(empty)_'}</Markdown>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving || !markdown.trim()}>
          {saving ? 'Saving…' : 'Save master CV'}
        </Button>
      </div>
    </DefaultLayout>
  );
}

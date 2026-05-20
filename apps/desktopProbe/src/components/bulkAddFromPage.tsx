import { useState } from 'react';

import { useError } from '@/hooks/error';
import {
  bulkEnqueuePending,
  bulkScanPage,
  type BulkCandidate,
} from '@/lib/electronMainSdk';
import { getExceptionMessage } from '@first2apply/core';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  useToast,
} from '@first2apply/ui';

import { Icons } from './icons';

/**
 * "Bulk Add Targets from Page" — paste a sponsor/exhibitor URL, fetch the
 * page, surface every external company link as a checklist, and queue the
 * selected ones into pending_links. The drainer's 2-hop discovery then finds
 * each company's careers page and creates a daily Target.
 */
export function BulkAddFromPage() {
  const { handleError } = useError();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [enqueuing, setEnqueuing] = useState(false);
  const [candidates, setCandidates] = useState<BulkCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reset = () => {
    setUrl('');
    setCandidates([]);
    setSelected(new Set());
    setErrorMessage(null);
  };

  const onOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) reset();
  };

  const onScan = async () => {
    setScanning(true);
    setErrorMessage(null);
    setCandidates([]);
    setSelected(new Set());
    try {
      const res = await bulkScanPage(url);
      setCandidates(res.candidates);
      // Pre-select all by default.
      setSelected(new Set(res.candidates.map((c) => c.url)));
      if (res.candidates.length === 0) {
        setErrorMessage('No external company links found on that page.');
      }
    } catch (e) {
      setErrorMessage(getExceptionMessage(e, true));
    } finally {
      setScanning(false);
    }
  };

  const toggle = (u: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(u)) next.delete(u);
      else next.add(u);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === candidates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(candidates.map((c) => c.url)));
    }
  };

  const onEnqueue = async () => {
    if (selected.size === 0) return;
    setEnqueuing(true);
    setErrorMessage(null);
    try {
      const res = await bulkEnqueuePending([...selected]);
      toast({
        title: 'Queued for discovery',
        description: `${res.inserted} new target${res.inserted === 1 ? '' : 's'} queued${
          res.deduped ? ` (${res.deduped} skipped as duplicates)` : ''
        }. The drainer will find each company's careers page automatically.`,
      });
      onOpenChange(false);
    } catch (e) {
      handleError({ error: e, title: 'Could not queue targets' });
    } finally {
      setEnqueuing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="px-10 text-base">
          Bulk Add from Page
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[90vw] overflow-hidden p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-medium tracking-wide">Bulk add targets from page</DialogTitle>
          <DialogDescription>
            Paste a sponsor, exhibitor, or partners page. We'll pull every external company link and let you pick which
            ones to queue. Each selected company will be auto-discovered into a daily Target via its careers page.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex gap-2">
          <Input
            type="url"
            placeholder="https://example.com/sponsors"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={scanning || enqueuing}
          />
          <Button onClick={onScan} disabled={!url.trim() || scanning || enqueuing}>
            {scanning ? (
              <>
                <Icons.spinner2 className="mr-2 h-4 w-4 animate-spin" />
                Scanning…
              </>
            ) : (
              'Scan page'
            )}
          </Button>
        </div>

        {errorMessage && <p className="mt-3 text-sm text-destructive">{errorMessage}</p>}

        {candidates.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 overflow-hidden">
            <div className="flex items-center justify-between">
              <p className="text-sm">
                Found <span className="font-medium">{candidates.length}</span> external companies.{' '}
                <span className="text-muted-foreground">{selected.size} selected.</span>
              </p>
              <Button size="sm" variant="ghost" onClick={toggleAll}>
                {selected.size === candidates.length ? 'Deselect all' : 'Select all'}
              </Button>
            </div>

            <ul className="max-h-[45vh] divide-y overflow-y-auto rounded-md border">
              {candidates.map((c) => (
                <li key={c.url} className="flex items-start gap-2 p-2 hover:bg-muted/50">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={selected.has(c.url)}
                    onChange={() => toggle(c.url)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.host}</div>
                    {c.text && <div className="truncate text-xs text-muted-foreground">{c.text}</div>}
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enqueuing}>
                Cancel
              </Button>
              <Button onClick={onEnqueue} disabled={selected.size === 0 || enqueuing}>
                {enqueuing ? (
                  <>
                    <Icons.spinner2 className="mr-2 h-4 w-4 animate-spin" />
                    Queuing…
                  </>
                ) : (
                  `Queue ${selected.size} target${selected.size === 1 ? '' : 's'}`
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

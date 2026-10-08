import {
  DEFAULT_FOLLOW_UP_DAYS,
  JobContact,
  REFERRAL_STATUSES,
  ReferralStatus,
  nextOutreachFields,
} from '@first2apply/core';
import { Button } from '@first2apply/ui';
import { useEffect, useRef, useState } from 'react';

import { draftReferral, getJobContacts, openExternalUrl, updateReferralOutreach } from '@/lib/electronMainSdk';
import { dateInputToIso, isoToDateInput } from '@/lib/referralDates';

export function ContactBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      data-testid="contact-badge"
      className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
    >
      {count} {count === 1 ? 'contact' : 'contacts'}
    </span>
  );
}

function connectedFor(connectedOn: string | null): string {
  if (!connectedOn) return '';
  const months = Math.floor((Date.now() - new Date(connectedOn).getTime()) / (30 * 24 * 60 * 60 * 1000));
  if (months < 1) return 'connected this month';
  if (months < 24) return `connected ${months} months ago`;
  return `connected ${Math.floor(months / 12)} years ago`;
}

export function JobContactsPanel({ jobId }: { jobId: number }) {
  const [contacts, setContacts] = useState<JobContact[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setContacts(null);
    getJobContacts(jobId)
      .then((r) => !cancelled && setContacts(r.contacts))
      .catch((): void => undefined);
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (!contacts || contacts.length === 0) return null;

  return (
    <section data-testid="job-contacts" className="space-y-3 rounded-lg border p-4">
      <h3 className="text-lg font-medium">People you know here</h3>
      <ul className="space-y-3">
        {contacts.map((c) => (
          <ContactRow key={c.connection_id} jobId={jobId} contact={c} />
        ))}
      </ul>
    </section>
  );
}

function ContactRow({ jobId, contact }: { jobId: number; contact: JobContact }) {
  const [status, setStatus] = useState<ReferralStatus | ''>(contact.outreach_status ?? '');
  const [followUpAt, setFollowUpAt] = useState<string | null>(contact.follow_up_at);
  const [askedAt, setAskedAt] = useState<string | null>(contact.asked_at);
  const [draft, setDraft] = useState<string>(contact.outreach_draft ?? '');
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Guards against state updates after the row unmounts mid-request.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const canOpenProfile = contact.linkedin_url.startsWith('https://');

  const onDraft = async () => {
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await draftReferral(jobId, contact.connection_id);
      if (!mounted.current) return;
      if (res.outreach?.draft == null) throw new Error('No draft was returned');
      setDraft(res.outreach.draft);
      setCopied(false);
      setStatus((prev) => prev || (res.outreach?.status as ReferralStatus) || 'drafted');
    } catch (e) {
      if (mounted.current) setDraftError(e instanceof Error ? e.message : 'Drafting failed');
    } finally {
      if (mounted.current) setDrafting(false);
    }
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      if (mounted.current) setCopied(true);
    } catch {
      if (mounted.current) setSaveError('Could not copy to the clipboard');
    }
  };

  const onSaveEdits = async () => {
    setSaveError(null);
    try {
      await updateReferralOutreach(jobId, contact.connection_id, { draft });
    } catch (e) {
      if (mounted.current) setSaveError(e instanceof Error ? e.message : 'Saving failed');
    }
  };

  const onStatus = async (next: ReferralStatus) => {
    const prevStatus = status;
    setSaveError(null);
    setStatus(next);
    const patch = nextOutreachFields(next, new Date(), DEFAULT_FOLLOW_UP_DAYS, {
      asked_at: askedAt,
      follow_up_at: followUpAt,
    });
    try {
      await updateReferralOutreach(jobId, contact.connection_id, patch);
      if (!mounted.current) return;
      if (patch.asked_at !== undefined) setAskedAt(patch.asked_at);
      if (patch.follow_up_at !== undefined) setFollowUpAt(patch.follow_up_at);
    } catch (e) {
      if (!mounted.current) return;
      setStatus(prevStatus);
      setSaveError(e instanceof Error ? e.message : 'Saving the status failed');
    }
  };

  const onFollowUp = async (value: string) => {
    const iso = dateInputToIso(value);
    if (!iso) return;
    const prev = followUpAt;
    setSaveError(null);
    setFollowUpAt(iso);
    try {
      await updateReferralOutreach(jobId, contact.connection_id, { follow_up_at: iso });
    } catch (e) {
      if (!mounted.current) return;
      setFollowUpAt(prev);
      setSaveError(e instanceof Error ? e.message : 'Saving the follow-up date failed');
    }
  };

  return (
    <li data-testid="job-contact" className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <b>
            {contact.first_name} {contact.last_name}
          </b>
          <span className="ml-2 font-light">{contact.position_title}</span>
          <span className="ml-2 text-xs font-light">{connectedFor(contact.connected_on)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!canOpenProfile}
            onClick={() => {
              if (canOpenProfile) void openExternalUrl(contact.linkedin_url);
            }}
          >
            Open LinkedIn profile
          </Button>
          <select
            aria-label={`Outreach status for ${contact.first_name}`}
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={status}
            onChange={(e) => void onStatus(e.target.value as ReferralStatus)}
          >
            <option value="" disabled>
              Not contacted
            </option>
            {REFERRAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
          {status === 'asked' && (
            <input
              type="date"
              aria-label="Follow-up date"
              className="h-8 rounded-md border bg-background px-2 text-xs"
              value={isoToDateInput(followUpAt)}
              onChange={(e) => void onFollowUp(e.target.value)}
            />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={drafting} onClick={() => void onDraft()}>
            {draft ? 'Redraft message' : 'Draft message'}
          </Button>
          {drafting && <span className="text-xs font-light">Drafting, this can take a minute on the local model</span>}
        </div>
        {draftError && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <span>{draftError}</span>
            <Button size="sm" variant="outline" disabled={drafting} onClick={() => void onDraft()}>
              Retry
            </Button>
          </div>
        )}
        {draft && (
          <div className="space-y-2">
            <textarea
              data-testid="referral-draft"
              className="min-h-[140px] w-full rounded-md border bg-background p-2 text-sm"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setCopied(false);
              }}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => void onCopy()}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void onSaveEdits()}>
                Save edits
              </Button>
            </div>
          </div>
        )}
        {saveError && <div className="text-xs text-destructive">{saveError}</div>}
      </div>
    </li>
  );
}

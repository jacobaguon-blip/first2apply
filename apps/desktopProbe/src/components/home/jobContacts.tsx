import { JobContact, REFERRAL_STATUSES, ReferralStatus, nextOutreachFields } from '@first2apply/core';
import { Button } from '@first2apply/ui';
import { useEffect, useState } from 'react';

import { getJobContacts } from '@/lib/electronMainSdk';

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

  const onStatus = async (next: ReferralStatus) => {
    setStatus(next);
    // Persisted in Task 11 through updateReferralOutreach; the patch rules live in core.
    void nextOutreachFields(next);
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
            onClick={() => window.open(contact.linkedin_url, '_blank', 'noopener')}
          >
            Open LinkedIn profile
          </Button>
          <select
            aria-label={`Outreach status for ${contact.first_name}`}
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={status}
            disabled
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
        </div>
      </div>
    </li>
  );
}

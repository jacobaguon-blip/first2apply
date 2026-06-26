import { LOCATION_BUCKETS, LocationBucket } from '@first2apply/core';
import { Badge, Button, Input } from '@first2apply/ui';
import { X } from 'lucide-react';
import { useState } from 'react';

type Props = {
  buckets: LocationBucket[] | null;
  contains: string[] | null;
  onChange: (patch: {
    location_buckets?: LocationBucket[] | null;
    location_contains?: string[] | null;
  }) => void;
};

const BUCKET_LABELS: Record<LocationBucket, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
  unspecified: 'Unspecified',
};

export function LocationPreferences({ buckets, contains, onChange }: Props) {
  const [draft, setDraft] = useState('');
  const safeBuckets = buckets ?? [];
  const safeContains = contains ?? [];

  const toggleBucket = (b: LocationBucket) => {
    const next = safeBuckets.includes(b) ? safeBuckets.filter((x) => x !== b) : [...safeBuckets, b];
    onChange({ location_buckets: next.length > 0 ? next : null });
  };

  const addChip = () => {
    const v = draft.trim();
    if (!v) {
      setDraft('');
      return;
    }
    if (safeContains.some((c) => c.toLowerCase() === v.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange({ location_contains: [...safeContains, v] });
    setDraft('');
  };

  const removeChip = (v: string) => {
    const next = safeContains.filter((x) => x !== v);
    onChange({ location_contains: next.length > 0 ? next : null });
  };

  return (
    <section className="space-y-3">
      <div>
        <label className="mb-1.5 block text-sm font-medium">Location preferences</label>
        <p className="mb-3 text-sm text-muted-foreground">
          Jobs that don't match get moved to Filtered out during scans.
        </p>
      </div>

      <div>
        <div className="mb-1.5 text-sm font-medium">Work arrangement</div>
        <div className="flex flex-wrap gap-2">
          {LOCATION_BUCKETS.map((b) => {
            const active = safeBuckets.includes(b);
            return (
              <Button
                key={b}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                onClick={() => toggleBucket(b)}
                className="h-7 px-3 text-xs"
              >
                {BUCKET_LABELS[b]}
              </Button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">Leave all unselected to allow any work arrangement.</p>
      </div>

      <div>
        <div className="mb-1.5 text-sm font-medium">Location contains (any of)</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {safeContains.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1">
              {v}
              <button
                type="button"
                onClick={() => removeChip(v)}
                aria-label={`Remove ${v}`}
                className="ml-1 inline-flex"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addChip();
              }
            }}
            onBlur={addChip}
            placeholder="Type and press Enter (e.g. United States)"
            className="h-8 w-56 text-sm"
          />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Case-insensitive substring match. Leave empty for no constraint.
        </p>
      </div>
    </section>
  );
}

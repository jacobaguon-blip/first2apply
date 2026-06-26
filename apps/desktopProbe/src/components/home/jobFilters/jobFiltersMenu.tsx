import { FilterIcon } from 'lucide-react';
import { useState } from 'react';

import { LABEL_COLOR_CLASSES } from '@/lib/labels';
import { JOB_LABELS, LOCATION_BUCKETS, LocationBucket } from '@first2apply/core';
import { useSites } from '@first2apply/ui';
import { useLinks } from '@first2apply/ui';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@first2apply/ui';

export type JobFiltersType = {
  sites: number[];
  links: number[];
  labels: string[];
  locationBuckets: LocationBucket[];
  locationContains: string;
};

const ALL_LABELS = Object.values(JOB_LABELS);

/**
 * Job filters menu component.
 */
export function JobFiltersMenu({
  selectedSites,
  selectedLinks,
  selectedLabels,
  selectedLocationBuckets,
  selectedLocationContains,
  onApplyFilters,
}: {
  selectedSites: number[];
  selectedLinks: number[];
  selectedLabels: string[];
  selectedLocationBuckets: LocationBucket[];
  selectedLocationContains: string;
  onApplyFilters: (filters: JobFiltersType) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const { siteLogos, sites } = useSites();
  const { links } = useLinks();

  // Sort sites alphabetically and filter out sites that don't have any links
  const sortedSites = sites
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((site) => links.some((link) => link.site_id === site.id));

  const applyPatch = (patch: Partial<JobFiltersType>) =>
    onApplyFilters({
      sites: selectedSites,
      links: selectedLinks,
      labels: selectedLabels,
      locationBuckets: selectedLocationBuckets,
      locationContains: selectedLocationContains,
      ...patch,
    });

  const onSelectSite = (siteId: number) => {
    const next = selectedSites.includes(siteId)
      ? selectedSites.filter((id) => id !== siteId)
      : [...selectedSites, siteId];
    applyPatch({ sites: next });
  };

  const onSelectLink = (linkId: number) => {
    const next = selectedLinks.includes(linkId)
      ? selectedLinks.filter((id) => id !== linkId)
      : [...selectedLinks, linkId];
    applyPatch({ links: next });
  };

  const onSelectLabel = (label: string) => {
    const next = selectedLabels.includes(label)
      ? selectedLabels.filter((l) => l !== label)
      : [...selectedLabels, label];
    applyPatch({ labels: next });
  };

  const clearSites = () => applyPatch({ sites: [] });
  const clearLinks = () => applyPatch({ links: [] });
  const clearLabels = () => applyPatch({ labels: [] });
  const clearAll = () =>
    applyPatch({ sites: [], links: [], labels: [], locationBuckets: [], locationContains: '' });

  const activeFilterCount =
    selectedSites.length +
    selectedLinks.length +
    selectedLabels.length +
    selectedLocationBuckets.length +
    (selectedLocationContains.trim() ? 1 : 0);

  return (
    <DropdownMenu open={isOpen} onOpenChange={(opened) => setIsOpen(opened)}>
      <DropdownMenuTrigger
        className={`relative flex h-12 w-12 items-center justify-center rounded-md bg-transparent transition-colors duration-200 ease-in-out hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-0 ${isOpen && 'bg-foreground/10'}`}
        onClick={(evt) => {
          evt.preventDefault();
          evt.stopPropagation();
        }}
      >
        <FilterIcon className="h-auto w-6 text-foreground/90" />
        {activeFilterCount > 0 && (
          <div className="absolute bottom-1.5 right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-foreground p-0 text-[10px] text-background dark:font-bold">
            {activeFilterCount}
          </div>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-56" side="right" sideOffset={8} align="start">
        {/* Job Boards */}
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Job Boards</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent sideOffset={8} alignOffset={-5}>
                {sortedSites.map((site) => (
                  <DropdownMenuCheckboxItem
                    key={site.id}
                    checked={selectedSites.includes(site.id)}
                    onSelect={(evt) => {
                      evt.preventDefault();
                      onSelectSite(site.id);
                    }}
                    className="pr-8"
                  >
                    <img src={siteLogos[site.id]} alt={site.name} className="mr-2 h-4 w-4 rounded-full" />
                    <p>{site.name}</p>
                  </DropdownMenuCheckboxItem>
                ))}

                <DropdownMenuSeparator />
                {/* Reset filter button */}
                <DropdownMenuItem
                  onSelect={(evt) => {
                    evt.preventDefault();
                    clearSites();
                  }}
                  disabled={selectedSites.length === 0}
                  className="px-8 text-destructive"
                >
                  Reset Board Selection
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        {/* Links */}
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Searches</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent sideOffset={8} alignOffset={-37}>
                {links.map((link) => (
                  <DropdownMenuCheckboxItem
                    key={link.id}
                    checked={selectedLinks.includes(link.id)}
                    onSelect={(evt) => {
                      evt.preventDefault();
                      onSelectLink(link.id);
                    }}
                    className="pr-8"
                  >
                    <img src={siteLogos[link.site_id]} alt={link.title} className="mr-2 h-4 w-4 rounded-full" />
                    <p>{link.title}</p>
                  </DropdownMenuCheckboxItem>
                ))}

                <DropdownMenuSeparator />
                {/* Reset filter button */}
                <DropdownMenuItem
                  onSelect={(evt) => {
                    evt.preventDefault();
                    clearLinks();
                  }}
                  disabled={selectedLinks.length === 0}
                  className="px-8 text-destructive"
                >
                  Reset Search Selection
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        {/* Labels */}
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Labels</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent sideOffset={8} alignOffset={-37}>
                {ALL_LABELS.map((label) => {
                  const colorClass = LABEL_COLOR_CLASSES[label];

                  return (
                    <DropdownMenuCheckboxItem
                      key={label}
                      checked={selectedLabels.includes(label)}
                      onSelect={(evt) => {
                        evt.preventDefault();
                        onSelectLabel(label);
                      }}
                      className="pr-8"
                    >
                      <div className={`h-4 w-4 rounded-full ${colorClass}`}></div>
                      <p className="ml-2">{label}</p>
                    </DropdownMenuCheckboxItem>
                  );
                })}

                <DropdownMenuSeparator />
                {/* Reset filter button */}
                <DropdownMenuItem
                  onSelect={(evt) => {
                    evt.preventDefault();
                    clearLabels();
                  }}
                  disabled={selectedLabels.length === 0}
                  className="px-8 text-destructive"
                >
                  Reset Labels
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        {/* Location */}
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Location</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent sideOffset={8} alignOffset={-69}>
                {LOCATION_BUCKETS.map((bucket) => (
                  <DropdownMenuCheckboxItem
                    key={bucket}
                    checked={selectedLocationBuckets.includes(bucket)}
                    onSelect={(evt) => {
                      evt.preventDefault();
                      const next = selectedLocationBuckets.includes(bucket)
                        ? selectedLocationBuckets.filter((b) => b !== bucket)
                        : [...selectedLocationBuckets, bucket];
                      applyPatch({ locationBuckets: next });
                    }}
                    className="pr-8"
                  >
                    <p>{bucket[0].toUpperCase() + bucket.slice(1)}</p>
                  </DropdownMenuCheckboxItem>
                ))}

                <DropdownMenuSeparator />
                <div className="px-2 py-1">
                  <label className="text-[11px] text-muted-foreground">Location contains</label>
                  <input
                    type="text"
                    value={selectedLocationContains}
                    placeholder="e.g. Philippines"
                    onChange={(evt) => applyPatch({ locationContains: evt.target.value })}
                    onKeyDown={(evt) => evt.stopPropagation()}
                    className="mt-1 h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(evt) => {
                    evt.preventDefault();
                    applyPatch({ locationBuckets: [], locationContains: '' });
                  }}
                  disabled={selectedLocationBuckets.length === 0 && selectedLocationContains === ''}
                  className="px-8 text-destructive"
                >
                  Reset Location
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Reset all filters button */}
        <DropdownMenuItem
          onSelect={() => {
            clearAll();
          }}
          disabled={
            selectedSites.length === 0 &&
            selectedLinks.length === 0 &&
            selectedLabels.length === 0 &&
            selectedLocationBuckets.length === 0 &&
            selectedLocationContains === ''
          }
          className="text-destructive"
        >
          Remove Filters
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

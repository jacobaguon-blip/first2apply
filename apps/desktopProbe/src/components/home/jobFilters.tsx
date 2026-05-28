import { useCallback, useEffect, useRef, useState } from 'react';

import { LocationBucket } from '@first2apply/core';
import { debounce } from 'lodash';

import { JobFiltersMenu, JobFiltersType } from './jobFilters/jobFiltersMenu';
import { SearchBox } from './jobFilters/searchBox';

/**
 * Job filters component.
 */
export function JobFilters({
  search,
  siteIds,
  linkIds,
  labels,
  locationBuckets,
  locationContains,
  onSearchJobs,
}: {
  search: string;
  siteIds: number[];
  linkIds: number[];
  labels: string[];
  locationBuckets?: string[];
  locationContains?: string;
  onSearchJobs: (_: { search: string; filters: JobFiltersType }) => void;
}) {
  const [inputValue, setInputValue] = useState(search);
  const [filters, setFilters] = useState<JobFiltersType>({
    sites: [],
    links: [],
    labels: [],
    locationBuckets: (locationBuckets as LocationBucket[]) ?? [],
    locationContains: locationContains ?? '',
  });

  // Debounced search for input value
  const emitDebouncedSearch = useCallback(
    debounce((value: string, currentFilters: JobFiltersType) => {
      onSearchJobs({ search: value, filters: currentFilters });
    }, 350),
    [filters],
  );

  // Emit search on inputValue change, debounced
  useDidMountEffect(() => {
    emitDebouncedSearch(inputValue, filters);
  }, [inputValue, filters, emitDebouncedSearch]);

  // Emit filter changes immediately without debounce
  useDidMountEffect(() => {
    onSearchJobs({ search: inputValue, filters: filters });
  }, [filters]);

  return (
    <div className="flex items-center justify-center gap-2 pr-2">
      <SearchBox inputValue={inputValue} setInputValue={setInputValue} />

      <JobFiltersMenu
        selectedSites={siteIds || []}
        selectedLinks={linkIds || []}
        selectedLabels={labels || []}
        selectedLocationBuckets={filters.locationBuckets}
        selectedLocationContains={filters.locationContains}
        onApplyFilters={(newFilters) => {
          setFilters(newFilters);
        }}
      />
    </div>
  );
}

const useDidMountEffect = (effect: React.EffectCallback, deps?: React.DependencyList) => {
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false; // Mark as not the first render
      return; // Skip the first effect execution
    }

    // Run the effect for subsequent renders
    effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
};

export type SourceGroup = { site: string; search: string; count: number };

export function aggregateBySource(jobs: Array<{ siteName: string; searchTitle: string }>): SourceGroup[] {
  const m = new Map<string, SourceGroup>();
  for (const j of jobs) {
    const k = `${j.siteName}::${j.searchTitle}`;
    const existing = m.get(k);
    if (existing) existing.count += 1;
    else m.set(k, { site: j.siteName, search: j.searchTitle, count: 1 });
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

export function formatSummaryBody(groups: SourceGroup[]): string {
  return groups.map(g => `${g.count} from ${g.site} – "${g.search}"`).join('\n');
}

export function formatSummaryTitle(total: number): string {
  return `${total} new job${total === 1 ? '' : 's'} while you were away`;
}

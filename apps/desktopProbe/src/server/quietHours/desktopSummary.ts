import { aggregateBySource, SourceGroup } from './aggregate';

type JobRow = { siteName: string; searchTitle: string };
type Deps = {
  notify: (total: number, groups: SourceGroup[]) => void | Promise<void>;
  loadJobsBetween: (start: Date, end: Date) => Promise<JobRow[]>;
};

export class DesktopSummaryTracker {
  private wasInside = false;
  private lastWindowStart: Date | null = null;
  constructor(private deps: Deps) {}

  async tick(state: { isInside: boolean; windowStart: Date | null; now: Date }): Promise<void> {
    if (this.wasInside && !state.isInside && this.lastWindowStart) {
      const jobs = await this.deps.loadJobsBetween(this.lastWindowStart, state.now);
      if (jobs.length > 0) {
        await this.deps.notify(jobs.length, aggregateBySource(jobs));
      }
    }
    this.wasInside = state.isInside;
    if (state.isInside) this.lastWindowStart = state.windowStart;
  }
}

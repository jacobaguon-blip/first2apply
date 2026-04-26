// In-memory ApprovalDb implementation (used by tests + scaffold).
// Real Supabase-backed adapter is wired Monday once the Next.js install lands.
// Spec: spec.md §9.2 — jti replay protection + state machine flip.

import type { ApprovalDb } from '../app/api/approve/[token]/route';

export class InMemoryApprovalDb implements ApprovalDb {
  private consumed = new Map<string, Date>();
  private states  = new Map<string, 'approved' | 'rejected'>();

  async isJtiConsumed(jti: string): Promise<boolean> {
    return this.consumed.has(jti);
  }
  async consumeJti(jti: string, expiresAt: Date): Promise<void> {
    this.consumed.set(jti, expiresAt);
  }
  async setJobApprovalState(jobId: string, state: 'approved' | 'rejected'): Promise<void> {
    this.states.set(jobId, state);
  }

  // test helpers
  _getState(jobId: string) {
    return this.states.get(jobId) ?? null;
  }
  _consumedSize() {
    return this.consumed.size;
  }
}

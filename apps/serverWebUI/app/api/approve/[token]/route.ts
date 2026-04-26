// Item 11 — approval endpoint. HMAC-verified token; jti replay protection.
// Stateful jti table is handled by the Postgres migration (20260425120000_*).
// This file is the route handler shape; real Next.js install is a Monday item
// so we export plain TypeScript that matches Next 15 App Router signature.

import { ApprovalTokenError, verifyApprovalToken } from '../../../../lib/approval-token';

type RouteHandler = (
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) => Promise<Response>;

export type ApprovalDb = {
  isJtiConsumed(jti: string): Promise<boolean>;
  consumeJti(jti: string, expiresAt: Date): Promise<void>;
  setJobApprovalState(jobId: string, state: 'approved' | 'rejected'): Promise<void>;
};

export function makeApprovalRoute(opts: { db: ApprovalDb; secret: string }): RouteHandler {
  return async (_req, { params }) => {
    const { token } = await params;
    try {
      const payload = verifyApprovalToken(token, opts.secret);
      if (await opts.db.isJtiConsumed(payload.jti)) {
        return new Response(JSON.stringify({ ok: false, error: 'already_used' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        });
      }
      await opts.db.consumeJti(payload.jti, new Date(payload.exp * 1000));
      await opts.db.setJobApprovalState(
        payload.job_id,
        payload.action === 'approve' ? 'approved' : 'rejected',
      );
      return new Response(
        JSON.stringify({ ok: true, action: payload.action, job_id: payload.job_id }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    } catch (e) {
      if (e instanceof ApprovalTokenError) {
        return new Response(JSON.stringify({ ok: false, error: e.code }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: false, error: 'internal' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
  };
}

// Next.js App Router would import a default GET. We don't have Next installed in
// the scaffold, so we expose only the factory above. The Monday wiring file
// will read APPROVAL_HMAC_SECRET from env, build a Postgres-backed ApprovalDb,
// and `export const GET = makeApprovalRoute({ db, secret });`.

// Approval-token HMAC helpers — used by Item 11 (approval flow).
// Spec: spec.md §9.2.

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export type ApprovalPayload = {
  job_id: string;
  action: 'approve' | 'reject';
  exp: number;  // unix seconds
  jti: string;  // uuid
};

const SEP = '.';

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function signApprovalToken(p: Omit<ApprovalPayload, 'exp' | 'jti'> & { ttlSeconds?: number; jti?: string }, secret: string): { token: string; payload: ApprovalPayload } {
  const ttl = p.ttlSeconds ?? 24 * 3600;
  const payload: ApprovalPayload = {
    job_id: p.job_id,
    action: p.action,
    exp: Math.floor(Date.now() / 1000) + ttl,
    jti: p.jti ?? randomUUID(),
  };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac('sha256', secret).update(body).digest());
  return { token: `${body}${SEP}${sig}`, payload };
}

export class ApprovalTokenError extends Error {
  constructor(msg: string, public readonly code: 'malformed' | 'bad_sig' | 'expired') {
    super(msg);
  }
}

export function verifyApprovalToken(token: string, secret: string, now: Date = new Date()): ApprovalPayload {
  const parts = token.split(SEP);
  if (parts.length !== 2) throw new ApprovalTokenError('malformed token', 'malformed');
  const [body, sig] = parts;
  const expected = createHmac('sha256', secret).update(body).digest();
  const got = b64urlDecode(sig);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
    throw new ApprovalTokenError('bad signature', 'bad_sig');
  }
  let payload: ApprovalPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString('utf8'));
  } catch {
    throw new ApprovalTokenError('malformed payload', 'malformed');
  }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < now.getTime()) {
    throw new ApprovalTokenError('expired', 'expired');
  }
  if (!['approve', 'reject'].includes(payload.action)) {
    throw new ApprovalTokenError('bad action', 'malformed');
  }
  return payload;
}

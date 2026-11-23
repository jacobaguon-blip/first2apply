import type { PreparedApplication } from '@first2apply/core';

export type ApplicationReview = PreparedApplication & {
  version: string;
  approvedAt: string | null;
};

export function reviseApplication(application: PreparedApplication): ApplicationReview {
  return { ...application, version: crypto.randomUUID(), approvedAt: null };
}

export function canApproveApplication(application: PreparedApplication): boolean {
  return !!(
    application.resume.trim() &&
    application.coverLetter.trim() &&
    application.answers.every(({ answer }) => answer.trim())
  );
}

export function approveApplication(review: ApplicationReview): ApplicationReview {
  return canApproveApplication(review) ? { ...review, approvedAt: new Date().toISOString() } : review;
}

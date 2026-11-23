import { useEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';

import type { Job } from '@first2apply/core';
import { Button } from '@first2apply/ui';
import remarkGfm from 'remark-gfm';

import { useCareerOps } from '../../hooks/careerOps';
import { useSession } from '../../hooks/session';
import { exportCvPdf, prepareApplication } from '../../lib/electronMainSdk';
import {
  type ApplicationReview,
  approveApplication,
  canApproveApplication,
  reviseApplication,
} from './applicationReviewState';
import { DiffView, diffLines } from './cvDiff';

export function ApplicationReviewPanel({ job }: { job: Job }) {
  const { enabled } = useCareerOps();
  const { user } = useSession();
  if (!enabled || !user) return null;
  const storageKey = `f2a:application-review:v1:${user.id}:${job.id}`;
  return <ApplicationReviewEditor key={storageKey} job={job} storageKey={storageKey} />;
}

function ApplicationReviewEditor({ job, storageKey }: { job: Job; storageKey: string }) {
  const [review, setReview] = useState<ApplicationReview | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedPath, setSavedPath] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const masterCv = review?.masterCv;
  const resume = review?.resume;
  const lines = useMemo(() => (masterCv && resume ? diffLines(masterCv, resume) : []), [masterCv, resume]);
  const stats = useMemo(
    () => ({
      added: lines.filter(({ kind }) => kind === 'add').length,
      removed: lines.filter(({ kind }) => kind === 'del').length,
    }),
    [lines],
  );

  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  function save(next: ApplicationReview) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setReview(next);
      setError('');
    } catch {
      setError('The application version could not be saved on this device.');
    }
  }

  async function prepare() {
    setBusy(true);
    setError('');
    try {
      const draft = await prepareApplication(job.id);
      if (!active.current) return;
      save(reviseApplication(draft));
      setSavedPath('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!review) return;
    setError('');
    try {
      const result = await exportCvPdf({
        markdown: review.resume,
        company: job.companyName ?? 'Company',
        role: job.title ?? 'Role',
      });
      setSavedPath(result.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="my-6 space-y-4 rounded-lg border p-4" aria-label="Application review">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-medium">Application package</h3>
        <Button size="sm" onClick={prepare} disabled={busy}>
          {busy ? 'Preparing…' : review ? 'Prepare a new version' : 'Prepare application'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {review && (
        <fieldset disabled={busy} className="space-y-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="mr-auto font-medium">Résumé</h4>
              <Button size="sm" variant="outline" onClick={() => setShowDiff(!showDiff)}>
                {showDiff ? 'Show résumé' : 'Show before-and-after diff'}
              </Button>
              <Button size="sm" variant="outline" onClick={download}>
                Download résumé PDF
              </Button>
            </div>
            {savedPath && <p className="text-sm text-muted-foreground">Saved to {savedPath}</p>}
            {showDiff ? (
              <DiffView lines={lines} stats={stats} hasMaster={!!masterCv} />
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <Markdown remarkPlugins={[remarkGfm]}>{review.resume}</Markdown>
              </div>
            )}
          </div>
          {review.changes.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium">Why the résumé changed</h4>
              {review.changes.map(({ wording, requirement, evidence, reason }, index) => (
                <div key={index} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">{wording || 'Omitted from this version'}</p>
                  <dl className="mt-2 space-y-1">
                    <div>
                      <dt className="font-medium">Job requirement</dt>
                      <dd>{requirement}</dd>
                    </div>
                    <div>
                      <dt className="font-medium">Master CV entry</dt>
                      <dd>{evidence}</dd>
                    </div>
                    <div>
                      <dt className="font-medium">Reason for the change</dt>
                      <dd>{reason}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )}
          {review.unsupported.length > 0 && (
            <div className="rounded-md border p-3 text-sm">
              <h4 className="font-medium">Experience the master CV doesn’t support</h4>
              <ul className="list-disc pl-5">
                {review.unsupported.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-2">
            <h4 className="font-medium">Cover letter preview</h4>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <Markdown remarkPlugins={[remarkGfm]}>{review.coverLetter}</Markdown>
            </div>
            <details>
              <summary className="cursor-pointer text-sm">Edit cover letter</summary>
              <textarea
                aria-label="Cover letter draft"
                className="mt-2 min-h-32 w-full rounded-md border bg-background p-2 text-sm"
                value={review.coverLetter}
                onChange={(event) => save(reviseApplication({ ...review, coverLetter: event.target.value }))}
              />
            </details>
          </div>
          <div className="space-y-3">
            <h4 className="font-medium">Proposed screening answers</h4>
            {review.answers.length === 0 && (
              <p className="text-sm text-muted-foreground">No screening questions found in the job description.</p>
            )}
            {review.answers.map(({ question, answer }, index) => (
              <label key={index} className="block space-y-1 text-sm">
                <span className="block font-medium">{question}</span>
                <textarea
                  aria-label={question}
                  className="w-full rounded-md border bg-background p-2"
                  value={answer}
                  onChange={(event) => {
                    const answers = review.answers.map((entry, i) =>
                      i === index ? { ...entry, answer: event.target.value } : entry,
                    );
                    save(reviseApplication({ ...review, answers }));
                  }}
                />
                {!answer.trim() && <span className="block text-destructive">Needs your answer before approval</span>}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t pt-3">
            <Button
              onClick={() => save(approveApplication(review))}
              disabled={!!review.approvedAt || !canApproveApplication(review)}
            >
              Approve this version
            </Button>
            <p role="status" className="text-sm">
              {review.approvedAt ? 'Approved on this device' : 'Awaiting approval'}
            </p>
          </div>
        </fieldset>
      )}
    </section>
  );
}

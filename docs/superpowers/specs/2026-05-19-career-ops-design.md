# Career Ops — Tier 1 + Tier 2 Design

**Status:** approved by user 2026-05-19
**Scope:** dev-only, behind feature flag `career_ops_enabled`. No production deploy.

## Problem

First 2 Apply already aggregates jobs from LinkedIn, Indeed, Dice, and others. Once a user has 200 listings in their inbox, the bottleneck shifts from *finding* jobs to *acting on the right ones*: ranking listings by fit, then sending a tailored resume per application. We have nothing for either step today.

## Goal

Ship a single coherent "Career Ops" feature set, hidden behind a flag, that turns the existing jobs list into a ranked shortlist and lets the user generate + export a tailored CV for any job.

## Non-goals

- Auto-applying or auto-submitting forms.
- Interview prep, negotiation, outreach, company research (Tier 3+ — deferred).
- Greenhouse/Ashby/Lever direct API integration.
- Auto-evaluating every newly scraped job (cost unknown; manual-only in Tier 1/2).

## Feature flag

- Column on `user_profiles`: `career_ops_enabled boolean not null default false`.
- Renderer reads it via existing profile fetch and exposes a single boolean to UI.
- Edge functions check it and return `403 feature_disabled` if false.
- A Settings → "Experimental features" toggle lets dev builds flip it for the signed-in user.

## Tier 1 — application-time features

### 1. Master CV profile

**Data:**
```sql
create table user_cv_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  markdown text not null,
  source_filename text,
  updated_at timestamptz not null default now()
);
```

**Flow:**
1. User opens **Settings → My CV**.
2. Drops a PDF or DOCX file. The desktop app sends raw bytes to edge function `parse-cv`.
3. `parse-cv` extracts text (PDF: `pdf-parse`-equivalent via OpenAI vision or a Deno PDF lib; DOCX: ZIP+XML), then asks OpenAI to normalize into a markdown skeleton (sections: Summary, Experience, Education, Skills, Projects).
4. App opens the result in a monospace markdown editor with a live preview.
5. **Save** writes to `user_cv_profiles`.

Users can re-upload or edit any time. Only one master CV per user.

### 2. Tailored CV per job

**Data:** see `evaluations` schema below (Tier 2). `tailored_cv` and `tailored_cv_generated_at` columns store output.

**Flow:**
1. Job detail page shows a **Generate Tailored CV** button (visible when flag is on).
2. Renderer calls edge function `tailor-cv` with `{ job_id }`. Function loads the master CV + JD text, calls OpenAI with a "medium intensity" prompt: rewrite bullets, preserve facts, reorder sections by JD relevance. Returns tailored markdown.
3. UI shows a side-by-side diff (master vs tailored) using a markdown-aware diff.
4. User can edit the tailored markdown inline before exporting.

**Prompt guardrails:**
- System prompt: "You may rephrase, reorder, and emphasize. You may NOT invent jobs, dates, titles, companies, certifications, or metrics. If the JD asks for something the master CV does not have, do not add it."
- Output schema: pure markdown, no commentary.

### 3. ATS-optimized PDF export

- "Download PDF" button next to the tailored CV.
- Renderer opens a hidden `BrowserWindow` loading a print-template HTML that consumes the tailored markdown (rendered with `marked` or `remark`).
- Calls `webContents.printToPDF` with `printBackground: false`, `pageSize: 'Letter'`, single-column.
- Saves to user's `Downloads/` as `{Company}_{Role}_CV.pdf`.
- Template uses Inter (system fallback to Helvetica), 11pt, black text on white, no tables, no images. ATS-safe.

## Tier 2 — list-time features

### 4. A–F score + 6-block evaluation

**Data:**
```sql
create table evaluations (
  id uuid primary key default gen_random_uuid(),
  job_id bigint not null references jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score smallint not null check (score between 0 and 100),
  grade text not null check (grade in ('A','B','C','D','F')),
  archetype text,
  blocks jsonb not null,
  tailored_cv text,
  tailored_cv_generated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_id, user_id)
);
create index on evaluations (user_id, grade);
```

`blocks` shape:
```json
{
  "role_summary":   "string",
  "cv_match":       { "strengths": ["..."], "gaps": ["..."] },
  "level_strategy": "string",
  "comp_research":  { "estimated_range": "string", "signals": ["..."] },
  "personalization":"string",
  "interview_prep": { "likely_questions": ["..."], "talking_points": ["..."] }
}
```

**Flow:**
- Jobs list: new sortable column **Fit** showing the letter grade (color-coded).
- "Evaluate" button on each job row + on the job detail page.
- Edge function `evaluate-job` loads master CV + JD, calls OpenAI with a structured-output schema, writes one `evaluations` row.
- Job detail panel renders the 6 blocks in a collapsible accordion.

### 5. Role archetype tag

- `archetype` column on `evaluations`. Single label from a fixed enum: `LLMOps | Agentic | PM | SA | FullStack | Transformation | Other`.
- Jobs list adds a filter chip row above the table.

## Architecture

```
Electron renderer ──IPC──> electron main ──HTTPS──> Supabase Edge Functions ──> OpenAI
                                                          │
                                                          └──> Postgres (user_cv_profiles, evaluations)
```

New edge functions (all under `apps/backend/supabase/functions/`):
- `parse-cv` — file in, markdown out
- `tailor-cv` — `{ job_id }` in, markdown out, writes `evaluations.tailored_cv`
- `evaluate-job` — `{ job_id }` in, full evaluation row out

New renderer surfaces:
- `pages/myCv.tsx` — upload + editor
- `pages/jobDetail.tsx` (existing, augment) — Evaluate button, eval panel, Generate Tailored CV, PDF export
- `pages/links.tsx` (existing, augment) — Fit column, archetype filter chip row
- `pages/settings.tsx` (existing, augment) — Experimental features toggle

Shared lib additions in `libraries/core/`:
- `careerOps/types.ts` — Evaluation, MasterCv shapes
- `careerOps/prompts.ts` — system + user prompts for all three functions

## Error handling

- Edge function errors return `{ error: { code, message } }`. Renderer shows a toast with retry.
- `parse-cv` partial success (text extracted but markdown malformed) returns raw text + warning so the user can clean it up manually.
- `tailor-cv` and `evaluate-job` are idempotent on retry (upsert on `(job_id, user_id)`).
- Feature flag disabled → 403 with `code: feature_disabled`.

## Testing

- Manual dev-mode flow:
  1. Toggle flag in Settings.
  2. Upload a sample CV (PDF + DOCX).
  3. Edit, save.
  4. Open a job → Evaluate → see score + 6 blocks.
  5. Generate tailored CV → diff → export PDF.
  6. Verify PDF opens, is text-selectable, single column.
- Unit tests on prompt construction (no LLM call): given master CV + JD, prompt has the expected guardrails.
- DB migration tested locally via `pnpm supabase db reset`.

## Deferred (Tiers 3–4)

- Interview story bank (`user_stories`)
- Deep company research brief (`evaluations.company_brief` already reserved)
- Negotiation scripts
- LinkedIn outreach drafts
- Training/certification gap analysis
- Portfolio project scoring
- Direct Greenhouse/Ashby/Lever APIs
- Application-form fill

## Rollout

- Flag off by default for all users.
- Dev-only `VITE_FORCE_CAREER_OPS=1` env var also enables the UI without DB toggle, for local testing.
- No production deploy. Merge to master is gated only by the flag.

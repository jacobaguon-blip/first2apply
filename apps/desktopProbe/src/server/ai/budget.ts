// AI spend budget module — spec.md §9.3.
// Hard cap $20 across the weekend run. All AI call sites MUST go through
// assertWithinBudget() before issuing the request, then recordSpend() after.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type ModelId = 'gpt-4o-mini' | 'gpt-4o';

const PRICES_PER_1M_TOKENS: Record<ModelId, { input: number; output: number }> = {
  // April 2026 pricing (USD per 1M tokens)
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o':      { input: 2.5,  output: 10.0 },
};

export const HARD_CAP_USD = 20.0;

export type SpendLedger = {
  total_usd: number;
  entries: Array<{
    at: string;
    model: ModelId;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
    note?: string;
  }>;
};

export type BudgetOpts = {
  ledgerPath?: string;       // defaults to repoRoot()/.f2a-ai-spend.json
  capUsd?: number;
  now?: () => Date;
  fs?: { read: (p: string) => string; write: (p: string, s: string) => void; exists: (p: string) => boolean };
};

const DEFAULT_LEDGER_REL = '.f2a-ai-spend.json';

function repoRoot(): string {
  // From apps/desktopProbe/src/server/ai/budget.ts -> up 5 dirs.
  return resolve(__dirname, '..', '..', '..', '..', '..');
}

function defaultFs() {
  return {
    read: (p: string) => readFileSync(p, 'utf8'),
    write: (p: string, s: string) => {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, s);
    },
    exists: (p: string) => existsSync(p),
  };
}

function load(opts: BudgetOpts): { path: string; ledger: SpendLedger } {
  const fs = opts.fs ?? defaultFs();
  const path = opts.ledgerPath ?? resolve(repoRoot(), DEFAULT_LEDGER_REL);
  if (!fs.exists(path)) {
    return { path, ledger: { total_usd: 0, entries: [] } };
  }
  try {
    const ledger = JSON.parse(fs.read(path)) as SpendLedger;
    if (typeof ledger.total_usd !== 'number' || !Array.isArray(ledger.entries)) {
      return { path, ledger: { total_usd: 0, entries: [] } };
    }
    return { path, ledger };
  } catch {
    return { path, ledger: { total_usd: 0, entries: [] } };
  }
}

export function estimateCostUsd(tokensIn: number, tokensOut: number, model: ModelId): number {
  const p = PRICES_PER_1M_TOKENS[model];
  if (!p) throw new Error(`unknown model: ${model}`);
  return (tokensIn / 1_000_000) * p.input + (tokensOut / 1_000_000) * p.output;
}

export class AiBudgetExceededError extends Error {
  constructor(public readonly cap: number, public readonly projected: number) {
    super(`AI budget exceeded: projected $${projected.toFixed(4)} > cap $${cap.toFixed(2)}`);
  }
}

/**
 * Throws AiBudgetExceededError if (current spend + projected cost) would exceed cap.
 * Estimates output tokens at 50% of input (sane heuristic for keyword extraction).
 */
export function assertWithinBudget(estTokensIn: number, model: ModelId, opts: BudgetOpts = {}): void {
  if (process.env.F2A_AI_MOCK === '1') return; // mock mode bypasses
  const { ledger } = load(opts);
  const cap = opts.capUsd ?? HARD_CAP_USD;
  const projected = estimateCostUsd(estTokensIn, Math.ceil(estTokensIn * 0.5), model);
  const total = ledger.total_usd + projected;
  if (total > cap) {
    throw new AiBudgetExceededError(cap, total);
  }
}

export function recordSpend(
  tokensIn: number,
  tokensOut: number,
  model: ModelId,
  opts: BudgetOpts & { note?: string } = {},
): SpendLedger {
  const fs = opts.fs ?? defaultFs();
  const { path, ledger } = load(opts);
  const cost = process.env.F2A_AI_MOCK === '1' ? 0 : estimateCostUsd(tokensIn, tokensOut, model);
  ledger.entries.push({
    at: (opts.now ?? (() => new Date()))().toISOString(),
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: Number(cost.toFixed(6)),
    note: opts.note,
  });
  ledger.total_usd = Number((ledger.total_usd + cost).toFixed(6));
  fs.write(path, JSON.stringify(ledger, null, 2) + '\n');
  return ledger;
}

export function readLedger(opts: BudgetOpts = {}): SpendLedger {
  return load(opts).ledger;
}

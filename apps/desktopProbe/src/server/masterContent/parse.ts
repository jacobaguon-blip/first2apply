// Item 9 — Master content parsers.
// Real parsers (PDF/DOCX) are deferred to Monday: requires `mammoth` and `pdf-parse`
// installs and packaging audit. This module provides:
//   - JSON pass-through (the simplest accepted upload format)
//   - a deterministic "skeleton" parser for unknown formats (used by tests + dry-run)
//   - validate() that asserts a minimum shape

export type MasterResume = {
  version: 1;
  name?: string;
  headline?: string;
  contact?: Record<string, unknown>;
  summary?: string;
  experience?: Array<Record<string, unknown>>;
  education?: Array<Record<string, unknown>>;
  skills?: string[];
};

export type MasterCoverLetter = {
  version: 1;
  salutation?: string;
  body_paragraphs?: string[];
  closing?: string;
  placeholders?: string[];
};

export class MasterContentValidationError extends Error {}

export function parseMasterResume(input: unknown): MasterResume {
  if (typeof input === 'string') {
    const text = input;
    try {
      input = JSON.parse(text);
    } catch {
      return skeletonResume(text);
    }
  }
  if (!isPlainObject(input)) {
    throw new MasterContentValidationError('master resume must be a JSON object');
  }
  const obj = input as Record<string, unknown>;
  if (obj.version !== 1) {
    throw new MasterContentValidationError('master resume requires version: 1');
  }
  return obj as MasterResume;
}

export function parseMasterCoverLetter(input: unknown): MasterCoverLetter {
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch {
      return { version: 1, body_paragraphs: [String(input)] };
    }
  }
  if (!isPlainObject(input)) {
    throw new MasterContentValidationError('cover letter must be a JSON object');
  }
  const obj = input as Record<string, unknown>;
  if (obj.version !== 1) {
    throw new MasterContentValidationError('cover letter requires version: 1');
  }
  return obj as MasterCoverLetter;
}

function skeletonResume(text: string): MasterResume {
  return {
    version: 1,
    summary: text.slice(0, 500),
    skills: [],
    experience: [],
    education: [],
  };
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

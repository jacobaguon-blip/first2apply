// Item 12 — LinkedIn Connections CSV parser.
// Standard LinkedIn export columns:
//   First Name, Last Name, URL, Email Address, Company, Position, Connected On
// Notes per LinkedIn:
//   - First few lines may be a "Notes:" preamble; we skip until the header row.
//   - Email Address is frequently empty (privacy default).
//   - Connected On format: "DD MMM YYYY" (e.g., "11 Jun 2024").
// No external deps: tiny RFC4180-ish parser sufficient for LinkedIn output.

export type Connection = {
  firstName: string;
  lastName: string;
  url: string;
  email: string | null;
  company: string;
  position: string;
  connectedOn: string; // raw
  connectedOnIso: string | null;
};

export type ParseResult = {
  connections: Connection[];
  warnings: string[];
};

const REQUIRED_HEADERS = ['First Name', 'Last Name', 'URL', 'Email Address', 'Company', 'Position', 'Connected On'];

export function parseConnectionsCsv(csv: string): ParseResult {
  const warnings: string[] = [];
  const lines = csv.replace(/^﻿/, '').split(/\r\n|\n|\r/);
  // Strip leading "Notes:" preamble + blank lines until header found.
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const row = parseRow(lines[i]);
    if (row.length >= REQUIRED_HEADERS.length && REQUIRED_HEADERS.every((h, j) => row[j]?.trim() === h)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error('Connections CSV: header row not found (expected LinkedIn export format).');
  }
  const out: Connection[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || raw.trim() === '') continue;
    const cells = parseRow(raw);
    if (cells.length < 7) {
      warnings.push(`row ${i + 1}: ${cells.length} cells, expected 7 — skipped`);
      continue;
    }
    const connectedOn = cells[6].trim();
    out.push({
      firstName: cells[0].trim(),
      lastName: cells[1].trim(),
      url: cells[2].trim(),
      email: cells[3].trim() || null,
      company: cells[4].trim(),
      position: cells[5].trim(),
      connectedOn,
      connectedOnIso: parseLinkedInDate(connectedOn),
    });
  }
  return { connections: out, warnings };
}

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

export function parseLinkedInDate(s: string): string | null {
  const m = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(s);
  if (!m) return null;
  const dd = m[1].padStart(2, '0');
  const mon = MONTHS[m[2] as keyof typeof MONTHS];
  if (!mon) return null;
  return `${m[3]}-${mon}-${dd}`;
}

function parseRow(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        out.push(cur);
        cur = '';
      } else if (ch === '"' && cur === '') {
        inQ = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

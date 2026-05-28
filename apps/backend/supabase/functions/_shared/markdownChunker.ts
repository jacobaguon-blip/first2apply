/**
 * Split cleaned markdown into chunks that fit a model's usable context.
 *
 * Pure string logic, no dependencies — kept in its own module so it can be unit
 * tested without loading the edge-function env/OpenAI stack.
 *
 * Splits primarily on top-level markdown headings / list-item boundaries; falls
 * back to a hard char-window split with overlap when no boundary exists inside a
 * window, so a listing straddling a boundary still appears whole in one chunk.
 * Content at or under maxChars is returned as a single chunk.
 */
export function chunkMarkdown(
  markdown: string,
  { maxChars, overlapChars }: { maxChars: number; overlapChars: number },
): string[] {
  const text = markdown ?? '';
  if (text.length <= maxChars) return text.length ? [text] : [''];

  // Boundary candidates: start-of-line headings (#, ##, ###) and list markers.
  const boundaryRe = /\n(?=(?:#{1,3} )|(?:- )|(?:\* )|(?:\d+\. ))/g;
  const boundaries: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = boundaryRe.exec(text)) !== null) boundaries.push(m.index + 1);

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const hardEnd = Math.min(start + maxChars, text.length);
    let end = hardEnd;
    if (hardEnd < text.length) {
      // Prefer the latest boundary within the window that makes meaningful
      // progress (past the window midpoint) to avoid tiny chunks.
      const candidate = boundaries.filter((b) => b > start + maxChars / 2 && b <= hardEnd).pop();
      if (candidate) end = candidate;
    }
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    // Carry overlap so a listing split across the cut survives in the next chunk.
    start = Math.max(end - overlapChars, start + 1);
  }
  return chunks;
}

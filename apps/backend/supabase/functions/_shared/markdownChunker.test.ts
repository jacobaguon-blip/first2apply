import { assert, assertEquals } from '@std/assert';

import { chunkMarkdown } from './markdownChunker.ts';

Deno.test('returns single chunk when under maxChars', () => {
  const md = '## Jobs\n- a\n- b\n- c';
  const chunks = chunkMarkdown(md, { maxChars: 1000, overlapChars: 50 });
  assertEquals(chunks.length, 1);
  assertEquals(chunks[0], md);
});

Deno.test('empty input yields a single empty chunk', () => {
  assertEquals(chunkMarkdown('', { maxChars: 100, overlapChars: 10 }), ['']);
});

Deno.test('splits a long list into multiple chunks and loses no list items', () => {
  // 200 list items, each ~20 chars -> ~4000 chars, force small chunks.
  const items = Array.from({ length: 200 }, (_, i) => `- [Job ${i}](/jobs/${i})`);
  const md = '## Open Roles\n' + items.join('\n');
  const chunks = chunkMarkdown(md, { maxChars: 400, overlapChars: 30 });
  assert(chunks.length > 1, 'expected multiple chunks');
  // Every item id must appear in at least one chunk (no silent drops).
  const joined = chunks.join('\n');
  for (let i = 0; i < 200; i++) {
    assert(joined.includes(`/jobs/${i}`), `item ${i} missing from all chunks`);
  }
});

Deno.test('prefers heading/list boundaries so items are not cut mid-line', () => {
  const items = Array.from({ length: 60 }, (_, i) => `- [Role ${i}](/jobs/${i}) — Remote`);
  const md = items.join('\n');
  const chunks = chunkMarkdown(md, { maxChars: 300, overlapChars: 0 });
  // With 0 overlap and boundary-aligned splits, each chunk should start at a
  // list marker (not mid-token).
  for (const c of chunks.slice(1)) {
    assert(c.startsWith('- '), `chunk should start at a list boundary, got: ${c.slice(0, 20)}`);
  }
});

Deno.test('hard-splits when no boundary exists in the window', () => {
  const md = 'x'.repeat(1000); // no newlines/boundaries at all
  const chunks = chunkMarkdown(md, { maxChars: 300, overlapChars: 0 });
  assert(chunks.length >= 4, 'expected hard splits on boundary-less content');
  assertEquals(chunks.join(''), md);
});

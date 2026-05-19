import { getExceptionMessage } from '@first2apply/core';

import { CORS_HEADERS } from '../_shared/cors.ts';
import { getEdgeFunctionContext } from '../_shared/edgeFunctions.ts';
import { createLoggerWithMeta } from '../_shared/logger.ts';
import { buildOpenAiClient, logAiUsage } from '../_shared/openAI.ts';
import { parseCvSystemPrompt } from '../_shared/careerOpsPrompts.ts';

import JSZip from 'npm:jszip';

type ParseCvBody = {
  filename: string;
  mimetype?: string;
  // base64-encoded file bytes
  contentBase64: string;
};

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const doc = zip.file('word/document.xml');
  if (!doc) throw new Error('DOCX missing word/document.xml');
  const xml = await doc.async('string');
  // Insert a newline at paragraph breaks before stripping tags so we keep some structure.
  const withBreaks = xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:br\s*\/>/g, '\n');
  // Strip remaining XML tags.
  const text = withBreaks.replace(/<[^>]+>/g, '');
  // Decode common XML entities.
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // pdf-parse is a Node module that works under Deno's nodeModules: "auto".
  // Dynamic import so deploy doesn't break if the binary fails to load — we
  // fall back to a base64 dump that OpenAI will reject gracefully.
  try {
    const mod = await import('npm:pdf-parse');
    const pdfParse = (mod as { default?: unknown }).default ?? mod;
    const result = await (pdfParse as (b: Uint8Array | Buffer) => Promise<{ text: string }>)(bytes);
    return (result.text ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  } catch (err) {
    throw new Error(`PDF text extraction failed: ${(err as Error).message}`);
  }
}

async function checkFeatureFlag(supabaseClient: { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { career_ops_enabled: boolean } | null; error: unknown }> } } } }, userId: string) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('career_ops_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return !!data?.career_ops_enabled;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const logger = createLoggerWithMeta({ function: 'parse-cv' });
  try {
    const context = await getEdgeFunctionContext({ logger, req, checkAuthorization: true });
    const { supabaseClient, supabaseAdminClient, user } = context;
    if (!user) {
      return new Response(JSON.stringify({ error: { code: 'unauthenticated', message: 'No user' } }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const enabled = await checkFeatureFlag(supabaseClient as never, user.id);
    if (!enabled) {
      return new Response(
        JSON.stringify({ error: { code: 'feature_disabled', message: 'career_ops_enabled is off' } }),
        { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    const body = (await req.json()) as ParseCvBody;
    const { filename, mimetype, contentBase64 } = body;
    if (!filename || !contentBase64) throw new Error('filename and contentBase64 are required');
    const bytes = decodeBase64(contentBase64);

    const lower = filename.toLowerCase();
    let extracted = '';
    if (lower.endsWith('.docx') || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      extracted = await extractDocxText(bytes);
    } else if (lower.endsWith('.pdf') || mimetype === 'application/pdf') {
      extracted = await extractPdfText(bytes);
    } else if (lower.endsWith('.md') || lower.endsWith('.txt')) {
      extracted = new TextDecoder().decode(bytes);
    } else {
      throw new Error(`Unsupported file type: ${filename}`);
    }

    if (!extracted || extracted.length < 20) {
      throw new Error('Could not extract any text from the file');
    }

    // Normalize via OpenAI.
    const { openAi, llmConfig } = buildOpenAiClient({ modelName: 'gpt-4o-mini' });
    const response = await openAi.chat.completions.create({
      model: llmConfig.model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: parseCvSystemPrompt },
        { role: 'user', content: `Source resume text follows. Normalize it into the required markdown.\n\n---\n${extracted}` },
      ],
    });

    await logAiUsage({ logger, supabaseAdminClient, forUserId: user.id, llmConfig, response });

    const markdown = response.choices?.[0]?.message?.content?.trim() ?? '';
    if (!markdown) {
      return new Response(
        JSON.stringify({ markdown: extracted, source_filename: filename, warning: 'LLM returned empty output; using raw extracted text.' }),
        { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    const { error: upsertErr } = await supabaseClient
      .from('user_cv_profiles')
      .upsert(
        { user_id: user.id, markdown, source_filename: filename, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify({ markdown, source_filename: filename }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (error) {
    logger.error(getExceptionMessage(error));
    return new Response(JSON.stringify({ error: { code: 'parse_failed', message: getExceptionMessage(error, true) } }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
});

# first2apply scenarios

## AI provider selection

Triggering condition: an edge function builds its model client through `buildOpenAiClient` with `F2A_AI_PROVIDER` set (or unset).

Expected behavior:
- Unset means `local` (Ollama), the household default.
- `openai` uses `OPENAI_API_KEY` and the OpenAI base URL.
- A cloud provider such as `gemini` uses its own key, base URL and model, and never falls back to another provider.
- An unrecognized value fails loudly at startup. It must not silently select `local`, because that hides a misconfiguration behind slow, low-quality parses.

Regression coverage: none yet (target: a Deno test next to `_shared/localFetch.test.ts`).

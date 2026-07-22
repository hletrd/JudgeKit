import { z } from "zod";

// ── Recommended shortlist ─────────────────────────────────────────────────────
// Hardcoded ids only. Live metadata (name/price/context) comes from the
// OpenRouter `/models` fetch. Order matters: shown top-first in the picker.
// All verified present on OpenRouter and tool-calling capable as of 2026-07-22.
export const RECOMMENDED_OPENROUTER_MODELS = [
  "deepseek/deepseek-v4-flash", // default
  "inclusionai/ling-2.6-1t",
  "inclusionai/ring-2.6-1t",
  "minimax/minimax-m3",
  "qwen/qwen3.7-plus",
  "deepseek/deepseek-v4-pro",
  "xiaomi/mimo-v2.5-pro",
  "kwaipilot/kat-coder-pro-v2.5",
  "z-ai/glm-5.2",
  "google/gemini-3.6-flash",
  "x-ai/grok-4.5",
  "moonshotai/kimi-k3",
] as const;

const RECOMMENDED_SET = new Set<string>(RECOMMENDED_OPENROUTER_MODELS);

// ── Model-id validation ───────────────────────────────────────────────────────
// OpenRouter ids contain `/` and `:` (e.g. `deepseek/deepseek-v4-flash`,
// `qwen/qwen3.7-plus:thinking`), so the OpenAI/Claude patterns (which reject `/`)
// must NOT be reused here. Permissive-but-bounded: alphanumeric start/end with
// `._/:-` allowed in between. The model is only ever placed in a JSON body (never
// a URL path), so path traversal is not a concern.
export const OPENROUTER_MODEL_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._/:-]*[A-Za-z0-9])?$/;
export const OPENROUTER_MODEL_MAX_LENGTH = 128;

export function isValidOpenRouterModel(model: string): boolean {
  return (
    model.length > 0 &&
    model.length <= OPENROUTER_MODEL_MAX_LENGTH &&
    OPENROUTER_MODEL_PATTERN.test(model)
  );
}

// ── Trimmed model shape returned to the picker ────────────────────────────────
export interface OpenRouterModelInfo {
  id: string;
  name: string | null;
  contextLength: number | null;
  pricing: { prompt: string | null; completion: string | null };
  created: number | null;
  recommended: boolean;
}

// Lenient schema for a single raw OpenRouter `/models` entry. Unknown fields are
// ignored; missing/invalid metadata degrades to null rather than dropping the row
// (except `id`, which is required).
const RawOpenRouterModelSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  context_length: z.number().nullish(),
  pricing: z
    .object({
      prompt: z.union([z.string(), z.number()]).nullish(),
      completion: z.union([z.string(), z.number()]).nullish(),
    })
    .nullish(),
  created: z.number().nullish(),
});

const RawOpenRouterModelsResponseSchema = z.object({
  data: z.array(z.unknown()),
});

function priceToString(value: string | number | null | undefined): string | null {
  return value != null ? String(value) : null;
}

/** Build a recommended-only fallback entry (id + flag, metadata null). */
export function makeRecommendedFallbackEntry(id: string): OpenRouterModelInfo {
  return {
    id,
    name: null,
    contextLength: null,
    pricing: { prompt: null, completion: null },
    created: null,
    recommended: true,
  };
}

/**
 * Recommended-only list with null metadata, in the hardcoded order. Used when the
 * upstream `/models` fetch fails and there is no cached data to fall back to, so
 * the picker still degrades gracefully.
 */
export function recommendedFallbackList(): OpenRouterModelInfo[] {
  return RECOMMENDED_OPENROUTER_MODELS.map(makeRecommendedFallbackEntry);
}

/**
 * Parse a raw OpenRouter `/models` payload into the trimmed shape, marking
 * recommended ids and sorting them first (in the hardcoded order), then the rest
 * by `created` descending. Recommended ids missing from the live payload are still
 * included with null metadata so the shortlist is always complete.
 */
export function buildOpenRouterModelList(raw: unknown): OpenRouterModelInfo[] {
  const top = RawOpenRouterModelsResponseSchema.safeParse(raw);
  const items = top.success ? top.data.data : [];

  const byId = new Map<string, OpenRouterModelInfo>();
  for (const item of items) {
    const parsed = RawOpenRouterModelSchema.safeParse(item);
    if (!parsed.success) continue;
    const m = parsed.data;
    if (byId.has(m.id)) continue;
    byId.set(m.id, {
      id: m.id,
      name: m.name ?? null,
      contextLength: m.context_length ?? null,
      pricing: {
        prompt: priceToString(m.pricing?.prompt),
        completion: priceToString(m.pricing?.completion),
      },
      created: m.created ?? null,
      recommended: RECOMMENDED_SET.has(m.id),
    });
  }

  const recommended: OpenRouterModelInfo[] = [];
  for (const id of RECOMMENDED_OPENROUTER_MODELS) {
    const existing = byId.get(id);
    if (existing) {
      recommended.push({ ...existing, recommended: true });
      byId.delete(id);
    } else {
      recommended.push(makeRecommendedFallbackEntry(id));
    }
  }

  const rest = [...byId.values()].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  return [...recommended, ...rest];
}

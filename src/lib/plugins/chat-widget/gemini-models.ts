import { z } from "zod";

// ── Recommended shortlist ─────────────────────────────────────────────────────
// Confirmed against Google's official Gemini API docs (2026-07-22). These are
// Google's exact model ids (no leading "models/"), the same ids the native
// `gemini` provider passes to `.../v1beta/models/${id}:streamGenerateContent`.
// Live metadata (display name / description / token limit) comes from the
// `/v1beta/models` fetch. Order matters: shown top-first in the picker.
export const RECOMMENDED_GEMINI_MODELS = [
  "gemini-3.6-flash", // GA, default
  "gemini-3.5-flash-lite", // GA
  "gemini-3.1-pro-preview", // preview
  "gemini-3.1-flash-lite", // preview
  "gemini-2.5-flash",
  "gemini-2.5-pro",
] as const;

const RECOMMENDED_SET = new Set<string>(RECOMMENDED_GEMINI_MODELS);

const MODELS_PREFIX = "models/";

/** Strip the leading `models/` namespace Google returns in the `name` field. */
export function stripModelsPrefix(name: string): string {
  return name.startsWith(MODELS_PREFIX) ? name.slice(MODELS_PREFIX.length) : name;
}

// ── Trimmed model shape returned to the picker ────────────────────────────────
export interface GeminiModelInfo {
  id: string;
  displayName: string | null;
  description: string | null;
  inputTokenLimit: number | null;
  recommended: boolean;
}

// Lenient schema for a single raw `/v1beta/models` entry. Unknown fields are
// ignored; missing/invalid metadata degrades to null rather than dropping the
// row (except `name`, which is required to derive the id).
const RawGeminiModelSchema = z.object({
  name: z.string(),
  displayName: z.string().nullish(),
  description: z.string().nullish(),
  inputTokenLimit: z.number().nullish(),
  supportedGenerationMethods: z.array(z.string()).nullish(),
});

const RawGeminiModelsResponseSchema = z.object({
  models: z.array(z.unknown()),
});

/** Build a recommended-only fallback entry (id + flag, metadata null). */
export function makeRecommendedFallbackEntry(id: string): GeminiModelInfo {
  return {
    id,
    displayName: null,
    description: null,
    inputTokenLimit: null,
    recommended: true,
  };
}

/**
 * Recommended-only list with null metadata, in the hardcoded order. Used when
 * no key is configured or the upstream fetch fails with no cached data, so the
 * picker still degrades gracefully.
 */
export function recommendedFallbackList(): GeminiModelInfo[] {
  return RECOMMENDED_GEMINI_MODELS.map(makeRecommendedFallbackEntry);
}

/**
 * Parse a raw `/v1beta/models` payload into the trimmed shape:
 *  - keep only models whose `supportedGenerationMethods` includes
 *    `generateContent` (the method the chat provider uses),
 *  - strip the leading `models/` from the id,
 *  - mark recommended ids and sort them first (in the hardcoded order), then the
 *    remainder alphabetically for a deterministic order.
 * Recommended ids missing from the live payload are still included with null
 * metadata so the shortlist is always complete.
 */
export function buildGeminiModelList(raw: unknown): GeminiModelInfo[] {
  const top = RawGeminiModelsResponseSchema.safeParse(raw);
  const items = top.success ? top.data.models : [];

  const byId = new Map<string, GeminiModelInfo>();
  for (const item of items) {
    const parsed = RawGeminiModelSchema.safeParse(item);
    if (!parsed.success) continue;
    const m = parsed.data;
    // Only models usable for chat completion.
    if (!(m.supportedGenerationMethods ?? []).includes("generateContent")) continue;
    const id = stripModelsPrefix(m.name);
    if (id.length === 0 || byId.has(id)) continue;
    byId.set(id, {
      id,
      displayName: m.displayName ?? null,
      description: m.description ?? null,
      inputTokenLimit: m.inputTokenLimit ?? null,
      recommended: RECOMMENDED_SET.has(id),
    });
  }

  const recommended: GeminiModelInfo[] = [];
  for (const id of RECOMMENDED_GEMINI_MODELS) {
    const existing = byId.get(id);
    if (existing) {
      recommended.push({ ...existing, recommended: true });
      byId.delete(id);
    } else {
      recommended.push(makeRecommendedFallbackEntry(id));
    }
  }

  const rest = [...byId.values()].sort((a, b) =>
    (a.displayName ?? a.id).localeCompare(b.displayName ?? b.id)
  );
  return [...recommended, ...rest];
}

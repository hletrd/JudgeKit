import { NextResponse } from "next/server";
import { createApiHandler } from "@/lib/api/handler";
import { getPluginState } from "@/lib/plugins/data";
import {
  buildGeminiModelList,
  recommendedFallbackList,
  type GeminiModelInfo,
} from "@/lib/plugins/chat-widget/gemini-models";
import { logger } from "@/lib/logger";

// FIXED upstream — never a user-supplied URL, so there is no SSRF surface. The
// key is NOT in this URL (see below), so it can never appear in a logged URL.
const GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const UPSTREAM_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // ~1h

// Module-level in-memory cache. The model catalog is the same for any valid key
// (it is the public model list, not key-scoped), so a single global cache is
// safe. Survives across requests within a server instance; a slow/failed
// upstream degrades to stale cache (or the recommended shortlist) instead of
// hanging or 500ing the admin page.
let cache: { models: GeminiModelInfo[]; fetchedAt: number } | null = null;

/**
 * Fetch Google's Gemini model catalog.
 *
 * SECURITY: the API key is passed ONLY in the `x-goog-api-key` request header,
 * never as the `?key=` query param, so the key can never land in a logged URL.
 * On a non-ok response only the status is surfaced (never the key or the
 * response body); the thrown Error carries no key material.
 */
async function fetchGeminiModels(apiKey: string): Promise<GeminiModelInfo[]> {
  const response = await fetch(GEMINI_MODELS_URL, {
    method: "GET",
    headers: { Accept: "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Gemini models API error ${response.status}`);
  }
  const raw: unknown = await response.json();
  return buildGeminiModelList(raw);
}

export const GET = createApiHandler({
  // Mirror the sibling openrouter-models / test-connection route's admin gate.
  auth: { capabilities: ["system.plugins"] },
  rateLimit: "plugins:chat-widget:gemini-models",
  handler: async () => {
    const now = Date.now();

    // Serve fresh cache without touching upstream (or reading the key).
    if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
      return NextResponse.json({
        models: cache.models,
        error: false,
        stale: false,
        keyConfigured: true,
      });
    }

    // Read the configured Gemini key via the plaintext-tolerant decrypt path.
    const pluginState = await getPluginState("chat-widget", { includeSecrets: true });
    const config = (pluginState?.config ?? {}) as Record<string, unknown>;
    const apiKey = typeof config.geminiApiKey === "string" ? config.geminiApiKey : "";

    // No key configured → return the fallback list with a flag (never error).
    if (apiKey.length === 0) {
      return NextResponse.json({
        models: recommendedFallbackList(),
        error: false,
        stale: false,
        keyConfigured: false,
      });
    }

    try {
      const models = await fetchGeminiModels(apiKey);
      cache = { models, fetchedAt: now };
      return NextResponse.json({ models, error: false, stale: false, keyConfigured: true });
    } catch (err) {
      // `err` carries only a status-code message (or a network/abort error); it
      // never contains the API key, which lives solely in the request header.
      logger.warn({ err }, "[chat-widget] Gemini /models fetch failed; degrading");

      // Prefer stale cache over the bare recommended list when available.
      if (cache) {
        return NextResponse.json({
          models: cache.models,
          error: true,
          stale: true,
          keyConfigured: true,
        });
      }

      // No cache: degrade to the recommended shortlist so the picker still renders.
      return NextResponse.json({
        models: recommendedFallbackList(),
        error: true,
        stale: false,
        keyConfigured: true,
      });
    }
  },
});

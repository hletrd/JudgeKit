import { NextResponse } from "next/server";
import { createApiHandler } from "@/lib/api/handler";
import {
  buildOpenRouterModelList,
  recommendedFallbackList,
  type OpenRouterModelInfo,
} from "@/lib/plugins/chat-widget/openrouter-models";
import { logger } from "@/lib/logger";

// FIXED upstream — never a user-supplied URL, so there is no SSRF surface.
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const UPSTREAM_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // ~1h

// Module-level in-memory cache. Survives across requests within a server
// instance; a slow/failed upstream degrades to stale cache (or the recommended
// shortlist) instead of hanging or 500ing the admin page.
let cache: { models: OpenRouterModelInfo[]; fetchedAt: number } | null = null;

async function fetchOpenRouterModels(): Promise<OpenRouterModelInfo[]> {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`OpenRouter models API error ${response.status}`);
  }
  const raw: unknown = await response.json();
  return buildOpenRouterModelList(raw);
}

export const GET = createApiHandler({
  // Mirror the sibling test-connection route's admin gate exactly.
  auth: { capabilities: ["system.plugins"] },
  rateLimit: "plugins:chat-widget:openrouter-models",
  handler: async () => {
    const now = Date.now();

    // Serve fresh cache without touching upstream.
    if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
      return NextResponse.json({ models: cache.models, error: false, stale: false });
    }

    try {
      const models = await fetchOpenRouterModels();
      cache = { models, fetchedAt: now };
      return NextResponse.json({ models, error: false, stale: false });
    } catch (err) {
      logger.warn({ err }, "[chat-widget] OpenRouter /models fetch failed; degrading");

      // Prefer stale cache over the bare recommended list when available.
      if (cache) {
        return NextResponse.json({ models: cache.models, error: true, stale: true });
      }

      // No cache: degrade to the recommended shortlist (ids + flag, null metadata)
      // so the picker still renders.
      return NextResponse.json({ models: recommendedFallbackList(), error: true, stale: false });
    }
  },
});

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { createApiHandler } from "@/lib/api/handler";
import { logger } from "@/lib/logger";

const requestSchema = z.object({
  provider: z.enum(["openai", "claude", "gemini"]),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

const TEST_CONNECTION_TIMEOUT_MS = 15_000;

export const POST = createApiHandler({
  auth: false,
  handler: async (req: NextRequest) => {
    // CSRF check — auth:false disables the handler's built-in check
    const { validateCsrf } = await import("@/lib/security/csrf");
    const csrfError = validateCsrf(req);
    if (csrfError) return csrfError;

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const caps = await resolveCapabilities(session.user.role);
    if (!caps.has("system.plugins")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalidRequest" }, { status: 400 });
    }

    const { provider, apiKey, model } = parsed.data;

    // Make a minimal API call to test the connection
    let response: Response;

    switch (provider) {
      case "openai":
        response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          signal: AbortSignal.timeout(TEST_CONNECTION_TIMEOUT_MS),
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 1,
          }),
        });
        break;

      case "claude":
        response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          signal: AbortSignal.timeout(TEST_CONNECTION_TIMEOUT_MS),
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 1,
          }),
        });
        break;

      case "gemini": {
        const { SAFE_GEMINI_MODEL_PATTERN } = await import("@/lib/plugins/chat-widget/providers");
        if (!SAFE_GEMINI_MODEL_PATTERN.test(model)) {
          return NextResponse.json({ error: "invalidModel" }, { status: 400 });
        }
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          signal: AbortSignal.timeout(TEST_CONNECTION_TIMEOUT_MS),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Hi" }] }],
            generationConfig: { maxOutputTokens: 1 },
          }),
        });
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
    }

    if (!response.ok) {
      const text = await response.text();
      logger.warn({ status: response.status, body: text.slice(0, 500) }, "Test connection failed");
      return NextResponse.json({ success: false, error: `connectionFailed_${response.status}` });
    }

    return NextResponse.json({ success: true });
  },
});

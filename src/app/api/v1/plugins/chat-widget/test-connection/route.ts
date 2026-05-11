import { NextResponse } from "next/server";
import { z } from "zod";
import { createApiHandler } from "@/lib/api/handler";
import { getPluginState } from "@/lib/plugins/data";
import { SAFE_GEMINI_MODEL_PATTERN } from "@/lib/plugins/chat-widget/providers";
import { logger } from "@/lib/logger";

const OPENAI_MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const CLAUDE_MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

const requestSchema = z.object({
  provider: z.enum(["openai", "claude", "gemini"]),
  model: z.string().min(1),
});

const TEST_CONNECTION_TIMEOUT_MS = 15_000;

export const POST = createApiHandler({
  auth: { capabilities: ["system.plugins"] },
  rateLimit: "plugins:chat-widget:test-connection",
  schema: requestSchema,
  handler: async (_req, { body }) => {
    const { provider, model } = body;

    // Validate model names against strict patterns to prevent injection
    if (provider === "openai" && !OPENAI_MODEL_PATTERN.test(model)) {
      return NextResponse.json({ error: "invalidModel" }, { status: 400 });
    }
    if (provider === "claude" && !CLAUDE_MODEL_PATTERN.test(model)) {
      return NextResponse.json({ error: "invalidModel" }, { status: 400 });
    }
    if (provider === "gemini" && !SAFE_GEMINI_MODEL_PATTERN.test(model)) {
      return NextResponse.json({ error: "invalidModel" }, { status: 400 });
    }

    // Retrieve the stored encrypted API key from the database instead of
    // accepting it from the request body. This prevents SSRF via
    // attacker-controlled API keys and ensures the test reflects the
    // actual saved configuration.
    const pluginState = await getPluginState("chat-widget", { includeSecrets: true });
    if (!pluginState) {
      return NextResponse.json({ error: "notConfigured" }, { status: 400 });
    }

    const config = pluginState.config as Record<string, unknown>;
    let apiKey: string | undefined;

    switch (provider) {
      case "openai":
        apiKey = config.openaiApiKey as string | undefined;
        break;
      case "claude":
        apiKey = config.claudeApiKey as string | undefined;
        break;
      case "gemini":
        apiKey = config.geminiApiKey as string | undefined;
        break;
    }

    if (!apiKey) {
      return NextResponse.json({ error: "apiKeyNotConfigured" }, { status: 400 });
    }

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
        return NextResponse.json({ error: "unknownProvider" }, { status: 400 });
    }

    if (!response.ok) {
      const text = await response.text();
      logger.warn({ status: response.status, body: text.slice(0, 500) }, "Test connection failed");
      return NextResponse.json({ success: false, error: `connectionFailed_${response.status}` });
    }

    return NextResponse.json({ success: true });
  },
});

import { z } from "zod";

// ── Zod Schemas for provider response parsing ────────────────────────────────

const OpenAIToolCallSchema = z.object({
  id: z.string(),
  function: z.object({ name: z.string(), arguments: z.string() }),
});

const ClaudeToolUseBlockSchema = z.object({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
});

const ClaudeTextBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const GeminiFunctionCallPartSchema = z.object({
  functionCall: z.object({ name: z.string(), args: z.record(z.string(), z.unknown()) }),
});

const GeminiTextPartSchema = z.object({
  text: z.string(),
});

// ── Provider interfaces ──────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface StreamParams {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
}

export interface ToolDefinitionInput {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolChatResponse {
  type: "text" | "tool_calls";
  text?: string;
  toolCalls?: ToolCall[];
  // Provider-specific raw message to append to conversation for next iteration
  rawAssistantMessage: unknown;
}

interface ToolChatParams {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  tools: ToolDefinitionInput[];
}

interface ChatProvider {
  stream(params: StreamParams): Promise<ReadableStream<Uint8Array>>;
  chatWithTools(params: ToolChatParams): Promise<ToolChatResponse>;
  formatToolResult(toolCallId: string, toolName: string, result: string): ChatMessage | Record<string, unknown>;
}

const PROVIDER_REQUEST_TIMEOUT_MS = 25_000;

// ── OpenAI ──────────────────────────────────────────────────────────────────

const openaiProvider: ChatProvider = {
  async stream({ apiKey, model, messages, maxTokens }) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    if (!response.body) throw new Error("No response body from OpenAI");

    return transformSSE(response.body, (data) => {
      if (data === "[DONE]") return null;
      try {
        const parsed = JSON.parse(data);
        return parsed.choices?.[0]?.delta?.content ?? null;
      } catch {
        return null;
      }
    });
  },

  async chatWithTools({ apiKey, model, messages, maxTokens, tools }) {
    const openaiTools = tools.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, tools: openaiTools }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    const data: Record<string, unknown> = await response.json().catch(() => ({}));
    const choices = data.choices as Array<{ message?: { tool_calls?: unknown[]; content?: string } }> | undefined;
    const msg = choices?.[0]?.message;

    if (msg?.tool_calls && msg.tool_calls.length > 0) {
      return {
        type: "tool_calls" as const,
        toolCalls: msg.tool_calls.map((raw: unknown) => {
          const tc = OpenAIToolCallSchema.parse(raw);
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* malformed response */ }
          return {
            id: tc.id,
            name: tc.function.name,
            arguments: args,
          };
        }),
        rawAssistantMessage: msg,
      };
    }

    return {
      type: "text" as const,
      text: msg?.content ?? "",
      rawAssistantMessage: msg,
    };
  },

  formatToolResult(toolCallId: string, _toolName: string, result: string) {
    return { role: "tool" as const, tool_call_id: toolCallId, content: result };
  },
};

// ── Claude ───────────────────────────────────────────────────────────────────

const claudeProvider: ChatProvider = {
  async stream({ apiKey, model, messages, maxTokens }) {
    // Separate system message from user/assistant messages
    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      model,
      messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens,
      stream: true,
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Claude API error ${response.status}: ${text}`);
    }

    if (!response.body) throw new Error("No response body from Claude");

    return transformSSE(response.body, (data) => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
          return parsed.delta.text ?? null;
        }
        return null;
      } catch {
        return null;
      }
    });
  },

  async chatWithTools({ apiKey, model, messages, maxTokens, tools }) {
    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    const claudeTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    const body: Record<string, unknown> = {
      model,
      messages: chatMessages,
      max_tokens: maxTokens,
      tools: claudeTools,
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Claude API error ${response.status}: ${text}`);
    }

    const data: Record<string, unknown> = await response.json().catch(() => ({}));
    const content = (data.content ?? []) as unknown[];
    const toolUseBlocks = content.filter((raw: unknown) => ClaudeToolUseBlockSchema.safeParse(raw).success);
    const textBlocks = content.filter((raw: unknown) => ClaudeTextBlockSchema.safeParse(raw).success);

    if (toolUseBlocks.length > 0) {
      return {
        type: "tool_calls" as const,
        toolCalls: toolUseBlocks.map((raw: unknown) => {
          const b = ClaudeToolUseBlockSchema.parse(raw);
          return {
            id: b.id,
            name: b.name,
            arguments: b.input ?? {},
          };
        }),
        rawAssistantMessage: { role: "assistant", content: data.content },
      };
    }

    return {
      type: "text" as const,
      text: textBlocks.map((raw: unknown) => ClaudeTextBlockSchema.parse(raw).text).join("") || "",
      rawAssistantMessage: { role: "assistant", content: data.content },
    };
  },

  formatToolResult(toolCallId: string, _toolName: string, result: string) {
    return {
      role: "user" as const,
      content: [{ type: "tool_result", tool_use_id: toolCallId, content: result }],
    };
  },
};

// ── Gemini ───────────────────────────────────────────────────────────────────

/** Reject model identifiers that could cause path traversal in the Gemini API URL. */
export const SAFE_GEMINI_MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function validateGeminiModel(model: string): void {
  if (!SAFE_GEMINI_MODEL_PATTERN.test(model)) {
    throw new Error(`Invalid Gemini model identifier: ${model}`);
  }
}

const geminiProvider: ChatProvider = {
  async stream({ apiKey, model, messages, maxTokens }) {
    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    const contents = chatMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: { maxOutputTokens: maxTokens },
    };

    if (systemMessage) {
      body.systemInstruction = { parts: [{ text: systemMessage.content }] };
    }

    validateGeminiModel(model);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${text}`);
    }

    if (!response.body) throw new Error("No response body from Gemini");

    return transformSSE(response.body, (data) => {
      try {
        const parsed = JSON.parse(data);
        return parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
      } catch {
        return null;
      }
    });
  },

  async chatWithTools({ apiKey, model, messages, maxTokens, tools }) {
    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    const contents = chatMessages.map((m) => {
      // Handle regular messages
      if (typeof m.content === "string") {
        return {
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        };
      }
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts: Array.isArray(m.content) ? m.content : [{ text: String(m.content) }],
      };
    });

    const body: Record<string, unknown> = {
      contents,
      generationConfig: { maxOutputTokens: maxTokens },
      tools: [{
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      }],
    };

    if (systemMessage) {
      body.systemInstruction = { parts: [{ text: systemMessage.content }] };
    }

    validateGeminiModel(model);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${text}`);
    }

    const data: Record<string, unknown> = await response.json().catch(() => ({}));
    const parts = ((data.candidates as Array<Record<string, unknown>> | undefined)?.[0]?.content as Record<string, unknown> | undefined)?.parts as unknown[] | undefined ?? [];
    const functionCalls = parts.filter((raw: unknown) => GeminiFunctionCallPartSchema.safeParse(raw).success);
    const textParts = parts.filter((raw: unknown) => GeminiTextPartSchema.safeParse(raw).success);

    if (functionCalls.length > 0) {
      return {
        type: "tool_calls" as const,
        toolCalls: functionCalls.map((raw: unknown, i: number) => {
          const p = GeminiFunctionCallPartSchema.parse(raw);
          return {
            id: `gemini-${i}`,
            name: p.functionCall.name,
            arguments: p.functionCall.args ?? {},
          };
        }),
        rawAssistantMessage: { role: "model", parts },
      };
    }

    return {
      type: "text" as const,
      text: textParts.map((raw: unknown) => GeminiTextPartSchema.parse(raw).text).join("") || "",
      rawAssistantMessage: { role: "model", parts },
    };
  },

  formatToolResult(toolCallId: string, toolName: string, result: string) {
    // Gemini requires the function name to match the declared functionDeclaration name
    return {
      role: "user" as const,
      content: [{ functionResponse: { name: toolName, response: { result } } }],
    };
  },
};

// ── SSE Parser ───────────────────────────────────────────────────────────────

function transformSSE(
  body: ReadableStream<Uint8Array>,
  extractText: (data: string) => string | null
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (!data) continue;

            const text = extractText(data);
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith("data:")) {
            const data = trimmed.slice(5).trim();
            if (data) {
              const text = extractText(data);
              if (text) {
                controller.enqueue(encoder.encode(text));
              }
            }
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });
}

// ── Public API ──────────────────────────────────────────────────────────────

const providers: Record<string, ChatProvider> = {
  openai: openaiProvider,
  claude: claudeProvider,
  gemini: geminiProvider,
};

export function getProvider(name: string): ChatProvider {
  const provider = providers[name];
  if (!provider) throw new Error(`Unknown chat provider: ${name}`);
  return provider;
}

export type { ToolChatParams };

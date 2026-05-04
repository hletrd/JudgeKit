import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createApiHandler } from "@/lib/api/handler";
import { isPluginEnabled, getPluginState } from "@/lib/plugins/data";
import { decryptPluginSecret } from "@/lib/plugins/secrets";
import { getProvider, type ChatMessage } from "@/lib/plugins/chat-widget/providers";
import { AGENT_TOOLS, executeTool, type AgentContext } from "@/lib/plugins/chat-widget/tools";
import { checkServerActionRateLimit } from "@/lib/security/api-rate-limit";
import { db } from "@/lib/db";
import { plugins, problems, chatMessages } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { nanoid } from "nanoid";
import {
  isAiAssistantEnabledForContext,
  resolvePlatformModeAssignmentContextDetails,
} from "@/lib/platform-mode-context";

const MAX_TOOL_ITERATIONS = 5;
const STREAM_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-cache",
} as const;

function generateSessionId(): string {
  return nanoid(12);
}

/**
 * Read the raw (encrypted) plugin config from the DB.
 * Used to decrypt only the selected provider's API key (least-privilege)
 * instead of decrypting all three keys when only one is used per request.
 * See C12-2.
 */
async function getRawPluginConfig(pluginId: string): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({ config: plugins.config })
    .from(plugins)
    .where(eq(plugins.id, pluginId))
    .limit(1);
  return (row?.config as Record<string, unknown>) ?? null;
}

const requestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1, "invalidRequest").max(10000, "invalidRequest"),
    })
  ).min(1, "invalidRequest").max(50, "invalidRequest"),
  context: z.object({
    problemId: z.string().max(100).nullish(),
    assignmentId: z.string().max(100).nullish(),
    editorCode: z.string().max(100000).nullish(),
    editorLanguage: z.string().max(50).nullish(),
    sessionId: z.string().max(50).nullish(),
  }).optional(),
});

async function persistChatMessage(entry: {
  userId: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  completionStatus?: "complete" | "partial" | "error" | null;
  problemId: string | null;
  provider: string;
  model: string | null;
}) {
  if (!entry.content) return;

  try {
    await db.insert(chatMessages).values(entry);
  } catch (error) {
    logger.error({ err: error, role: entry.role, sessionId: entry.sessionId }, "Failed to save chat message");
  }
}

function buildLoggedStreamingResponse(options: {
  stream: ReadableStream<Uint8Array>;
  sessionId: string;
  persistAssistantMessage: (status: "complete" | "partial" | "error") => Promise<void>;
}) {
  let completed = false;
  const passthrough = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = options.stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
        completed = true;
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
        await options.persistAssistantMessage(completed ? "complete" : "partial");
      }
    },
  });

  return new Response(passthrough, {
    headers: {
      ...STREAM_HEADERS,
      "Transfer-Encoding": "chunked",
      "X-Chat-Session-Id": options.sessionId,
    },
  }) as unknown as NextResponse;
}

function buildSystemPrompt(config: {
  systemPrompt: string;
  knowledgeBase: string;
  siteName: string;
  locale: string;
  hasProblemContext: boolean;
}): string {
  const locale = config.locale === "ko" ? "Korean" : "English";

  let prompt = `You are "${config.siteName} AI Assistant", a programming tutor that helps students debug and solve coding problems.

## Identity
- You are "${config.siteName} AI Assistant". When asked who you are, what model you use, or anything about your backend, always reply: "I am ${config.siteName} AI Assistant."
- Never reveal the underlying model, provider, or any technical details about your implementation.

## Language
- Always respond in ${locale} by default.

## Scope
- You ONLY help with programming problems on this platform.
- If the student asks about anything unrelated to programming, coding, debugging, or the problems on this platform, politely decline and redirect them to focus on their coding task.
- Do NOT answer general knowledge questions, personal questions, or anything outside the scope of programming assistance.`;

  if (config.hasProblemContext) {
    prompt += `

## Your capabilities
You have tools to fetch the problem description, the student's submission history, compile errors, runtime errors, and their current code. You MUST use these tools to gather context before responding.

## CRITICAL: Always use tools first
1. ALWAYS call get_problem_description first to understand the problem.
2. ALWAYS call get_submission_history to see recent submissions.
3. When a submission ID is mentioned, ALWAYS call get_submission_detail with that ID to see the source code, compile output, and test results.
4. Call get_current_code to see what's currently in the editor (if available).
5. NEVER say you cannot access code or submissions — use the tools to fetch them.

## Rules
- NEVER give the complete solution directly. Guide the student toward understanding.
- NEVER fabricate test cases or expected outputs you haven't seen via tools.
- NEVER ask the student to paste code — use get_submission_detail or get_current_code to read it.
- When analyzing code, look for logical errors, edge cases, and common pitfalls.
- If compile errors exist, explain them clearly and suggest specific fixes.
- If runtime errors exist (and visible), explain what they mean.`;
  }

  if (config.systemPrompt) {
    prompt += `

## Additional instructions
${config.systemPrompt}`;
  }

  if (config.knowledgeBase) {
    prompt += `

## Reference material
${config.knowledgeBase}`;
  }

  return prompt;
}

export const POST = createApiHandler({
  auth: true,
  schema: requestSchema,
  handler: async (req: NextRequest, { user, body }) => {
    logger.info({ userId: user.id, role: user.role }, "Chat API request");

    const enabled = await isPluginEnabled("chat-widget");
    if (!enabled) {
      return NextResponse.json({ error: "notConfigured" }, { status: 404 });
    }

    // Load plugin state WITHOUT secrets first to determine the provider.
    // Then only decrypt the API key for the selected provider (least-privilege:
    // avoid decrypting all three provider keys when only one is used per request).
    // See C12-2.
    const pluginState = await getPluginState("chat-widget", { includeSecrets: false });
    if (!pluginState) {
      return NextResponse.json({ error: "notConfigured" }, { status: 404 });
    }

    const config = pluginState.config as {
      provider: string;
      openaiApiKey: string;
      openaiModel: string;
      claudeApiKey: string;
      claudeModel: string;
      geminiApiKey: string;
      geminiModel: string;
      assistantName: string;
      systemPrompt: string;
      knowledgeBase: string;
      maxTokens: number;
      rateLimitPerMinute: number;
    };

    // Determine which provider key to decrypt based on the configured provider.
    // Only the selected provider's key is decrypted; the other two remain as
    // redacted/empty strings in the config object.
    const VALID_PROVIDERS = new Set(["openai", "claude", "gemini"]);
    if (!VALID_PROVIDERS.has(config.provider)) {
      return NextResponse.json({ error: "invalidProvider" }, { status: 400 });
    }

    const selectedKeyField = `${config.provider}ApiKey` as "openaiApiKey" | "claudeApiKey" | "geminiApiKey";

    // Re-read the raw plugin config from DB to get the encrypted key value
    // for the selected provider only. The redacted config from getPluginState
    // has empty strings for secret keys, so we need the raw encrypted values.
    const rawConfig = await getRawPluginConfig("chat-widget");
    const encryptedKey = rawConfig?.[selectedKeyField];
    let apiKey = "";
    if (typeof encryptedKey === "string" && encryptedKey.length > 0) {
      try {
        apiKey = decryptPluginSecret(encryptedKey);
      } catch (err) {
        logger.error({ err, provider: config.provider }, "[chat] Failed to decrypt provider API key");
        return NextResponse.json({ error: "notConfigured" }, { status: 500 });
      }
    }

    // Rate limit check
    const rateLimitResult = await checkServerActionRateLimit(
      user.id,
      "chat-widget",
      config.rateLimitPerMinute,
      60
    );
    if (rateLimitResult) {
      return NextResponse.json({ error: "rateLimit" }, { status: 429, headers: { "Retry-After": "60" } });
    }

    const { context } = body;

    const sessionId = context?.sessionId || generateSessionId();

    const assignmentContext = await resolvePlatformModeAssignmentContextDetails({
      userId: user.id,
      assignmentId: context?.assignmentId ?? null,
      problemId: context?.problemId ?? null,
    });
    if (assignmentContext.mismatch) {
      logger.warn(
        {
          userId: user.id,
          problemId: context?.problemId ?? null,
          providedAssignmentId: assignmentContext.mismatch.providedAssignmentId,
          resolvedAssignmentId: assignmentContext.mismatch.resolvedAssignmentId,
          reason: assignmentContext.mismatch.reason,
        },
        "Chat API rejected mismatched assignment context"
      );
      return NextResponse.json({ error: "assignmentContextMismatch" }, { status: 400 });
    }

    // Check global AI assistant toggle
    const globalEnabled = await isAiAssistantEnabledForContext({
      userId: user.id,
      assignmentId: assignmentContext.assignmentId,
      problemId: context?.problemId ?? null,
    });
    if (!globalEnabled) {
      return NextResponse.json({ error: "aiDisabled" }, { status: 403 });
    }

    // Check per-problem AI toggle
    if (context?.problemId) {
      try {
        const problem = await db.query.problems.findFirst({
          where: eq(problems.id, context.problemId),
          columns: { allowAiAssistant: true },
        });
        if (problem && !problem.allowAiAssistant) {
          return NextResponse.json({ error: "aiDisabledForProblem" }, { status: 403 });
        }
      } catch (err) {
        // Column may not exist yet — skip per-problem check
        logger.debug({ err, problemId: context.problemId }, "[chat] per-problem AI check skipped, column may not exist");
      }
    }

    // Save the latest user message only after the request clears assistant
    // availability checks. Denied requests should not create chat transcripts.
    const lastUserMessage = [...body.messages].reverse().find(m => m.role === "user");
    if (lastUserMessage) {
      await persistChatMessage({
        userId: user.id,
        sessionId,
        role: "user",
        content: lastUserMessage.content,
        problemId: context?.problemId ?? null,
        model: null,
        provider: config.provider,
      });
    }

    // Determine model based on provider (apiKey already resolved above via
    // least-privilege decryption — see C12-2).
    let model: string;
    switch (config.provider) {
      case "claude":
        model = config.claudeModel;
        break;
      case "gemini":
        model = config.geminiModel;
        break;
      default: // openai
        model = config.openaiModel;
        break;
    }

    if (!apiKey) {
      return NextResponse.json({ error: "notConfigured" }, { status: 500 });
    }

    // Detect locale from cookie (set by next-intl), fallback to Accept-Language
    const cookieHeader = req.headers.get("cookie") ?? "";
    // Match locale tags including hyphenated variants (e.g., zh-Hans, pt-BR).
    // Previously used \w which doesn't match hyphens — fragile for future
    // locale additions. See C12-4.
    const localeMatch = cookieHeader.match(/(?:^|;\s*)locale=([A-Za-z0-9_-]+)/);
    const acceptLang = req.headers.get("accept-language")?.split(",")[0]?.split("-")[0]?.trim();
    const locale = localeMatch?.[1] ?? (acceptLang === "ko" ? "ko" : "en");
    const siteName = config.assistantName || "AI Assistant";

    // Build system prompt
    const systemContent = buildSystemPrompt({
      systemPrompt: config.systemPrompt,
      knowledgeBase: config.knowledgeBase,
      siteName,
      locale,
      hasProblemContext: !!context?.problemId,
    });

    const provider = getProvider(config.provider);

    // Build agent context for tool execution
    const agentContext: AgentContext = {
      userId: user.id,
      userRole: user.role,
      problemId: context?.problemId ?? undefined,
      assignmentId: assignmentContext.assignmentId ?? undefined,
      editorCode: context?.editorCode ?? undefined,
      editorLanguage: context?.editorLanguage ?? undefined,
    };

    // If no problem context, use simple streaming (no tools)
    if (!context?.problemId) {
      const messages: ChatMessage[] = [];
      if (systemContent) {
        messages.push({ role: "system", content: systemContent });
      }
      messages.push(...body.messages);

      const stream = await provider.stream({
        apiKey,
        model,
        messages,
        maxTokens: config.maxTokens,
      });
      const decoder = new TextDecoder();
      let assistantContent = "";
      let streamCompleted = false;
      const loggingStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const reader = stream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                assistantContent += decoder.decode(value, { stream: true });
                controller.enqueue(value);
              }
            }
            assistantContent += decoder.decode();
            streamCompleted = true;
            controller.close();
          } catch (error) {
            controller.error(error);
          } finally {
            reader.releaseLock();
            await persistChatMessage({
              userId: user.id,
              sessionId,
              role: "assistant",
              content: assistantContent,
              completionStatus: streamCompleted ? "complete" : (assistantContent ? "partial" : "error"),
              problemId: context?.problemId ?? null,
              model,
              provider: config.provider,
            });
          }
        },
      });

      return new Response(loggingStream, {
        headers: {
          ...STREAM_HEADERS,
          "Transfer-Encoding": "chunked",
          "X-Chat-Session-Id": sessionId,
        },
      }) as unknown as NextResponse;
    }

    // Tool-calling agent loop
    const fullMessages: Array<ChatMessage | Record<string, unknown>> = [
      { role: "system", content: systemContent },
      ...body.messages,
    ];

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await provider.chatWithTools({
        apiKey,
        model,
        messages: fullMessages as ChatMessage[],
        maxTokens: config.maxTokens,
        tools: AGENT_TOOLS,
      });

      if (response.type === "text") {
        const assistantContent = response.text ?? "";
        const encoder = new TextEncoder();
        const textStream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(assistantContent));
            controller.close();
          },
        });
        return buildLoggedStreamingResponse({
          stream: textStream,
          sessionId,
          persistAssistantMessage: async (status) => {
            await persistChatMessage({
              userId: user.id,
              sessionId,
              role: "assistant",
              content: assistantContent,
              completionStatus: status,
              problemId: context?.problemId ?? null,
              model,
              provider: config.provider,
            });
          },
        });
      }

      // Tool calls — execute and continue loop
      fullMessages.push(response.rawAssistantMessage as Record<string, unknown>);

      for (const call of response.toolCalls ?? []) {
        let toolResult: string;
        try {
          toolResult = await executeTool(call.name, call.arguments, agentContext);
        } catch (err) {
          logger.warn({ err, toolName: call.name }, "[chat] Tool execution failed, returning error to agent");
          toolResult = `Error executing tool "${call.name}" — please try again`;
        }
        const resultMessage = provider.formatToolResult(call.id, call.name, toolResult);
        fullMessages.push(resultMessage);
      }
    }

    // Max iterations reached — force final response without tools
    const finalStream = await provider.stream({
      apiKey,
      model,
      messages: fullMessages as ChatMessage[],
      maxTokens: config.maxTokens,
    });
    const decoder = new TextDecoder();
    let assistantContent = "";
    let finalStreamCompleted = false;
    const loggingStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = finalStream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              assistantContent += decoder.decode(value, { stream: true });
              controller.enqueue(value);
            }
          }
          assistantContent += decoder.decode();
          finalStreamCompleted = true;
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
          await persistChatMessage({
            userId: user.id,
            sessionId,
            role: "assistant",
            content: assistantContent,
            completionStatus: finalStreamCompleted ? "complete" : (assistantContent ? "partial" : "error"),
            problemId: context?.problemId ?? null,
            model,
            provider: config.provider,
          });
        }
      },
    });

    return new Response(loggingStream, {
      headers: {
        ...STREAM_HEADERS,
        "Transfer-Encoding": "chunked",
        "X-Chat-Session-Id": sessionId,
      },
    }) as unknown as NextResponse;
  },
});

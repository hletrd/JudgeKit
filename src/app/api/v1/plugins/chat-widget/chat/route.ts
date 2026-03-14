import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getLocale } from "next-intl/server";
import { isPluginEnabled, getPluginState } from "@/lib/plugins/data";
import { getProvider, type ChatMessage } from "@/lib/plugins/chat-widget/providers";
import { AGENT_TOOLS, executeTool, type AgentContext } from "@/lib/plugins/chat-widget/tools";
import { checkServerActionRateLimit } from "@/lib/security/api-rate-limit";
import { isAiAssistantEnabled } from "@/lib/system-settings";
import { db } from "@/lib/db";
import { problems, chatMessages } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { nanoid } from "nanoid";

const MAX_TOOL_ITERATIONS = 5;

function generateSessionId(): string {
  return nanoid(12);
}

const requestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(10000),
    })
  ).min(1).max(50),
  context: z.object({
    problemId: z.string().max(100).optional(),
    assignmentId: z.string().max(100).optional(),
    editorCode: z.string().max(100000).optional(),
    editorLanguage: z.string().max(50).optional(),
    sessionId: z.string().max(50).optional(),
  }).optional(),
});

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
You have tools to fetch the problem description, the student's submission history, compile errors, runtime errors, and their current code. Use these tools to understand the context before giving advice.

## Rules
- NEVER give the complete solution directly. Guide the student toward understanding.
- NEVER fabricate test cases or expected outputs you haven't seen via tools.
- When the student shares code, analyze it for logical errors, edge cases, and common pitfalls.
- If compile errors exist, explain them clearly and suggest specific fixes.
- If runtime errors exist (and visible), explain what they mean.
- Always start by fetching the problem description to understand what the student is working on.`;
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

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const enabled = await isPluginEnabled("chat-widget");
    if (!enabled) {
      return NextResponse.json({ error: "notConfigured" }, { status: 404 });
    }

    const pluginState = await getPluginState("chat-widget");
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
      systemPrompt: string;
      knowledgeBase: string;
      maxTokens: number;
      rateLimitPerMinute: number;
    };

    // Rate limit check
    const rateLimitResult = checkServerActionRateLimit(
      session.user.id,
      "chat-widget",
      config.rateLimitPerMinute,
      60
    );
    if (rateLimitResult) {
      return NextResponse.json({ error: "rateLimit" }, { status: 429 });
    }

    // Parse and validate request body
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalidRequest" }, { status: 400 });
    }

    const { context } = parsed.data;

    const sessionId = context?.sessionId || generateSessionId();

    // Save the latest user message
    const lastUserMessage = [...parsed.data.messages].reverse().find(m => m.role === "user");
    if (lastUserMessage) {
      try {
        await db.insert(chatMessages).values({
          userId: session.user.id,
          sessionId,
          role: "user",
          content: lastUserMessage.content,
          problemId: context?.problemId ?? null,
          model: null,
          provider: config.provider,
        });
      } catch (e) {
        // Don't fail the request if logging fails
        logger.error({ err: e }, "Failed to save chat message");
      }
    }

    // Also save any previous assistant message that wasn't saved yet
    // (the client sends full history, so the second-to-last message from assistant is the previous response)
    if (parsed.data.messages.length >= 2) {
      const prevAssistant = parsed.data.messages[parsed.data.messages.length - 2];
      if (prevAssistant?.role === "assistant" && prevAssistant.content) {
        try {
          await db.insert(chatMessages).values({
            userId: session.user.id,
            sessionId,
            role: "assistant",
            content: prevAssistant.content,
            problemId: context?.problemId ?? null,
            model: null,
            provider: config.provider,
          });
        } catch (e) {
          logger.error({ err: e }, "Failed to save assistant message");
        }
      }
    }

    // Check global AI assistant toggle
    const globalEnabled = await isAiAssistantEnabled();
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
      } catch {
        // Column may not exist yet — skip per-problem check
      }
    }

    // Determine API key and model based on provider
    let apiKey: string;
    let model: string;
    switch (config.provider) {
      case "claude":
        apiKey = config.claudeApiKey;
        model = config.claudeModel;
        break;
      case "gemini":
        apiKey = config.geminiApiKey;
        model = config.geminiModel;
        break;
      default: // openai
        apiKey = config.openaiApiKey;
        model = config.openaiModel;
        break;
    }

    if (!apiKey) {
      return NextResponse.json({ error: "notConfigured" }, { status: 500 });
    }

    const locale = await getLocale();
    const siteName = "JudgeKit"; // TODO: read from system settings if needed

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
      userId: session.user.id,
      userRole: session.user.role,
      problemId: context?.problemId,
      assignmentId: context?.assignmentId,
      editorCode: context?.editorCode,
      editorLanguage: context?.editorLanguage,
    };

    // If no problem context, use simple streaming (no tools)
    if (!context?.problemId) {
      const messages: ChatMessage[] = [];
      if (systemContent) {
        messages.push({ role: "system", content: systemContent });
      }
      messages.push(...parsed.data.messages);

      const stream = await provider.stream({
        apiKey,
        model,
        messages,
        maxTokens: config.maxTokens,
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
          "Transfer-Encoding": "chunked",
          "X-Chat-Session-Id": sessionId,
        },
      });
    }

    // Tool-calling agent loop
    const fullMessages: any[] = [
      { role: "system", content: systemContent },
      ...parsed.data.messages,
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
        // Final text response — return as stream
        const encoder = new TextEncoder();
        const textStream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(response.text ?? ""));
            controller.close();
          },
        });

        return new Response(textStream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
            "X-Chat-Session-Id": sessionId,
          },
        });
      }

      // Tool calls — execute and continue loop
      fullMessages.push(response.rawAssistantMessage);

      for (const call of response.toolCalls ?? []) {
        const toolResult = await executeTool(call.name, call.arguments, agentContext);
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

    return new Response(finalStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
        "X-Chat-Session-Id": sessionId,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Chat widget API error");
    return NextResponse.json({ error: "internalError" }, { status: 500 });
  }
}

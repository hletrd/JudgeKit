import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { submissions, submissionComments } from "@/lib/db/schema";
import { isPluginEnabled, getPluginState } from "@/lib/plugins/data";
import { getProvider } from "@/lib/plugins/chat-widget/providers";
import { isAiAssistantEnabledForContext } from "@/lib/platform-mode-context";
import { logger } from "@/lib/logger";

/**
 * Trigger an AI code review for an accepted submission.
 * Runs in the background — errors are logged but do not affect the judge result.
 */
export async function triggerAutoCodeReview(submissionId: string): Promise<void> {
  try {
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
      columns: {
        id: true,
        userId: true,
        sourceCode: true,
        language: true,
        executionTimeMs: true,
        memoryUsedKb: true,
        assignmentId: true,
      },
      with: {
        user: {
          columns: { preferredLanguage: true },
        },
        problem: {
          columns: { title: true, description: true, allowAiAssistant: true },
        },
      },
    });

    if (!submission || !submission.sourceCode) return;

    const globalEnabled = await isAiAssistantEnabledForContext({
      userId: submission.userId,
      assignmentId: submission.assignmentId,
    });
    if (!globalEnabled) return;

    // Check if chat-widget plugin is enabled and configured
    const pluginEnabled = await isPluginEnabled("chat-widget");
    if (!pluginEnabled) return;

    const pluginState = await getPluginState("chat-widget", { includeSecrets: true });
    if (!pluginState) return;

    const config = pluginState.config as {
      provider: string;
      openaiApiKey: string;
      openaiModel: string;
      claudeApiKey: string;
      claudeModel: string;
      geminiApiKey: string;
      geminiModel: string;
      maxTokens: number;
    };

    // Determine API key and model
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
      default:
        apiKey = config.openaiApiKey;
        model = config.openaiModel;
        break;
    }

    if (!apiKey) return;

    const problemTitle = submission.problem?.title ?? "Unknown";
    const problemDescription = submission.problem?.description ?? "";

    // Check if per-problem AI is enabled
    if (submission.problem && !submission.problem.allowAiAssistant) return;

    // Determine review language from user preference, default to Korean
    const reviewLanguage = submission.user?.preferredLanguage ?? "ko";

    // Check if we already have an AI comment for this submission
    const existingAiComment = await db.query.submissionComments.findFirst({
      where: and(
        eq(submissionComments.submissionId, submissionId),
        isNull(submissionComments.authorId),
      ),
    });
    if (existingAiComment) return;

    const provider = getProvider(config.provider);

    const languageInstruction =
      reviewLanguage === "ko"
        ? "Always respond in Korean (한국어)."
        : reviewLanguage === "en"
          ? "Always respond in English."
          : `Always respond in the language matching locale code "${reviewLanguage}".`;

    const systemPrompt = `You are an expert code reviewer for a programming education platform. Your role is to provide constructive, educational feedback on student code that has been accepted (passed all test cases).

## Guidelines
- ${languageInstruction}
- Be encouraging but honest about areas for improvement.
- Focus on: code style, efficiency, readability, best practices, potential edge cases.
- Keep feedback concise (3-8 bullet points).
- Do NOT mention that the code passed tests — the student already knows.
- Do NOT rewrite the entire solution — give targeted suggestions.
- Use markdown formatting for clarity.
- If the code is already excellent, say so briefly and mention one minor improvement or an advanced technique.`;

    const userPrompt = `Review the student's ${submission.language} code for the problem "${problemTitle}".

${problemDescription ? `## Problem Description\n${problemDescription.slice(0, 2000)}\n` : ""}## Source Code (${submission.language})
\`\`\`${submission.language}
${submission.sourceCode}
\`\`\`

${submission.executionTimeMs !== null ? `Execution time: ${submission.executionTimeMs}ms` : ""}
${submission.memoryUsedKb !== null ? `Memory used: ${submission.memoryUsedKb}KB` : ""}`;

    // Use non-streaming chat to get the full response, with a 30s timeout
    // to prevent resource leaks if the AI provider hangs.
    const AUTO_REVIEW_TIMEOUT_MS = 30_000;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), AUTO_REVIEW_TIMEOUT_MS);

    let response;
    try {
      response = await Promise.race([
        provider.chatWithTools({
          apiKey,
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxTokens: config.maxTokens || 1024,
          tools: [], // No tools needed for review
        }),
        new Promise<never>((_resolve, reject) => {
          timeoutController.signal.addEventListener("abort", () => {
            reject(new Error(`Auto code review timed out after ${AUTO_REVIEW_TIMEOUT_MS}ms`));
          });
        }),
      ]);
    } finally {
      clearTimeout(timeoutId);
    }

    const reviewText = response.type === "text" ? (response.text ?? "") : "";

    if (!reviewText.trim()) return;

    // Insert as comment with null authorId (AI Assistant)
    await db.insert(submissionComments).values({
      submissionId,
      authorId: null,
      content: reviewText.trim(),
    });

    logger.info({ submissionId }, "Auto code review comment posted");
  } catch (error) {
    // Never let review errors affect the judge pipeline
    logger.error({ err: error, submissionId }, "Auto code review failed");
  }
}

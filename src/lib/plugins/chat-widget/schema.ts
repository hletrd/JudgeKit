import { z } from "zod";

export const chatWidgetConfigSchema = z.object({
  provider: z.enum(["openai", "openrouter", "claude", "gemini"]).default("openai"),
  openaiApiKey: z.string().max(200).default(""),
  openaiModel: z.string().max(100).default("gpt-5-mini"),
  openrouterApiKey: z.string().max(200).default(""),
  openrouterModel: z.string().max(128).default("deepseek/deepseek-v4-flash"),
  claudeApiKey: z.string().max(200).default(""),
  claudeModel: z.string().max(100).default("claude-sonnet-4-6"),
  geminiApiKey: z.string().max(200).default(""),
  geminiModel: z.string().max(100).default("gemini-3.6-flash"),
  assistantName: z.string().max(100).default(""),
  systemPrompt: z.string().max(10000).default(""),
  knowledgeBase: z.string().max(50000).default(""),
  maxTokens: z.number().int().min(100).max(8192).default(2048),
  rateLimitPerMinute: z.number().int().min(1).max(100).default(10),
});

export type ChatWidgetConfig = z.infer<typeof chatWidgetConfigSchema>;

import type { PluginDefinition } from "@/lib/plugins/types";
import { chatWidgetConfigSchema } from "./schema";

export const chatWidgetPlugin: PluginDefinition = {
  id: "chat-widget",
  nameKey: "chatWidget.name",
  descriptionKey: "chatWidget.description",
  configSchema: chatWidgetConfigSchema,
  secretConfigKeys: ["openaiApiKey", "claudeApiKey", "geminiApiKey"],
  defaultConfig: {
    provider: "openai",
    openaiApiKey: "",
    openaiModel: "gpt-5-mini",
    claudeApiKey: "",
    claudeModel: "claude-sonnet-4-6",
    geminiApiKey: "",
    geminiModel: "gemini-3.1-flash-lite",
    assistantName: "",
    systemPrompt: "",
    knowledgeBase: "",
    maxTokens: 2048,
    rateLimitPerMinute: 10,
  },
  getAdminComponent: () => import("./admin-config"),
  getWidgetComponent: () => import("./chat-widget"),
};

import { isPluginEnabled } from "@/lib/plugins/data";
import { getPluginDefinition } from "@/lib/plugins/registry";
import { isAiAssistantEnabledForContext } from "@/lib/platform-mode-context";

export async function ChatWidgetLoader({
  userId,
  userRole,
}: {
  userId: string;
  userRole?: string | null;
}) {
  const [enabled, aiEnabled] = await Promise.all([
    isPluginEnabled("chat-widget"),
    isAiAssistantEnabledForContext({ userId, userRole }),
  ]);

  if (!enabled || !aiEnabled) return null;

  const definition = getPluginDefinition("chat-widget");
  if (!definition?.getWidgetComponent) return null;

  const { default: ChatWidget } = await definition.getWidgetComponent();
  return <ChatWidget />;
}

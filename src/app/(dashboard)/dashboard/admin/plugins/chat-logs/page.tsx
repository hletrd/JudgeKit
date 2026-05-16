import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { ChatLogsClient } from "./chat-logs-client";
import { DATA_RETENTION_DAYS } from "@/lib/data-retention";

export default async function ChatLogsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caps = await resolveCapabilities(session.user.role);
  if (!caps.has("system.chat_logs")) redirect("/dashboard");

  const t = await getTranslations("plugins.chatWidget");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div>
          <h2 className="text-2xl font-bold">{t("chatLogs")}</h2>
          <p className="text-sm text-muted-foreground">{t("chatLogsDescription")}</p>
        </div>
        <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <p>{t("chatLogsRetentionNotice", { days: DATA_RETENTION_DAYS.chatMessages })}</p>
        </div>
      </div>
      <ChatLogsClient />
    </div>
  );
}

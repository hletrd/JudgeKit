import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { ChatLogsClient } from "./chat-logs-client";

export default async function ChatLogsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin" && session.user.role !== "super_admin") redirect("/dashboard");

  const t = await getTranslations("plugins.chatWidget");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t("chatLogs")}</h2>
        <p className="text-sm text-muted-foreground">{t("chatLogsDescription")}</p>
      </div>
      <ChatLogsClient />
    </div>
  );
}

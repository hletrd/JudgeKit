import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { NO_INDEX_METADATA } from "@/lib/seo";
import { WorkersPageClient } from "./workers-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.workers");
  return { title: t("title"), ...NO_INDEX_METADATA };
}

export default async function AdminWorkersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caps = await resolveCapabilities(session.user.role);
  if (!caps.has("system.settings")) redirect("/dashboard");

  const t = await getTranslations("admin.workers");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div>
          <h2 className="text-2xl font-bold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {t("auditNotice")}
        </div>
      </div>
      <WorkersPageClient />
    </div>
  );
}

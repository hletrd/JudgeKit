import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { LanguageConfigTable } from "./language-config-table";
import { getDockerImageRuntimeInfo } from "@/lib/judge/languages";

export default async function AdminLanguagesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caps = await resolveCapabilities(session.user.role);
  if (!caps.has("system.settings")) redirect("/dashboard");

  const t = await getTranslations("admin.languages");
  const languages = await db.select().from(languageConfigs).orderBy(asc(languageConfigs.displayName), asc(languageConfigs.standard));

  // Enrich with runtime info
  const enrichedLanguages = languages.map(lang => ({
    ...lang,
    runtimeInfo: getDockerImageRuntimeInfo(lang.dockerImage),
  }));

  const enabledCount = languages.filter(l => l.isEnabled).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {t("languageCount", { enabled: enabledCount, total: languages.length })}
        </p>
      </div>
      <LanguageConfigTable languages={enrichedLanguages} />
    </div>
  );
}

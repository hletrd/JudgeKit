import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getJudgeLanguageDefinition } from "@/lib/judge/languages";
import { auth } from "@/lib/auth";
import { CompilerClient } from "./compiler-client";
import { getResolvedPlatformMode } from "@/lib/system-settings";
import { getPlatformModePolicy } from "@/lib/platform-mode";
import { getRecruitingAccessContext } from "@/lib/recruiting/access";

export default async function CompilerPage() {
  const session = await auth();
  const t = await getTranslations("compiler");
  const { effectivePlatformMode } = session?.user
    ? await getRecruitingAccessContext(session.user.id)
    : { effectivePlatformMode: await getResolvedPlatformMode() };

  if (getPlatformModePolicy(effectivePlatformMode).restrictStandaloneCompiler) {
    redirect("/dashboard");
  }

  const languages = (await db
    .select({
      id: languageConfigs.id,
      language: languageConfigs.language,
      displayName: languageConfigs.displayName,
      standard: languageConfigs.standard,
      extension: languageConfigs.extension,
    })
    .from(languageConfigs)
    .where(eq(languageConfigs.isEnabled, true)))
    .flatMap((lang) => {
      const definition = getJudgeLanguageDefinition(lang.language);
      if (!definition) return [];
      return [{
        ...lang,
        displayName: definition.displayName,
        standard: definition.standard,
        extension: definition.extension,
      }];
    });

  // CRITICAL FIX: Handle empty languages list
  if (languages.length === 0) {
    // In production, show an error page
    // In development, redirect to languages admin for quick setup
    if (process.env.NODE_ENV === "development") {
      redirect("/dashboard/admin/languages?no-enabled-languages=true");
    }
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-2xl font-bold">{t("noLanguagesTitle", { defaultValue: "No Languages Available" })}</h1>
          <p className="text-muted-foreground">
            {t("noLanguagesDescription", { defaultValue: "Please enable at least one language in the settings." })}
          </p>
        </div>
      </div>
    );
  }

  return <CompilerClient languages={languages} title={t("title")} description={t("description")} preferredLanguage={session?.user?.preferredLanguage ?? null} />;
}

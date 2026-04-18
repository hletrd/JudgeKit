import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEnabledCompilerLanguages } from "@/lib/compiler/catalog";
import { CompilerClient } from "./compiler-client";
import { getPlatformModePolicy } from "@/lib/platform-mode";
import { getEffectivePlatformMode } from "@/lib/platform-mode-context";

export default async function CompilerPage() {
  const session = await auth();
  const t = await getTranslations("compiler");
  const effectivePlatformMode = await getEffectivePlatformMode({
    userId: session?.user?.id ?? null,
  });

  if (getPlatformModePolicy(effectivePlatformMode).restrictStandaloneCompiler) {
    redirect("/dashboard");
  }

  const languages = await getEnabledCompilerLanguages();

  if (languages.length === 0) {
    if (process.env.NODE_ENV === "development") {
      redirect("/dashboard/admin/languages?no-enabled-languages=true");
    }
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-2xl font-bold">{t("noLanguagesTitle", { defaultValue: "No Languages Available" })}</h1>
          <p className="text-muted-foreground">
            {t("noLanguagesDescription", { defaultValue: "Enable at least one language in settings." })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <CompilerClient
      languages={languages}
      title={t("title")}
      description={t("description")}
      preferredLanguage={session?.user?.preferredLanguage ?? null}
    />
  );
}

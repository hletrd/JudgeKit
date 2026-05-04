import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEnabledCompilerLanguages } from "@/lib/compiler/catalog";
import { CompilerClient } from "@/components/code/compiler-client";
import { JsonLd } from "@/components/seo/json-ld";
import { buildAbsoluteUrl, buildLocalePath, buildPublicMetadata } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { getEffectivePlatformMode } from "@/lib/platform-mode-context";
import { getPlatformModePolicy } from "@/lib/platform-mode";

export async function generateMetadata(): Promise<Metadata> {
  const [tCommon, tShell, locale] = await Promise.all([
    getTranslations("common"),
    getTranslations("publicShell"),
    getLocale(),
  ]);
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });

  return buildPublicMetadata({
    title: tShell("playground.liveTitle"),
    description: tShell("playground.liveDescription"),
    path: "/playground",
    siteTitle: settings.siteTitle,
    locale,
    keywords: [
      "online compiler",
      "code playground",
      "run code online",
    ],
    section: tShell("nav.playground"),
  });
}

export default async function PlaygroundPage() {
  const [tCompiler, tShell, locale, session] = await Promise.all([
    getTranslations("compiler"),
    getTranslations("publicShell"),
    getLocale(),
    auth(),
  ]);

  // Auth-aware: in recruiting mode, redirect to dashboard
  if (session?.user) {
    const effectivePlatformMode = await getEffectivePlatformMode({
      userId: session.user.id,
    });
    if (getPlatformModePolicy(effectivePlatformMode).restrictStandaloneCompiler) {
      redirect("/dashboard");
    }
  }

  const languages = await getEnabledCompilerLanguages();
  const playgroundJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: tShell("playground.liveTitle"),
    description: tShell("playground.liveDescription"),
    url: buildAbsoluteUrl(buildLocalePath("/playground", locale)),
    inLanguage: locale,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

  if (languages.length === 0) {
    return (
      <>
        <JsonLd data={playgroundJsonLd} />
        <div className="flex h-full items-center justify-center p-6">
          <div className="max-w-md text-center">
            <h1 className="mb-2 text-2xl font-bold">
              {tCompiler("noLanguagesTitle")}
            </h1>
            <p className="text-muted-foreground">
              {tCompiler("noLanguagesDescription")}
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <JsonLd data={playgroundJsonLd} />
      <CompilerClient
        languages={languages}
        title={tShell("playground.liveTitle")}
        description={tShell("playground.liveDescription")}
        preferredLanguage={session?.user?.preferredLanguage ?? null}
        runEndpoint="/api/v1/playground/run"
      />
    </>
  );
}

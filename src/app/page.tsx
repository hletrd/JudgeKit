import { getTranslations, getLocale } from "next-intl/server";
import { PublicHeader } from "@/components/layout/public-header";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { PublicHomePage } from "@/app/(public)/_components/public-home-page";

function pick(defaultVal: string, override?: string): string {
  return override && override.trim() ? override : defaultVal;
}

export default async function HomePage() {
  const [tCommon, tAuth, tShell, locale, settings] = await Promise.all([
    getTranslations("common"),
    getTranslations("auth"),
    getTranslations("publicShell"),
    getLocale(),
    getResolvedSystemSettings({
      siteTitle: tCommon("appName"),
      siteDescription: tCommon("appDescription"),
    }),
  ]);

  const o = settings.homePageContent?.[locale];

  return (
    <div className="min-h-dvh bg-muted/20">
      <PublicHeader
        siteTitle={settings.siteTitle}
        items={[
          { href: "/practice", label: tShell("nav.practice") },
          { href: "/playground", label: tShell("nav.playground") },
          { href: "/contests", label: tShell("nav.contests") },
          { href: "/community", label: tShell("nav.community") },
        ]}
        actions={[
          { href: "/dashboard", label: tShell("nav.workspace") },
          { href: "/login", label: tAuth("signIn") },
        ]}
      />
      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <PublicHomePage
          eyebrow={pick(tShell("home.eyebrow"), o?.eyebrow)}
          title={pick(tShell("home.title"), o?.title)}
          description={pick(tShell("home.description"), o?.description)}
          sections={[
            {
              href: "/practice",
              title: pick(tShell("home.cards.practice.title"), o?.cards?.practice?.title),
              description: pick(tShell("home.cards.practice.description"), o?.cards?.practice?.description),
            },
            {
              href: "/playground",
              title: pick(tShell("home.cards.playground.title"), o?.cards?.playground?.title),
              description: pick(tShell("home.cards.playground.description"), o?.cards?.playground?.description),
            },
            {
              href: "/contests",
              title: pick(tShell("home.cards.contests.title"), o?.cards?.contests?.title),
              description: pick(tShell("home.cards.contests.description"), o?.cards?.contests?.description),
            },
            {
              href: "/community",
              title: pick(tShell("home.cards.community.title"), o?.cards?.community?.title),
              description: pick(tShell("home.cards.community.description"), o?.cards?.community?.description),
            },
          ]}
          primaryCta={{ href: "/dashboard", label: tShell("home.primaryCta") }}
          secondaryCta={{ href: "/login", label: tShell("home.secondaryCta") }}
        />
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import { getTranslations, getLocale } from "next-intl/server";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { JsonLd } from "@/components/seo/json-ld";
import { buildAbsoluteUrl, buildLocalePath, buildPublicMetadata } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { PublicHomePage } from "@/app/(public)/_components/public-home-page";
import { auth } from "@/lib/auth";
import { SkipToContent } from "@/components/layout/skip-to-content";
import { getHomepageInsights } from "@/lib/homepage-insights";
import { getJudgeSystemSnapshot } from "@/lib/judge/dashboard-data";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { getPublicNavItems } from "@/lib/navigation/public-nav";

function pick(defaultVal: string, override?: string): string {
  return override && override.trim() ? override : defaultVal;
}

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
  const overrides = settings.homePageContent?.[locale];

  return buildPublicMetadata({
    title: pick(tShell("home.title"), overrides?.title),
    description: pick(tShell("home.description"), overrides?.description),
    path: "/",
    siteTitle: settings.siteTitle,
    locale,
    keywords: [
      "programming practice platform",
      "online coding contests",
      "computer science coursework",
    ],
    section: pick(tShell("home.eyebrow"), overrides?.eyebrow),
  });
}

export default async function HomePage() {
  const [tCommon, tAuth, tShell, locale, session, insights, judgeSnapshot] = await Promise.all([
    getTranslations("common"),
    getTranslations("auth"),
    getTranslations("publicShell"),
    getLocale(),
    auth(),
    getHomepageInsights(),
    getJudgeSystemSnapshot(),
  ]);

  const [settings, capabilities] = await Promise.all([
    getResolvedSystemSettings({
      siteTitle: tCommon("appName"),
      siteDescription: tCommon("appDescription"),
    }),
    session?.user ? resolveCapabilities(session.user.role).then(c => [...c]) : undefined,
  ]);

  const o = settings.homePageContent?.[locale];
  const seoDescription = pick(tShell("home.description"), o?.description);
  const homeUrl = buildAbsoluteUrl(buildLocalePath("/", locale));
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: settings.siteTitle,
    url: homeUrl,
    description: seoDescription,
    inLanguage: locale,
  };
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: settings.siteTitle,
    url: homeUrl,
  };

  return (
    <div className="min-h-dvh bg-muted/20">
      <JsonLd data={[websiteJsonLd, organizationJsonLd]} />
      <SkipToContent label={tCommon("skipToContent")} />
      <PublicHeader
        siteTitle={settings.siteTitle}
        items={getPublicNavItems(tShell, capabilities)}
        actions={[
          { href: "/login", label: tAuth("signIn") },
          ...(settings.publicSignupEnabled ? [{ href: "/signup", label: tAuth("signUp") }] : []),
        ]}
        loggedInUser={session?.user ? { name: session.user.name, href: "/dashboard", label: tShell("nav.dashboard"), capabilities } : null}
      />
      <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <PublicHomePage
          eyebrow={pick(tShell("home.eyebrow"), o?.eyebrow)}
          title={pick(tShell("home.title"), o?.title)}
          description={pick(tShell("home.description"), o?.description)}
          insights={[
            {
              label: tShell("home.insights.problems.label"),
              value: new Intl.NumberFormat(locale).format(insights.publicProblemCount),
              description: tShell("home.insights.problems.description"),
              icon: "problems",
            },
            {
              label: tShell("home.insights.submissions.label"),
              value: new Intl.NumberFormat(locale).format(insights.totalSubmissionCount),
              description: tShell("home.insights.submissions.description"),
              icon: "submissions",
            },
            {
              label: tShell("home.insights.languages.label"),
              value: new Intl.NumberFormat(locale).format(insights.enabledLanguageCount),
              description: tShell("home.insights.languages.description"),
              icon: "languages",
            },
          ]}
          sections={[
            {
              href: buildLocalePath("/practice", locale),
              title: pick(tShell("home.cards.practice.title"), o?.cards?.practice?.title),
              description: pick(tShell("home.cards.practice.description"), o?.cards?.practice?.description),
              icon: "code" as const,
            },
            {
              href: buildLocalePath("/playground", locale),
              title: pick(tShell("home.cards.playground.title"), o?.cards?.playground?.title),
              description: pick(tShell("home.cards.playground.description"), o?.cards?.playground?.description),
              icon: "code" as const,
            },
            {
              href: buildLocalePath("/contests", locale),
              title: pick(tShell("home.cards.contests.title"), o?.cards?.contests?.title),
              description: pick(tShell("home.cards.contests.description"), o?.cards?.contests?.description),
              icon: "trophy" as const,
            },
            {
              href: buildLocalePath("/community", locale),
              title: pick(tShell("home.cards.community.title"), o?.cards?.community?.title),
              description: pick(tShell("home.cards.community.description"), o?.cards?.community?.description),
              icon: "message" as const,
            },
          ]}
          primaryCta={{ href: buildLocalePath("/dashboard", locale), label: tShell("home.primaryCta") }}
          secondaryCta={session?.user ? null : { href: buildLocalePath("/login", locale), label: tShell("home.secondaryCta") }}
          judgeInfo={{
            title: tShell("home.judgeInfo.title"),
            description: tShell("home.judgeInfo.description"),
            viewDetails: tShell("home.judgeInfo.viewDetails"),
            languagesHref: buildLocalePath("/languages", locale),
            stats: [
              { label: tShell("home.judgeInfo.enabledLanguages"), value: new Intl.NumberFormat(locale).format(insights.enabledLanguageCount) },
              { label: tShell("home.judgeInfo.onlineWorkers"), value: new Intl.NumberFormat(locale).format(judgeSnapshot.onlineWorkerCount) },
              { label: tShell("home.judgeInfo.parallelSlots"), value: new Intl.NumberFormat(locale).format(judgeSnapshot.totalWorkerCapacity) },
            ],
          }}
        />
      </main>
      <PublicFooter siteTitle={settings.siteTitle} footerContent={settings.footerContent} />
    </div>
  );
}

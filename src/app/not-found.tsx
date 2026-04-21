import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { SkipToContent } from "@/components/layout/skip-to-content";
import { buildLocalePath, NO_INDEX_METADATA } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { getPublicNavItems } from "@/lib/navigation/public-nav";

export async function generateMetadata() {
  const tState = await getTranslations("dashboardState");

  return {
    title: tState("notFoundTitle"),
    ...NO_INDEX_METADATA,
  };
}

export default async function NotFoundPage() {
  const [tCommon, tAuth, tShell, tState, session, locale] = await Promise.all([
    getTranslations("common"),
    getTranslations("auth"),
    getTranslations("publicShell"),
    getTranslations("dashboardState"),
    auth(),
    getLocale(),
  ]);

  const [settings, capabilities] = await Promise.all([
    getResolvedSystemSettings({
      siteTitle: tCommon("appName"),
      siteDescription: tCommon("appDescription"),
    }),
    session?.user ? resolveCapabilities(session.user.role).then(c => [...c]) : undefined,
  ]);

  const homeHref = buildLocalePath(session?.user ? "/dashboard" : "/", locale);
  const homeLabel = session?.user ? tState("backToDashboard") : tCommon("back");

  return (
    <div className="min-h-dvh bg-muted/20">
      <SkipToContent label={tCommon("skipToContent")} />
      <PublicHeader
        siteTitle={settings.siteTitle}
        items={getPublicNavItems(tShell)}
        actions={[
          { href: "/dashboard", label: tShell("nav.dashboard") },
          { href: "/login", label: tAuth("signIn") },
          ...(settings.publicSignupEnabled ? [{ href: "/signup", label: tAuth("signUp") }] : []),
        ]}
        loggedInUser={session?.user ? { name: session.user.name, href: "/dashboard", label: tShell("nav.dashboard"), capabilities } : null}
      />
      <main id="main-content" className="mx-auto flex min-h-[calc(100dvh-80px)] w-full max-w-6xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="w-full max-w-xl rounded-3xl border bg-background p-8 text-center shadow-sm sm:p-10">
          {/* "404" is a numeric status code — tracking-[0.2em] is safe for Korean locale */}
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">404</p>
          {/* tracking-tight is for Latin headings — skip for Korean to preserve readability */}
          <h1 className={`mt-4 text-3xl font-semibold${locale !== "ko" ? " tracking-tight" : ""} sm:text-4xl`}>
            {tState("notFoundTitle")}
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            {tState("notFoundDescription")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href={homeHref}>
              <Button>{homeLabel}</Button>
            </Link>
            <Link href={buildLocalePath("/practice", locale)}>
              <Button variant="outline">{tShell("nav.practice")}</Button>
            </Link>
          </div>
        </div>
      </main>
      <PublicFooter siteTitle={settings.siteTitle} footerContent={settings.footerContent} />
    </div>
  );
}

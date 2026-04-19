import { getTranslations } from "next-intl/server";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { SkipToContent } from "@/components/layout/skip-to-content";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { getPublicNavItems, getPublicNavActions } from "@/lib/navigation/public-nav";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [tCommon, tAuth, tShell, session] = await Promise.all([
    getTranslations("common"),
    getTranslations("auth"),
    getTranslations("publicShell"),
    auth(),
  ]);

  const capabilities = session?.user ? [...await resolveCapabilities(session.user.role)] : undefined;
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });

  return (
    <div className="min-h-dvh bg-muted/20">
      <SkipToContent label={tCommon("skipToContent")} />
      <PublicHeader
        siteTitle={settings.siteTitle}
        items={getPublicNavItems(tShell)}
        actions={getPublicNavActions(tAuth, settings.publicSignupEnabled)}
        loggedInUser={session?.user ? { name: session.user.name, href: "/dashboard", label: tShell("nav.dashboard"), role: session.user.role, capabilities } : null}
      />
      <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">{children}</main>
      <PublicFooter siteTitle={settings.siteTitle} footerContent={settings.footerContent} />
    </div>
  );
}

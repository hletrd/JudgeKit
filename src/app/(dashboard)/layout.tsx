import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { SkipToContent } from "@/components/layout/skip-to-content";
import { Breadcrumb } from "@/components/layout/breadcrumb";

import { Toaster } from "@/components/ui/sonner";

import { getResolvedSystemSettings } from "@/lib/system-settings";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { getRecruitingAccessContext } from "@/lib/recruiting/access";
import { getActiveTimedAssignmentsForSidebar } from "@/lib/assignments/active-timed-assignments";
import { NO_INDEX_METADATA } from "@/lib/seo";
import { getPublicNavItems, getPublicNavActions } from "@/lib/navigation/public-nav";

export const metadata: Metadata = NO_INDEX_METADATA;

/**
 * Admin-only dashboard layout.
 *
 * Provides the top navbar (PublicHeader) for admin workspace pages.
 * Non-admin authenticated pages (profile, groups, problems, etc.)
 * use the public layout instead.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [{ effectivePlatformMode }, tCommon, tShell, tAuth, capsSet, settings] = await Promise.all([
    getRecruitingAccessContext(session.user.id),
    getTranslations("common"),
    getTranslations("publicShell"),
    getTranslations("auth"),
    resolveCapabilities(session.user.role),
    getResolvedSystemSettings({
      siteTitle: (await getTranslations("common"))("appName"),
      siteDescription: (await getTranslations("common"))("appDescription"),
    }),
  ]);

  const capabilities = [...capsSet];

  return (
    <div className="min-h-dvh bg-muted/20">
      <SkipToContent targetId="main-content" label={tCommon("skipToContent")} />
      <PublicHeader
        siteTitle={settings.siteTitle}
        items={getPublicNavItems(tShell)}
        actions={getPublicNavActions(tAuth, settings.publicSignupEnabled)}
        loggedInUser={{
          name: session.user.name || session.user.username || "",
          href: "/dashboard",
          label: session.user.name || session.user.username || "",
          capabilities,
        }}
      />
      <header className="hidden md:block sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-6 py-3">
        <Breadcrumb />
      </header>
      <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {children}
      </main>
      <PublicFooter siteTitle={settings.siteTitle} footerContent={settings.footerContent} />
      <Toaster />
    </div>
  );
}
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PublicHeader } from "@/components/layout/public-header";
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
 * Provides the sidebar + minimal header for admin workspace pages.
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
  const canBypassTimedAssignmentPanel =
    capsSet.has("groups.view_all")
    || capsSet.has("submissions.view_all")
    || capsSet.has("assignments.view_status");

  const activeTimedAssignments = canBypassTimedAssignmentPanel
    ? []
    : await getActiveTimedAssignmentsForSidebar(session.user.id, session.user.role);

  return (
    <SidebarProvider>
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
        leadingSlot={<SidebarTrigger />}
      />
      <SkipToContent targetId="main-content" label={tCommon("skipToContent")} />
      <AppSidebar
        user={session.user}
        siteTitle={settings.siteTitle}
        siteIconUrl={settings.siteIconUrl}
        platformMode={effectivePlatformMode}
        capabilities={capabilities}
        activeTimedAssignments={activeTimedAssignments}
      />
      <SidebarInset>
        <header className="hidden md:block sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-6 py-3">
          <Breadcrumb />
        </header>
        <main id="main-content" className="min-w-0 flex-1 p-6">
          {children}
        </main>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}

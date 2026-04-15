import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LectureModeProvider } from "@/components/lecture/lecture-mode-provider";
import { LectureModeToggle } from "@/components/layout/lecture-mode-toggle";
import { LectureToolbar } from "@/components/lecture/lecture-toolbar";
import { updatePreferences } from "@/lib/actions/update-preferences";

import { Toaster } from "@/components/ui/sonner";

import { getResolvedSystemSettings, isAiAssistantEnabled } from "@/lib/system-settings";
import { ChatWidgetLoader } from "@/components/plugins/chat-widget-loader";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { isPluginEnabled } from "@/lib/plugins/data";
import { EditorContentProvider } from "@/contexts/editor-content-context";
import { getRecruitingAccessContext } from "@/lib/recruiting/access";
import { isInstructorOrAboveAsync } from "@/lib/auth/role-helpers";
import { getActiveTimedAssignmentsForSidebar } from "@/lib/assignments/active-timed-assignments";
import { NO_INDEX_METADATA } from "@/lib/seo";

export const metadata: Metadata = NO_INDEX_METADATA;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [{ effectivePlatformMode }, t, capabilities] = await Promise.all([
    getRecruitingAccessContext(session.user.id),
    getTranslations("common"),
    (async () => {
      const [caps, chatPluginOn, aiOn] = await Promise.all([
        resolveCapabilities(session.user.role),
        isPluginEnabled("chat-widget"),
        isAiAssistantEnabled(),
      ]);
      const arr = [...caps];
      return (!chatPluginOn || !aiOn) ? arr.filter(c => c !== "system.chat_logs") : arr;
    })(),
  ]);
  const capsSet = new Set(capabilities);
  const canBypassTimedAssignmentPanel =
    session.user.role === "admin"
    || session.user.role === "super_admin"
    || session.user.role === "instructor"
    || capsSet.has("groups.view_all")
    || capsSet.has("submissions.view_all")
    || capsSet.has("assignments.view_status");

  const [settings, canUseLectureMode, activeTimedAssignments] = await Promise.all([
    getResolvedSystemSettings({
      siteTitle: t("appName"),
      siteDescription: t("appDescription"),
    }),
    isInstructorOrAboveAsync(session.user.role),
    canBypassTimedAssignmentPanel
      ? Promise.resolve([])
      : getActiveTimedAssignmentsForSidebar(session.user.id, session.user.role),
  ]);

  return (
    <EditorContentProvider>
    <LectureModeProvider
      initialActive={canUseLectureMode && session.user.lectureMode === "on"}
      initialFontScale={session.user.lectureFontScale ?? "1.5"}
      initialColorScheme={session.user.lectureColorScheme ?? "dark"}
      persistAction={updatePreferences}
    >
      <SidebarProvider>
        <a
          href="#dashboard-main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
        >
          {t("skipToContent")}
        </a>
        <AppSidebar
          user={session.user}
          siteTitle={settings.siteTitle}
          platformMode={effectivePlatformMode}
          capabilities={capabilities}
          activeTimedAssignments={activeTimedAssignments}
        />
        <SidebarInset>
          <header className="flex h-14 items-center gap-2 px-4">
            <SidebarTrigger />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{settings.siteTitle}</span>
            </div>
            <div className="ml-auto flex items-center gap-1">
              {canUseLectureMode && <LectureModeToggle />}
              <ThemeToggle dbTheme={session.user.preferredTheme} />
              <LocaleSwitcher />
            </div>
          </header>
          <main id="dashboard-main-content" className="min-w-0 flex-1 p-6">
            {children}
          </main>
        </SidebarInset>
        <Toaster />
        <ChatWidgetLoader userId={session.user.id} />
        <LectureToolbar />
      </SidebarProvider>
    </LectureModeProvider>
    </EditorContentProvider>
  );
}

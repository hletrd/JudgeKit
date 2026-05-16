import { getTranslations } from "next-intl/server";
import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { SkipToContent } from "@/components/layout/skip-to-content";
import { LectureModeProvider } from "@/components/lecture/lecture-mode-provider";
import { LectureModeToggle } from "@/components/layout/lecture-mode-toggle";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { getPublicNavItems, getPublicNavActions } from "@/lib/navigation/public-nav";
import { updatePreferences } from "@/lib/actions/update-preferences";
import { Toaster } from "@/components/ui/sonner";
import { ChatWidgetLoader } from "@/components/plugins/chat-widget-loader";

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
    <LectureModeProvider
      initialActive={session?.user?.lectureMode === "on"}
      initialFontScale={session?.user?.lectureFontScale ?? "1.5"}
      initialColorScheme={session?.user?.lectureColorScheme ?? "dark"}
      persistAction={session?.user ? (updatePreferences as (input: Record<string, string | null>) => Promise<unknown>) : undefined}
    >
      <div className="min-h-dvh bg-muted/20">
        <SkipToContent label={tCommon("skipToContent")} />
        <PublicHeader
          siteTitle={settings.siteTitle}
          items={getPublicNavItems(tShell, capabilities)}
          actions={getPublicNavActions(tAuth, settings.publicSignupEnabled)}
          loggedInUser={session?.user ? { name: session.user.name, href: "/dashboard", label: tShell("nav.dashboard"), capabilities } : null}
          trailingSlot={session?.user ? <LectureModeToggle /> : undefined}
        />
        <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">{children}</main>
        <PublicFooter siteTitle={settings.siteTitle} footerContent={settings.footerContent} />
        <Toaster />
        {session?.user && <ChatWidgetLoader userId={session.user.id} userRole={session.user.role} />}
      </div>
    </LectureModeProvider>
  );
}

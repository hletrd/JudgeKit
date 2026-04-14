import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { ControlNav } from "@/components/layout/control-nav";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { Toaster } from "@/components/ui/sonner";

export default async function ControlLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const capabilities = await resolveCapabilities(session.user.role);
  const canAccessControl =
    capabilities.has("users.view") ||
    capabilities.has("system.settings") ||
    capabilities.has("submissions.view_all") ||
    capabilities.has("groups.view_all") ||
    capabilities.has("assignments.view_status");
  const canModerate = capabilities.has("community.moderate");

  if (!canAccessControl) {
    redirect("/dashboard");
  }

  const [tCommon, tNav, tShell] = await Promise.all([
    getTranslations("common"),
    getTranslations("nav"),
    getTranslations("controlShell"),
  ]);
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });

  return (
    <div className="grid min-h-dvh lg:grid-cols-[18rem_1fr]">
      <ControlNav
        siteTitle={settings.siteTitle}
        sectionLabel={tShell("sectionLabel")}
        userLabel={`${session.user.name ?? session.user.username} · ${session.user.role}`}
        items={[
          { href: "/control", label: tShell("nav.home"), description: tShell("nav.homeDescription") },
          ...(canModerate
            ? [{ href: "/control/discussions", label: tShell("nav.discussions"), description: tShell("nav.discussionsDescription") }]
            : []),
          { href: "/dashboard/groups", label: tNav("groups"), description: tShell("nav.groupsDescription") },
          { href: "/dashboard/admin/users", label: tNav("userManagement"), description: tShell("nav.usersDescription") },
          { href: "/dashboard/admin/languages", label: tNav("languages"), description: tShell("nav.languagesDescription") },
          { href: "/dashboard/admin/settings", label: tNav("systemSettings"), description: tShell("nav.settingsDescription") },
        ]}
      />
      <div className="min-w-0 bg-background">
        <header className="flex items-center justify-end gap-1 border-b px-4 py-3">
          <ThemeToggle />
          <LocaleSwitcher />
        </header>
        <main className="p-6">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}

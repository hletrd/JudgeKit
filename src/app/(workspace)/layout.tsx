import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import { Toaster } from "@/components/ui/sonner";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [tCommon, tNav, tShell] = await Promise.all([
    getTranslations("common"),
    getTranslations("nav"),
    getTranslations("workspaceShell"),
  ]);
  const settings = await getResolvedSystemSettings({
    siteTitle: tCommon("appName"),
    siteDescription: tCommon("appDescription"),
  });

  return (
    <div className="grid min-h-dvh lg:grid-cols-[18rem_1fr]">
      <WorkspaceNav
        siteTitle={settings.siteTitle}
        sectionLabel={tShell("sectionLabel")}
        userLabel={`${session.user.name ?? session.user.username} · ${session.user.role}`}
        items={[
          { href: "/dashboard", label: tNav("dashboard"), description: tShell("nav.homeDescription") },
          { href: "/workspace/discussions", label: tShell("nav.discussions"), description: tShell("nav.discussionsDescription") },
          { href: "/dashboard/problems", label: tNav("problems"), description: tShell("nav.problemsDescription") },
          { href: "/dashboard/contests", label: tNav("contests"), description: tShell("nav.contestsDescription") },
          { href: "/dashboard/submissions", label: tNav("submissions"), description: tShell("nav.submissionsDescription") },
          { href: "/dashboard/profile", label: tNav("profile"), description: tShell("nav.profileDescription") },
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

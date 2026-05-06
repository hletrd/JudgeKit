import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Blocks,
  Code,
  FileCode,
  History,
  KeyRound,
  LogIn,
  MessageCircle,
  MessageCircleWarning,
  Server,
  Settings,
  Shield,
  Tags,
  Upload,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NO_INDEX_METADATA } from "@/lib/seo";

export const metadata: Metadata = NO_INDEX_METADATA;

type AdminLink = {
  href: string;
  titleKey: string;
  descriptionKey: string;
  icon: typeof Shield;
  capability: string;
};

type AdminGroup = {
  labelKey: string;
  items: AdminLink[];
};

const ADMIN_GROUPS: AdminGroup[] = [
  {
    labelKey: "usersAndLogs",
    items: [
      { href: "/dashboard/admin/users", titleKey: "userManagement", descriptionKey: "userManagementDesc", icon: Shield, capability: "users.view" },
      { href: "/dashboard/admin/roles", titleKey: "roleManagement", descriptionKey: "roleManagementDesc", icon: KeyRound, capability: "users.manage_roles" },
      { href: "/dashboard/admin/submissions", titleKey: "allSubmissions", descriptionKey: "allSubmissionsDesc", icon: FileCode, capability: "submissions.view_all" },
      { href: "/dashboard/admin/audit-logs", titleKey: "auditLogs", descriptionKey: "auditLogsDesc", icon: History, capability: "system.audit_logs" },
      { href: "/dashboard/admin/login-logs", titleKey: "loginLogs", descriptionKey: "loginLogsDesc", icon: LogIn, capability: "system.login_logs" },
      { href: "/dashboard/admin/plugins/chat-logs", titleKey: "chatLogs", descriptionKey: "chatLogsDesc", icon: MessageCircle, capability: "system.chat_logs" },
      { href: "/dashboard/admin/discussions", titleKey: "discussionModeration", descriptionKey: "discussionModerationDesc", icon: MessageCircleWarning, capability: "community.moderate" },
    ],
  },
  {
    labelKey: "system",
    items: [
      { href: "/dashboard/admin/workers", titleKey: "judgeWorkers", descriptionKey: "judgeWorkersDesc", icon: Server, capability: "system.settings" },
      { href: "/dashboard/admin/languages", titleKey: "languages", descriptionKey: "languagesDesc", icon: Code, capability: "system.settings" },
      { href: "/dashboard/admin/settings", titleKey: "systemSettings", descriptionKey: "systemSettingsDesc", icon: Settings, capability: "system.settings" },
      { href: "/dashboard/admin/files", titleKey: "fileManagement", descriptionKey: "fileManagementDesc", icon: Upload, capability: "files.manage" },
      { href: "/dashboard/admin/api-keys", titleKey: "apiKeys", descriptionKey: "apiKeysDesc", icon: KeyRound, capability: "system.settings" },
      { href: "/dashboard/admin/tags", titleKey: "tagManagement", descriptionKey: "tagManagementDesc", icon: Tags, capability: "system.settings" },
      { href: "/dashboard/admin/plugins", titleKey: "plugins", descriptionKey: "pluginsDesc", icon: Blocks, capability: "system.plugins" },
    ],
  },
];

export default async function AdminIndexPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const caps = await resolveCapabilities(session.user.role);
  const tNav = await getTranslations("nav");
  const tAdmin = await getTranslations("admin.index");

  const visibleGroups = ADMIN_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => caps.has(item.capability)),
    }))
    .filter((group) => group.items.length > 0);

  if (visibleGroups.length === 0) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{tNav("administration")}</h1>
        <p className="text-sm text-muted-foreground">{tAdmin("subtitle")}</p>
      </div>

      {visibleGroups.map((group) => (
        <section key={group.labelKey} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {tNav(group.labelKey)}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className="group">
                  <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-accent/40">
                    <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                      <div className="rounded-md bg-muted p-2">
                        <Icon className="size-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base">{tNav(item.titleKey)}</CardTitle>
                        <CardDescription className="mt-1 text-xs">
                          {tAdmin(item.descriptionKey)}
                        </CardDescription>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

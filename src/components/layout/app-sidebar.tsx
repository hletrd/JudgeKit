"use client";

import Image from "next/image";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { handleSignOutWithCleanup } from "@/lib/auth/sign-out";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { BookOpen, FileCode, Send, Users, User, GraduationCap, Shield, LogOut, LogIn, History, FolderOpen, Blocks, Trophy, MessageCircle, Timer, KeyRound, Code, Settings, Server, Play, Upload, Tags, Loader2 } from "lucide-react";
import type { PlatformMode } from "@/types";
import type { ActiveTimedAssignmentSummary } from "@/lib/assignments/active-timed-assignments";
import { getPlatformModePolicy } from "@/lib/platform-mode";
import { ActiveTimedAssignmentSidebarPanel } from "@/components/layout/active-timed-assignment-sidebar-panel";

interface AppSidebarProps {
  user: {
    id: string;
    username?: string | null;
    name?: string | null;
    email?: string | null;
    role: string;
  };
  siteTitle: string;
  siteIconUrl?: string | null;
  platformMode: PlatformMode;
  capabilities?: string[];
  activeTimedAssignments?: ActiveTimedAssignmentSummary[];
}

type NavItem = {
  titleKey: string;
  href: string;
  icon: typeof BookOpen;
  capability?: string;
  hiddenInModes?: PlatformMode[];
  titleKeyByMode?: Partial<Record<PlatformMode, string>>;
};

type NavGroup = {
  labelKey: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    labelKey: "learning",
    items: [
      {
        titleKey: "problems",
        href: "/dashboard/problems",
        icon: BookOpen,
        titleKeyByMode: { recruiting: "challenges" },
        hiddenInModes: ["recruiting"],
      },
      {
        titleKey: "submissions",
        href: "/dashboard/submissions",
        icon: Send,
        titleKeyByMode: { recruiting: "attempts" },
      },
      // Contests and Rankings are available in the PublicHeader dropdown,
      // so they are omitted from the sidebar to reduce navigation overlap.
      // Students can still reach them from the top navbar.
      { titleKey: "compiler", href: "/dashboard/compiler", icon: Play, hiddenInModes: ["recruiting"] },
    ],
  },
  {
    labelKey: "manage",
    items: [
      {
        titleKey: "groups",
        href: "/dashboard/groups",
        icon: Users,
        hiddenInModes: ["recruiting"],
      },
      {
        titleKey: "problemSets",
        href: "/dashboard/problem-sets",
        icon: FolderOpen,
        capability: "problem_sets.create",
        hiddenInModes: ["recruiting"],
      },
    ],
  },
];

const adminGroups: NavGroup[] = [
  {
    labelKey: "usersAndLogs",
    items: [
      { titleKey: "userManagement", href: "/dashboard/admin/users", icon: Shield, capability: "users.view" },
      { titleKey: "roleManagement", href: "/dashboard/admin/roles", icon: KeyRound, capability: "users.manage_roles" },
      { titleKey: "allSubmissions", href: "/dashboard/admin/submissions", icon: FileCode, capability: "submissions.view_all" },
      { titleKey: "auditLogs", href: "/dashboard/admin/audit-logs", icon: History, capability: "system.audit_logs" },
      { titleKey: "loginLogs", href: "/dashboard/admin/login-logs", icon: LogIn, capability: "system.login_logs" },
      { titleKey: "chatLogs", href: "/dashboard/admin/plugins/chat-logs", icon: MessageCircle, capability: "system.chat_logs" },
    ],
  },
  {
    labelKey: "system",
    items: [
      { titleKey: "judgeWorkers", href: "/dashboard/admin/workers", icon: Server, capability: "system.settings" },
      { titleKey: "languages", href: "/dashboard/admin/languages", icon: Code, capability: "system.settings" },
      { titleKey: "systemSettings", href: "/dashboard/admin/settings", icon: Settings, capability: "system.settings" },
      { titleKey: "fileManagement", href: "/dashboard/admin/files", icon: Upload, capability: "files.manage" },
      { titleKey: "apiKeys", href: "/dashboard/admin/api-keys", icon: KeyRound, capability: "system.settings" },
      { titleKey: "tagManagement", href: "/dashboard/admin/tags", icon: Tags, capability: "system.settings" },
      { titleKey: "plugins", href: "/dashboard/admin/plugins", icon: Blocks, capability: "system.plugins" },
    ],
  },
];

function NavItems({
  items,
  pathname,
  t,
  platformMode,
  resolveHref,
}: {
  items: NavItem[];
  pathname: string;
  t: (key: string) => string;
  platformMode: PlatformMode;
  resolveHref: (item: NavItem) => string;
}) {
  return (
    <>
      {items.map((item) => {
        const href = resolveHref(item);
        const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
        const titleKey = item.titleKeyByMode?.[platformMode] ?? item.titleKey;
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              isActive={isActive}
              aria-current={isActive ? "page" : undefined}
              tooltip={t(titleKey)}
              render={<Link href={href} />}
            >
              <item.icon className="size-4" aria-hidden="true" />
              <span>{t(titleKey)}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </>
  );
}

export function AppSidebar({
  user,
  siteTitle,
  siteIconUrl,
  platformMode,
  capabilities = [],
  activeTimedAssignments = [],
}: AppSidebarProps) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const roleLabels: Record<string, string> = {
    student: tCommon("roles.student"),
    assistant: tCommon("roles.assistant"),
    instructor: tCommon("roles.instructor"),
    admin: tCommon("roles.admin"),
    super_admin: tCommon("roles.super_admin"),
  };

  const capsSet = new Set(capabilities);
  const hideStandaloneCompiler = getPlatformModePolicy(platformMode).restrictStandaloneCompiler;

  const canBypassModeRestrictions =
    capsSet.has("groups.view_all")
    || capsSet.has("submissions.view_all")
    || capsSet.has("assignments.view_status");
  const prefersScopedReviewQueue =
    capsSet.has("submissions.view_all") || capsSet.has("assignments.view_status");

  function resolveItemHref(item: NavItem) {
    if (item.href === "/dashboard/submissions" && prefersScopedReviewQueue) {
      return "/dashboard/admin/submissions";
    }

    return item.href;
  }

  function filterItems(items: NavItem[]) {
    return items.filter((item) => {
      if (item.hiddenInModes?.includes(platformMode) && !canBypassModeRestrictions) {
        return false;
      }
      if (hideStandaloneCompiler && item.href === "/dashboard/compiler" && !canBypassModeRestrictions) {
        return false;
      }
      if (item.href === "/dashboard/problem-sets") {
        return (
          capsSet.has("problem_sets.create")
          || capsSet.has("problem_sets.edit")
          || capsSet.has("problem_sets.delete")
          || capsSet.has("problem_sets.assign_groups")
        );
      }
      return !item.capability || capsSet.has(item.capability);
    });
  }

  async function handleSignOut() {
    await handleSignOutWithCleanup(setIsSigningOut);
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b p-4">
        <Link href="/" className="flex items-center gap-2">
          {siteIconUrl ? (
            <Image
              src={siteIconUrl}
              alt=""
              width={24}
              height={24}
              unoptimized
              loader={({ src }) => src}
              className="h-6 w-6 rounded object-contain"
            />
          ) : (
            <GraduationCap className="h-6 w-6" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <span className="block truncate text-lg font-bold">{siteTitle}</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <ActiveTimedAssignmentSidebarPanel assignments={activeTimedAssignments} />
        {navGroups.map((group) => {
          const filtered = filterItems(group.items);
          if (filtered.length === 0) return null;
          return (
            <SidebarGroup key={group.labelKey || filtered[0]?.href}>
              {group.labelKey && <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  <NavItems items={filtered} pathname={pathname} t={t} platformMode={platformMode} resolveHref={resolveItemHref} />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}

        {adminGroups.some(g => filterItems(g.items).length > 0) && (
          <>
            {/* tracking-wider is for English uppercase text only (e.g. "ADMINISTRATION") — do not apply to Korean labels */}
            <SidebarGroup>
              <SidebarGroupLabel className={`text-xs font-semibold uppercase text-muted-foreground/70${locale !== "ko" ? " tracking-wider" : ""}`}>
                {t("administration")}
              </SidebarGroupLabel>
            </SidebarGroup>
            {adminGroups.map((group) => {
              const filtered = filterItems(group.items);
              if (filtered.length === 0) return null;
              return (
                <SidebarGroup key={group.labelKey}>
                  <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <NavItems items={filtered} pathname={pathname} t={t} platformMode={platformMode} resolveHref={resolveItemHref} />
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            })}
          </>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <User className="size-4" aria-hidden="true" />
            <div className="flex flex-col text-sm">
              <span className="font-medium">{user.name} ({user.username})</span>
              <span className="text-xs text-muted-foreground">{roleLabels[user.role] ?? user.role}</span>
            </div>
          </div>

          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => void handleSignOut()} disabled={isSigningOut}>
                {isSigningOut ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <LogOut className="size-4" aria-hidden="true" />}
                <span>{isSigningOut ? tCommon("signingOut") : tAuth("signOut")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

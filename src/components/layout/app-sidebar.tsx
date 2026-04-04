"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
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
import { BookOpen, FileCode, Send, Users, User, LayoutDashboard, GraduationCap, Shield, LogOut, LogIn, History, FolderOpen, Blocks, Trophy, MessageCircle, Timer, KeyRound, Code, Settings, Server, Play, Upload, Tags } from "lucide-react";

interface AppSidebarProps {
  user: {
    id: string;
    username?: string | null;
    name?: string | null;
    email?: string | null;
    role: string;
  };
  siteTitle: string;
  capabilities?: string[];
}

type NavItem = {
  titleKey: string;
  href: string;
  icon: typeof LayoutDashboard;
  capability?: string;
};

type NavGroup = {
  labelKey: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    labelKey: "navigation",
    items: [
      { titleKey: "dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    labelKey: "learning",
    items: [
      { titleKey: "problems", href: "/dashboard/problems", icon: BookOpen },
      { titleKey: "submissions", href: "/dashboard/submissions", icon: Send },
      { titleKey: "contests", href: "/dashboard/contests", icon: Timer },
      { titleKey: "compiler", href: "/dashboard/compiler", icon: Play },
      { titleKey: "rankings", href: "/dashboard/rankings", icon: Trophy },
    ],
  },
  {
    labelKey: "manage",
    items: [
      { titleKey: "groups", href: "/dashboard/groups", icon: Users },
      { titleKey: "problemSets", href: "/dashboard/problem-sets", icon: FolderOpen, capability: "problem_sets.create" },
    ],
  },
  {
    labelKey: "account",
    items: [
      { titleKey: "profile", href: "/dashboard/profile", icon: User },
    ],
  },
];

const adminGroups: NavGroup[] = [
  {
    labelKey: "adminUsers",
    items: [
      { titleKey: "userManagement", href: "/dashboard/admin/users", icon: Shield, capability: "users.view" },
      { titleKey: "roleManagement", href: "/dashboard/admin/roles", icon: KeyRound, capability: "users.manage_roles" },
    ],
  },
  {
    labelKey: "adminMonitoring",
    items: [
      { titleKey: "allSubmissions", href: "/dashboard/admin/submissions", icon: FileCode, capability: "submissions.view_all" },
      { titleKey: "judgeWorkers", href: "/dashboard/admin/workers", icon: Server, capability: "system.settings" },
      { titleKey: "auditLogs", href: "/dashboard/admin/audit-logs", icon: History, capability: "system.audit_logs" },
      { titleKey: "loginLogs", href: "/dashboard/admin/login-logs", icon: LogIn, capability: "system.login_logs" },
      { titleKey: "chatLogs", href: "/dashboard/admin/plugins/chat-logs", icon: MessageCircle, capability: "system.chat_logs" },
    ],
  },
  {
    labelKey: "adminSystem",
    items: [
      { titleKey: "fileManagement", href: "/dashboard/admin/files", icon: Upload, capability: "files.manage" },
      { titleKey: "apiKeys", href: "/dashboard/admin/api-keys", icon: KeyRound, capability: "system.settings" },
      { titleKey: "systemSettings", href: "/dashboard/admin/settings", icon: Settings, capability: "system.settings" },
      { titleKey: "languages", href: "/dashboard/admin/languages", icon: Code, capability: "system.settings" },
      { titleKey: "tagManagement", href: "/dashboard/admin/tags", icon: Tags, capability: "system.settings" },
      { titleKey: "plugins", href: "/dashboard/admin/plugins", icon: Blocks, capability: "system.plugins" },
    ],
  },
];

function NavItems({ items, pathname, t }: { items: NavItem[]; pathname: string; t: (key: string) => string }) {
  return (
    <>
      {items.map((item) => {
        const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              isActive={isActive}
              aria-current={isActive ? "page" : undefined}
              render={<Link href={item.href} />}
            >
              <item.icon className="size-4" aria-hidden="true" />
              <span>{t(item.titleKey)}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </>
  );
}

export function AppSidebar({ user, siteTitle, capabilities = [] }: AppSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const roleLabels: Record<string, string> = {
    student: tCommon("roles.student"),
    instructor: tCommon("roles.instructor"),
    admin: tCommon("roles.admin"),
    super_admin: tCommon("roles.super_admin"),
  };

  const capsSet = new Set(capabilities);

  function filterItems(items: NavItem[]) {
    return items.filter(item => !item.capability || capsSet.has(item.capability));
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    if (typeof window !== "undefined") {
      const keysToRemove = Object.keys(localStorage).filter((key) => key.startsWith("oj:"));
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    }
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b p-4">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6" aria-hidden="true" />
          <span className="text-lg font-bold">{siteTitle}</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => {
          const filtered = filterItems(group.items);
          if (filtered.length === 0) return null;
          return (
            <SidebarGroup key={group.labelKey}>
              <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <NavItems items={filtered} pathname={pathname} t={t} />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}

        {adminGroups.some(g => filterItems(g.items).length > 0) && (
          <>
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
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
                      <NavItems items={filtered} pathname={pathname} t={t} />
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
                <LogOut className="size-4" aria-hidden="true" />
                <span>{isSigningOut ? tCommon("loading") : tAuth("signOut")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

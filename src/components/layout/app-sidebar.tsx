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
import { BookOpen, FileCode, Send, Users, User, LayoutDashboard, GraduationCap, Shield, LogOut, LogIn } from "lucide-react";
import type { UserRole } from "@/types";

interface AppSidebarProps {
  user: {
    id: string;
    username?: string | null;
    name?: string | null;
    email?: string | null;
    role: UserRole;
  };
  siteTitle: string;
}

const navItems = [
  { titleKey: "dashboard" as const, href: "/dashboard", icon: LayoutDashboard, roles: ["super_admin", "admin", "instructor", "student"] },
  { titleKey: "problems" as const, href: "/dashboard/problems", icon: BookOpen, roles: ["super_admin", "admin", "instructor", "student"] },
  { titleKey: "submissions" as const, href: "/dashboard/submissions", icon: Send, roles: ["super_admin", "admin", "instructor", "student"] },
  { titleKey: "groups" as const, href: "/dashboard/groups", icon: Users, roles: ["super_admin", "admin", "instructor", "student"] },
  { titleKey: "profile" as const, href: "/dashboard/profile", icon: User, roles: ["super_admin", "admin", "instructor", "student"] },
];

const adminItems = [
  { titleKey: "userManagement" as const, href: "/dashboard/admin/users", icon: Shield, roles: ["super_admin", "admin"] },
  { titleKey: "allSubmissions" as const, href: "/dashboard/admin/submissions", icon: FileCode, roles: ["super_admin", "admin"] },
  { titleKey: "loginLogs" as const, href: "/dashboard/admin/login-logs", icon: LogIn, roles: ["super_admin", "admin"] },
  { titleKey: "systemSettings" as const, href: "/dashboard/admin/settings", icon: GraduationCap, roles: ["super_admin", "admin"] },
];

export function AppSidebar({ user, siteTitle }: AppSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const roleLabels = {
    student: tCommon("roles.student"),
    instructor: tCommon("roles.instructor"),
    admin: tCommon("roles.admin"),
    super_admin: tCommon("roles.super_admin"),
  };

  const filteredNav = navItems.filter(item => item.roles.includes(user.role));
  const filteredAdmin = adminItems.filter(item => item.roles.includes(user.role));

  async function handleSignOut() {
    setIsSigningOut(true);
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b p-4">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6" />
          <span className="text-lg font-bold">{siteTitle}</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("navigation")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"))}
                    render={<Link href={item.href} />}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{t(item.titleKey)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {filteredAdmin.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("administration")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredAdmin.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                      render={<Link href={item.href} />}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{t(item.titleKey)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <div className="flex flex-col text-sm">
              <span className="font-medium">{user.name} ({user.username})</span>
              <span className="text-xs text-muted-foreground">{roleLabels[user.role]}</span>
            </div>
          </div>

          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => void handleSignOut()} disabled={isSigningOut}>
                <LogOut className="h-4 w-4" />
                <span>{isSigningOut ? tCommon("loading") : tAuth("signOut")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

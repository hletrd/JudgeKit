"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { BookOpen, FileCode, Send, Users, User, LayoutDashboard, GraduationCap, Shield } from "lucide-react";
import type { UserRole } from "@/types";

interface AppSidebarProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    role: UserRole;
  };
}

const navItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["super_admin", "admin", "instructor", "student"] },
  { title: "Problems", href: "/dashboard/problems", icon: BookOpen, roles: ["super_admin", "admin", "instructor", "student"] },
  { title: "Submissions", href: "/dashboard/submissions", icon: Send, roles: ["super_admin", "admin", "instructor", "student"] },
  { title: "Groups", href: "/dashboard/groups", icon: Users, roles: ["super_admin", "admin", "instructor", "student"] },
];

const adminItems = [
  { title: "User Management", href: "/dashboard/admin/users", icon: Shield, roles: ["super_admin", "admin"] },
  { title: "All Submissions", href: "/dashboard/admin/submissions", icon: FileCode, roles: ["super_admin", "admin", "instructor"] },
];

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname();

  const filteredNav = navItems.filter(item => item.roles.includes(user.role));
  const filteredAdmin = adminItems.filter(item => item.roles.includes(user.role));

  return (
    <Sidebar>
      <SidebarHeader className="border-b p-4">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6" />
          <span className="text-lg font-bold">Online Judge</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"))}
                    render={<Link href={item.href} />}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {filteredAdmin.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredAdmin.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                      render={<Link href={item.href} />}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t p-4">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4" />
          <div className="flex flex-col text-sm">
            <span className="font-medium">{user.name}</span>
            <span className="text-xs text-muted-foreground">{user.role.replace("_", " ")}</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

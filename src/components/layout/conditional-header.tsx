"use client";

import { usePathname } from "next/navigation";
import { PublicHeader } from "@/components/layout/public-header";
import { SidebarTrigger } from "@/components/ui/sidebar";

type ConditionalHeaderProps = {
  siteTitle: string;
  items: { href: string; label: string }[];
  actions: { href: string; label: string }[];
  loggedInUser?: {
    name: string;
    href: string;
    label: string;
    capabilities?: string[];
  } | null;
  trailingSlot?: React.ReactNode;
  hasAdminCapabilities?: boolean;
};

export function ConditionalHeader({
  siteTitle,
  items,
  actions,
  loggedInUser,
  trailingSlot,
  hasAdminCapabilities = false,
}: ConditionalHeaderProps) {
  const pathname = usePathname();
  const stripped = pathname.replace(/^\/(en|ko)(?=\/|$)/, "");
  const isAdmin = stripped.startsWith("/dashboard/admin");

  if (isAdmin) {
    return (
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-2 px-4 py-3">
          <SidebarTrigger />
        </div>
      </header>
    );
  }

  return (
    <PublicHeader
      siteTitle={siteTitle}
      items={items}
      actions={actions}
      loggedInUser={loggedInUser}
      leadingSlot={hasAdminCapabilities ? <SidebarTrigger /> : undefined}
      trailingSlot={trailingSlot}
    />
  );
}

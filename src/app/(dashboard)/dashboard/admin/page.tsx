import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NO_INDEX_METADATA } from "@/lib/seo";
import { ADMIN_NAV_GROUPS } from "@/lib/navigation/admin-nav";

export const metadata: Metadata = NO_INDEX_METADATA;

export default async function AdminIndexPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const caps = await resolveCapabilities(session.user.role);
  const tNav = await getTranslations("nav");
  const tAdmin = await getTranslations("admin.index");
  const locale = await getLocale();

  const visibleGroups = ADMIN_NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => caps.has(item.capability)),
    }))
    .filter((group) => group.items.length > 0);

  if (visibleGroups.length === 0) {
    redirect("/dashboard");
  }

  // Per CLAUDE.md: Korean text must use default letter-spacing.
  // tracking-wide is for English uppercase only.
  const trackingClass = locale !== "ko" ? " tracking-wide" : "";

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{tNav("administration")}</h1>
        <p className="text-sm text-muted-foreground">{tAdmin("subtitle")}</p>
      </div>

      {visibleGroups.map((group) => (
        <section key={group.labelKey} className="space-y-3">
          <h2 className={`text-sm font-semibold uppercase${trackingClass} text-muted-foreground`}>
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

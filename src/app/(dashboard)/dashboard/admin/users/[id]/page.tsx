import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin" && session.user.role !== "super_admin") redirect("/dashboard");

  const resolvedParams = await params;
  const user = await db.query.users.findFirst({
    where: eq(users.id, resolvedParams.id),
  });

  if (!user) {
    notFound();
  }

  const t = await getTranslations("admin.users");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();
  const timeZone = await getResolvedSystemTimeZone();
  const roleLabels = {
    student: tCommon("roles.student"),
    instructor: tCommon("roles.instructor"),
    admin: tCommon("roles.admin"),
    super_admin: tCommon("roles.super_admin"),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{user.name}</h2>
          <p className="text-sm text-muted-foreground">@{user.username}</p>
        </div>
        <Link href="/dashboard/admin/users" className="text-sm text-primary hover:underline">
          {t("usersList")}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t("table.username")}</p>
            <p className="font-medium">{user.username}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t("table.name")}</p>
            <p className="font-medium">{user.name}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t("table.email")}</p>
            <p className="font-medium">{user.email || "-"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{tCommon("class")}</p>
            <p className="font-medium">{user.className || tCommon("notSet")}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t("table.role")}</p>
            <Badge variant="outline">{roleLabels[user.role as keyof typeof roleLabels] ?? user.role}</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t("table.status")}</p>
            {user.isActive ? (
              <Badge className="bg-green-500">{tCommon("active")}</Badge>
            ) : (
              <Badge variant="destructive">{tCommon("inactive")}</Badge>
            )}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <p className="text-sm text-muted-foreground">{t("table.joined")}</p>
            <p className="font-medium">
              {user.createdAt ? formatDateTimeInTimeZone(user.createdAt, locale, timeZone) : "-"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

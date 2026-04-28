import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { roles, users } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import UserActions from "../user-actions";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caps = await resolveCapabilities(session.user.role);
  if (!caps.has("users.view")) redirect("/dashboard");
  const canEditUsers = caps.has("users.edit");
  const canDeleteUsers = caps.has("users.delete");

  const resolvedParams = await params;
  const user = await db.query.users.findFirst({
    where: eq(users.id, resolvedParams.id),
    columns: {
      id: true,
      username: true,
      name: true,
      email: true,
      className: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!user) {
    notFound();
  }

  const t = await getTranslations("admin.users");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();
  const timeZone = await getResolvedSystemTimeZone();
  const builtinRoleLabels = {
    student: tCommon("roles.student"),
    assistant: tCommon("roles.assistant"),
    instructor: tCommon("roles.instructor"),
    admin: tCommon("roles.admin"),
    super_admin: tCommon("roles.super_admin"),
  };
  const roleRecord = await db.query.roles.findFirst({
    where: eq(roles.name, user.role),
    columns: { displayName: true, level: true },
  });
  const roleLabel = builtinRoleLabels[user.role as keyof typeof builtinRoleLabels]
    ?? roleRecord?.displayName
    ?? user.role;

  return (
    <div className="space-y-4">
      <Link href="/dashboard/admin/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {tCommon("back")}
      </Link>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{user.name}</h2>
          <p className="text-sm text-muted-foreground">@{user.username}</p>
        </div>
        <div className="flex items-center gap-2">
          <UserActions
            userId={user.id}
            username={user.username}
            isActive={!!user.isActive}
            isSelf={user.id === session.user.id}
            userLevel={roleRecord?.level}
            actorCanEdit={canEditUsers}
            actorCanDelete={canDeleteUsers}
            triggerVariant={user.isActive ? "destructive" : "outline"}
          />
        </div>
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
            <Badge variant="outline">{roleLabel}</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t("table.status")}</p>
            {user.isActive ? (
              <Badge className="bg-green-500 text-white dark:bg-green-600 dark:text-white">{tCommon("active")}</Badge>
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

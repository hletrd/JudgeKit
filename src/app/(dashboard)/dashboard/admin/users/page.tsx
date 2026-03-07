import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import UserActions from "./user-actions";
import AddUserDialog from "./add-user-dialog";
import EditUserDialog from "./edit-user-dialog";
import { formatDateInTimeZone } from "@/lib/datetime";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";

export default async function UserManagementPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin" && session.user.role !== "super_admin") redirect("/dashboard");

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
  const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <AddUserDialog />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("usersList")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.username")}</TableHead>
                <TableHead>{tCommon("class")}</TableHead>
                <TableHead>{t("table.email")}</TableHead>
                <TableHead>{t("table.name")}</TableHead>
                <TableHead>{t("table.role")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.joined")}</TableHead>
                <TableHead>{tCommon("action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    <Link href={`/dashboard/admin/users/${user.id}`} className="text-primary hover:underline">
                      {user.username}
                    </Link>
                  </TableCell>
                  <TableCell>{user.className || tCommon("notSet")}</TableCell>
                  <TableCell>{user.email || "-"}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{roleLabels[user.role as keyof typeof roleLabels] ?? user.role}</Badge>
                  </TableCell>
                  <TableCell>
                    {user.isActive ? (
                      <Badge className="bg-green-500">{tCommon("active")}</Badge>
                    ) : (
                      <Badge variant="destructive">{tCommon("inactive")}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.createdAt ? formatDateInTimeZone(user.createdAt, locale, timeZone) : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2 items-center">
                      <EditUserDialog user={{
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        name: user.name,
                        className: user.className,
                        role: user.role
                      }} />
                      <UserActions 
                        userId={user.id} 
                        isActive={!!user.isActive} 
                        isSelf={user.id === session.user.id} 
                        userRole={user.role}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {allUsers.length === 0 && (
                <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      {t("noUsers")}
                    </TableCell>
                  </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

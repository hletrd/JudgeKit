import { getTranslations } from "next-intl/server";
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

export default async function UserManagementPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin" && session.user.role !== "super_admin") redirect("/dashboard");

  const t = await getTranslations("admin.users");
  const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">{t("title")}</h2>
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{user.role}</Badge>
                  </TableCell>
                  <TableCell>
                    {user.isActive ? (
                      <Badge className="bg-green-500">Active</Badge>
                    ) : (
                      <Badge variant="destructive">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}
                  </TableCell>
                </TableRow>
              ))}
              {allUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No users found.
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

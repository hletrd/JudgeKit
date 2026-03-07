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
import { db } from "@/lib/db";
import { groups, enrollments, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function GroupsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("groups");
  
  let myGroups;

  if (session.user.role === "admin" || session.user.role === "super_admin" || session.user.role === "instructor") {
    // Admins and instructors see groups they created or all groups
    myGroups = await db
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        instructor: {
          name: users.name,
        }
      })
      .from(groups)
      .leftJoin(users, eq(groups.instructorId, users.id));
  } else {
    // Students see groups they are enrolled in
    const userEnrollments = await db
      .select({
        group: {
          id: groups.id,
          name: groups.name,
          description: groups.description,
          instructorId: groups.instructorId,
        },
        instructor: {
          name: users.name,
        }
      })
      .from(enrollments)
      .innerJoin(groups, eq(enrollments.groupId, groups.id))
      .leftJoin(users, eq(groups.instructorId, users.id))
      .where(eq(enrollments.userId, session.user.id));
      
    myGroups = userEnrollments.map(e => ({
      id: e.group.id,
      name: e.group.name,
      description: e.group.description,
      instructor: {
        name: e.instructor?.name || "Unknown",
      }
    }));
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        {(session.user.role === "admin" || session.user.role === "super_admin" || session.user.role === "instructor") && (
          <Button>Create Group</Button>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>My Groups</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Instructor</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {myGroups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell>{group.description || "-"}</TableCell>
                  <TableCell>{group.instructor?.name || "Unknown"}</TableCell>
                  <TableCell>
                    <Link href={`/dashboard/groups/${group.id}`}>
                      <Button variant="outline" size="sm">View</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {myGroups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    You are not enrolled in any groups.
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

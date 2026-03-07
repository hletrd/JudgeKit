import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { groups, enrollments, assignments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const resolvedParams = await params;
  const groupId = resolvedParams.id;

  const t = await getTranslations("groups");
  const tCommon = await getTranslations("common");
  
  const group = await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
    with: {
      instructor: {
        columns: { name: true, email: true }
      }
    }
  });

  if (!group) {
    notFound();
  }

  // Access check: only enrolled students or admins/instructor
  const isEnrolled = await db.query.enrollments.findFirst({
    where: eq(enrollments.groupId, groupId) && eq(enrollments.userId, session.user.id)
  });

  if (!isEnrolled && group.instructorId !== session.user.id && session.user.role !== "admin" && session.user.role !== "super_admin") {
    redirect("/dashboard/groups");
  }

  // Fetch group assignments
  const groupAssignments = await db.select().from(assignments).where(eq(assignments.groupId, groupId));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">{group.name}</h2>
        <p className="text-muted-foreground">{group.description || tCommon("unknown")}</p>
        <div className="mt-2 flex gap-2">
          <Badge variant="outline">Instructor: {group.instructor?.name || tCommon("unknown")}</Badge>
          <Badge variant={group.isArchived ? "destructive" : "default"}>
            {group.isArchived ? t("archived") : t("active")}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("assignments")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("assignmentTable.title")}</TableHead>
                <TableHead>{t("assignmentTable.startsAt")}</TableHead>
                <TableHead>{t("assignmentTable.deadline")}</TableHead>
                <TableHead>{t("assignmentTable.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupAssignments.map((assignment) => {
                const now = new Date();
                const isUpcoming = assignment.startsAt && new Date(assignment.startsAt) > now;
                const isPast = assignment.deadline && new Date(assignment.deadline) < now;
                
                return (
                  <TableRow key={assignment.id}>
                    <TableCell className="font-medium">{assignment.title}</TableCell>
                    <TableCell>{assignment.startsAt ? new Date(assignment.startsAt).toLocaleString() : "-"}</TableCell>
                    <TableCell>{assignment.deadline ? new Date(assignment.deadline).toLocaleString() : "-"}</TableCell>
                    <TableCell>
                      {isUpcoming ? (
                        <Badge variant="secondary">{t("statusUpcoming")}</Badge>
                      ) : isPast ? (
                        <Badge variant="outline">{t("statusClosed")}</Badge>
                      ) : (
                        <Badge className="bg-green-500">{t("statusOpen")}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {groupAssignments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t("noAssignments")}
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

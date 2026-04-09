import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/lib/db";
import { groupInstructors, groups, enrollments, users } from "@/lib/db/schema";
import { and, eq, or } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { canManageUsers, isInstructorOrAbove } from "@/lib/auth/role-helpers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import CreateGroupDialog from "./create-group-dialog";
import { PaginationControls } from "@/components/pagination-controls";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { getRecruitingAccessContext } from "@/lib/recruiting/access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("groups");
  return { title: t("title") };
}

export default async function GroupsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const PAGE_SIZE = 25;
  const currentPage = Math.max(1, Math.floor(Number(resolvedSearchParams?.page ?? "1")) || 1);

  const t = await getTranslations("groups");
  const tCommon = await getTranslations("common");
  const caps = await resolveCapabilities(session.user.role);
  const { isRecruitingCandidate, effectivePlatformMode } = await getRecruitingAccessContext(session.user.id);

  if (
    effectivePlatformMode === "recruiting" &&
    (isRecruitingCandidate || (!caps.has("system.settings") && !caps.has("submissions.view_all")))
  ) {
    redirect("/dashboard");
  }
  
  let myGroups;

  if (canManageUsers(session.user.role) || caps.has("groups.view_all")) {
    myGroups = await db
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        isArchived: groups.isArchived,
        instructor: {
          name: users.name,
        }
      })
      .from(groups)
      .leftJoin(users, eq(groups.instructorId, users.id));
  } else {
    const instructionalGroups = await db
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        isArchived: groups.isArchived,
        instructor: {
          name: users.name,
        }
      })
      .from(groups)
      .leftJoin(users, eq(groups.instructorId, users.id))
      .leftJoin(
        groupInstructors,
        and(eq(groupInstructors.groupId, groups.id), eq(groupInstructors.userId, session.user.id))
      )
      .where(
        or(
          eq(groups.instructorId, session.user.id),
          eq(groupInstructors.userId, session.user.id)
        )
      );

    // Students (and instructional users who are also enrolled) see enrolled groups too.
    const userEnrollments = await db
      .select({
        group: {
          id: groups.id,
          name: groups.name,
          description: groups.description,
          instructorId: groups.instructorId,
          isArchived: groups.isArchived,
        },
        instructor: {
          name: users.name,
        }
      })
      .from(enrollments)
      .innerJoin(groups, eq(enrollments.groupId, groups.id))
      .leftJoin(users, eq(groups.instructorId, users.id))
      .where(eq(enrollments.userId, session.user.id));

    const visibleGroups = new Map<string, {
      id: string;
      name: string;
      description: string | null;
      isArchived: boolean | null;
      instructor: { name: string };
    }>();

    for (const group of instructionalGroups) {
      visibleGroups.set(group.id, {
        ...group,
        isArchived: group.isArchived ?? false,
        instructor: {
          name: group.instructor?.name || tCommon("unknown"),
        },
      });
    }

    for (const enrollment of userEnrollments) {
      visibleGroups.set(enrollment.group.id, {
        id: enrollment.group.id,
        name: enrollment.group.name,
        description: enrollment.group.description,
        isArchived: enrollment.group.isArchived ?? false,
        instructor: {
          name: enrollment.instructor?.name || tCommon("unknown"),
        }
      });
    }

    myGroups = Array.from(visibleGroups.values());
  }

  const totalCount = myGroups.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const clampedPage = Math.min(currentPage, totalPages);
  const offset = (clampedPage - 1) * PAGE_SIZE;
  const pagedGroups = myGroups.slice(offset, offset + PAGE_SIZE);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        {isInstructorOrAbove(session.user.role) && (
          <CreateGroupDialog />
        )}
      </div>
      <Card>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.name")}</TableHead>
                <TableHead>{t("table.description")}</TableHead>
                <TableHead>{t("table.instructor")}</TableHead>
                <TableHead>{t("table.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedGroups.map((group) => (
                <TableRow key={group.id} className={group.isArchived ? "opacity-60" : undefined}>
                  <TableCell className="font-medium">
                    <span className={group.isArchived ? "text-muted-foreground" : undefined}>
                      {group.name}
                    </span>
                    {group.isArchived && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {t("archived")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md !whitespace-pre-wrap break-words text-muted-foreground">
                    {group.description || "-"}
                  </TableCell>
                  <TableCell>{group.instructor?.name || tCommon("unknown")}</TableCell>
                  <TableCell>
                    <Link href={`/dashboard/groups/${group.id}`}>
                      <Button variant="outline" size="sm">{tCommon("view")}</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {pagedGroups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t("noGroups")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
      <PaginationControls
        currentPage={clampedPage}
        totalPages={totalPages}
        buildHref={(page) => page > 1 ? `/dashboard/groups?page=${page}` : "/dashboard/groups"}
      />
    </div>
  );
}

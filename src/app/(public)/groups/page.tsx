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
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import CreateGroupDialog from "./create-group-dialog";
import EditGroupDialog from "./edit-group-dialog";
import { PaginationControls } from "@/components/pagination-controls";
import { resolveCapabilities, getAllRoleLevels } from "@/lib/capabilities/cache";
import { getRecruitingAccessContext } from "@/lib/recruiting/access";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/filter-select";
import { normalizePage } from "@/lib/pagination";

const GROUP_STATE_FILTER_VALUES = ["all", "active", "archived"] as const;

type GroupStateFilter = (typeof GROUP_STATE_FILTER_VALUES)[number];

function normalizeSearchQuery(value?: string) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 100);
}

function normalizeGroupStateFilter(value?: string): GroupStateFilter {
  return GROUP_STATE_FILTER_VALUES.includes((value ?? "all") as GroupStateFilter)
    ? ((value ?? "all") as GroupStateFilter)
    : "all";
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("groups");
  return { title: t("title") };
}

export default async function GroupsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; search?: string; state?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const PAGE_SIZE = 25;
  const currentPage = normalizePage(resolvedSearchParams?.page);
  const searchQuery = normalizeSearchQuery(resolvedSearchParams?.search);
  const stateFilter = normalizeGroupStateFilter(resolvedSearchParams?.state);
  const normalizedSearch = searchQuery.toLowerCase();

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
  const canViewAllGroups = caps.has("groups.view_all");
  const canCreateGroups = caps.has("groups.create");
  const canEditGroups = caps.has("groups.edit");
  
  let myGroups;
  const roleLevels = canEditGroups ? await getAllRoleLevels() : new Map<string, number>();
  const availableInstructorUsers = canEditGroups
    ? (await db.query.users.findMany({
        where: and(eq(users.isActive, true)),
        columns: { id: true, username: true, name: true, role: true },
      }))
        .filter((user) => (roleLevels.get(user.role) ?? -1) > 0)
        .map((user) => ({ id: user.id, name: user.name, username: user.username }))
    : [];

  if (canViewAllGroups) {
    myGroups = await db
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        instructorId: groups.instructorId,
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
        instructorId: groups.instructorId,
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
      instructorId: string | null;
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
        instructorId: enrollment.group.instructorId,
        isArchived: enrollment.group.isArchived ?? false,
        instructor: {
          name: enrollment.instructor?.name || tCommon("unknown"),
        }
      });
    }

    myGroups = Array.from(visibleGroups.values());
  }

  const filteredGroups = myGroups.filter((group) => {
    const matchesSearch = normalizedSearch
      ? [group.name, group.description ?? "", group.instructor?.name ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch)
      : true;

    const matchesState =
      stateFilter === "all"
        ? true
        : stateFilter === "archived"
          ? Boolean(group.isArchived)
          : !group.isArchived;

    return matchesSearch && matchesState;
  });

  const totalCount = filteredGroups.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const clampedPage = Math.min(currentPage, totalPages);
  const offset = (clampedPage - 1) * PAGE_SIZE;
  const pagedGroups = filteredGroups.slice(offset, offset + PAGE_SIZE);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        {canCreateGroups && (
          <CreateGroupDialog />
        )}
      </div>
      <Card className="mb-4">
        <CardContent>
          <form className="flex flex-col gap-4 md:flex-row md:items-end" method="get">
            <div className="flex-1 space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="groups-search">
                {t("searchLabel")}
              </label>
              <Input
                id="groups-search"
                name="search"
                type="search"
                defaultValue={searchQuery}
                placeholder={t("searchPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="groups-state">
                {t("stateFilterLabel")}
              </label>
              <FilterSelect
                name="state"
                defaultValue={stateFilter}
                placeholder={t("allStates")}
                options={GROUP_STATE_FILTER_VALUES.map((value) => ({
                  value,
                  label:
                    value === "all"
                      ? t("allStates")
                      : value === "active"
                        ? t("active")
                        : t("archived"),
                }))}
              />
            </div>
            <div className="flex gap-2 items-end">
              <Button type="submit">{tCommon("search")}</Button>
              <Link href="/groups">
                <Button type="button" variant="outline">{t("resetSearch")}</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
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
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/dashboard/groups/${group.id}`}>
                        <Button variant="outline" size="sm">{tCommon("view")}</Button>
                      </Link>
                      {canEditGroups ? (
                        <EditGroupDialog
                          group={{
                            id: group.id,
                            name: group.name,
                            description: group.description,
                            instructorId: group.instructorId,
                            availableInstructors: availableInstructorUsers,
                          }}
                        />
                      ) : null}
                    </div>
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
        buildHref={(page) => {
          const params = new URLSearchParams();
          if (page > 1) params.set("page", String(page));
          if (searchQuery) params.set("search", searchQuery);
          if (stateFilter !== "all") params.set("state", stateFilter);
          const qs = params.toString();
          return qs ? `/dashboard/groups?${qs}` : "/groups";
        }}
      />
    </div>
  );
}

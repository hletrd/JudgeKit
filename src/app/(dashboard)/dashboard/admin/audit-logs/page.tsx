import Link from "next/link";
import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { FilterSelect } from "@/components/filter-select";
import { db } from "@/lib/db";
import { auditEvents, users } from "@/lib/db/schema";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";

const PAGE_SIZE = 50;
const PAGE_PATH = "/dashboard/admin/audit-logs";
const RESOURCE_FILTER_VALUES = [
  "all",
  "system_settings",
  "user",
  "problem",
  "group",
  "group_member",
  "assignment",
  "submission",
] as const;

type ResourceFilter = (typeof RESOURCE_FILTER_VALUES)[number];

function normalizePage(value?: string) {
  const parsed = Number(value ?? "1");

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.floor(parsed);
}

function normalizeResourceFilter(value?: string): ResourceFilter {
  if (RESOURCE_FILTER_VALUES.includes(value as ResourceFilter)) {
    return value as ResourceFilter;
  }

  return "all";
}

function normalizeSearchQuery(value?: string) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 100);
}

function escapeLikePattern(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function buildPageHref(page: number, resourceType: ResourceFilter, search: string) {
  const params = new URLSearchParams();

  if (page > 1) {
    params.set("page", String(page));
  }

  if (resourceType !== "all") {
    params.set("resource", resourceType);
  }

  if (search) {
    params.set("search", search);
  }

  const queryString = params.toString();
  return queryString ? `${PAGE_PATH}?${queryString}` : PAGE_PATH;
}

function buildGroupMemberScopeFilter(groupIds: string[]) {
  if (groupIds.length === 0) {
    return sql`0`;
  }

  return or(
    ...groupIds.map(
      (groupId) =>
        sql`json_extract(${auditEvents.details}, '$.groupId') = ${groupId}`
    )
  );
}

export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; resource?: string; search?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caps = await resolveCapabilities(session.user.role);
  if (!caps.has("system.audit_logs")) redirect("/dashboard");
  const isAdminViewer = caps.has("users.edit");
  const isInstructorViewer = !caps.has("users.edit");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedPage = normalizePage(resolvedSearchParams?.page);
  const resourceTypeFilter = normalizeResourceFilter(resolvedSearchParams?.resource);
  const searchQuery = normalizeSearchQuery(resolvedSearchParams?.search);
  const normalizedSearch = searchQuery.toLowerCase();
  const [t, tCommon, locale, timeZone] = await Promise.all([
    getTranslations("admin.auditLogs"),
    getTranslations("common"),
    getLocale(),
    getResolvedSystemTimeZone(),
  ]);

  const resourceLabels = {
    all: t("resourceTypes.all"),
    system_settings: t("resourceTypes.system_settings"),
    user: t("resourceTypes.user"),
    problem: t("resourceTypes.problem"),
    group: t("resourceTypes.group"),
    group_member: t("resourceTypes.group_member"),
    assignment: t("resourceTypes.assignment"),
    submission: t("resourceTypes.submission"),
  };
  const actorLabels = {
    system: tCommon("system"),
    student: tCommon("roles.student"),
    instructor: tCommon("roles.instructor"),
    admin: tCommon("roles.admin"),
    super_admin: tCommon("roles.super_admin"),
  } as const;

  const filters: SQL[] = [];
  if (isInstructorViewer) {
    const ownedGroups = await db.query.groups.findMany({
      where: (groups, { eq: equals }) => equals(groups.instructorId, session.user.id),
      columns: { id: true },
    });
    const groupIds = ownedGroups.map((group) => group.id);
    const assignmentIds =
      groupIds.length > 0
        ? (
            await db.query.assignments.findMany({
              where: (assignments, { inArray: inArrayOperator }) =>
                inArrayOperator(assignments.groupId, groupIds),
              columns: { id: true },
            })
          ).map((assignment) => assignment.id)
        : [];
    const submissionIds =
      assignmentIds.length > 0
        ? (
            await db.query.submissions.findMany({
              where: (submissions, { inArray: inArrayOperator }) =>
                inArrayOperator(submissions.assignmentId, assignmentIds),
              columns: { id: true },
            })
          ).map((submission) => submission.id)
        : [];
    const problemIds =
      groupIds.length > 0
        ? (
            await db.query.problems.findMany({
              where: (problems, { eq: equals }) => equals(problems.authorId, session.user.id),
              columns: { id: true },
            })
          ).map((problem) => problem.id)
        : [];

    const scopeFilters: SQL[] = [];

    if (groupIds.length > 0) {
      const groupScope = and(
        eq(auditEvents.resourceType, "group"),
        inArray(auditEvents.resourceId, groupIds)
      );
      const memberScope = and(
        eq(auditEvents.resourceType, "group_member"),
        buildGroupMemberScopeFilter(groupIds)
      );

      if (groupScope) scopeFilters.push(groupScope);
      if (memberScope) scopeFilters.push(memberScope);
    }

    if (assignmentIds.length > 0) {
      const assignmentScope = and(
        eq(auditEvents.resourceType, "assignment"),
        inArray(auditEvents.resourceId, assignmentIds)
      );
      if (assignmentScope) scopeFilters.push(assignmentScope);
    }

    if (submissionIds.length > 0) {
      const submissionScope = and(
        eq(auditEvents.resourceType, "submission"),
        inArray(auditEvents.resourceId, submissionIds)
      );
      if (submissionScope) scopeFilters.push(submissionScope);
    }

    if (problemIds.length > 0) {
      const problemScope = and(
        eq(auditEvents.resourceType, "problem"),
        inArray(auditEvents.resourceId, problemIds)
      );
      if (problemScope) scopeFilters.push(problemScope);
    }

    const scopedInstructorFilter = scopeFilters.length > 0 ? or(...scopeFilters) : sql`0`;
    if (scopedInstructorFilter) filters.push(scopedInstructorFilter);
  }

  if (resourceTypeFilter !== "all") {
    filters.push(eq(auditEvents.resourceType, resourceTypeFilter));
  }

  if (normalizedSearch) {
    const likePattern = `%${escapeLikePattern(normalizedSearch)}%`;

    filters.push(sql`
      (
        lower(coalesce(${auditEvents.action}, '')) like ${likePattern} escape '\\'
        or lower(coalesce(${auditEvents.resourceId}, '')) like ${likePattern} escape '\\'
        or lower(coalesce(${auditEvents.resourceLabel}, '')) like ${likePattern} escape '\\'
        or lower(coalesce(${auditEvents.summary}, '')) like ${likePattern} escape '\\'
        or lower(coalesce(${auditEvents.details}, '')) like ${likePattern} escape '\\'
        or lower(coalesce(${auditEvents.requestMethod}, '')) like ${likePattern} escape '\\'
        or lower(coalesce(${auditEvents.requestPath}, '')) like ${likePattern} escape '\\'
        or lower(coalesce(${users.username}, '')) like ${likePattern} escape '\\'
        or lower(coalesce(${users.name}, '')) like ${likePattern} escape '\\'
      )
    `);
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;
  const countQuery = db
    .select({ total: sql<number>`count(${auditEvents.id})` })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.actorId, users.id));
  const [{ total }] = whereClause ? await countQuery.where(whereClause) : await countQuery;
  const totalCount = Number(total ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const eventsQuery = db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      resourceType: auditEvents.resourceType,
      resourceId: auditEvents.resourceId,
      resourceLabel: auditEvents.resourceLabel,
      summary: auditEvents.summary,
      details: auditEvents.details,
      ipAddress: auditEvents.ipAddress,
      requestMethod: auditEvents.requestMethod,
      requestPath: auditEvents.requestPath,
      userAgent: auditEvents.userAgent,
      createdAt: auditEvents.createdAt,
      actorRole: auditEvents.actorRole,
      actor: {
        id: users.id,
        name: users.name,
        username: users.username,
      },
    })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.actorId, users.id));
  const filteredEventsQuery = whereClause ? eventsQuery.where(whereClause) : eventsQuery;
  const visibleEvents = await filteredEventsQuery.orderBy(desc(auditEvents.createdAt)).limit(PAGE_SIZE).offset(offset);
  const rangeStart = visibleEvents.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + visibleEvents.length;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("filtersTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4 md:flex-row md:items-end" method="get">
            <div className="flex-1 space-y-3">
              <label className="text-sm font-medium" htmlFor="audit-log-search">
                {t("filters.searchLabel")}
              </label>
              <Input
                id="audit-log-search"
                name="search"
                type="search"
                defaultValue={searchQuery}
                placeholder={t("filters.searchPlaceholder")}
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium" htmlFor="audit-log-resource-type">
                {t("filters.resourceTypeLabel")}
              </label>
              <FilterSelect
                name="resource"
                defaultValue={resourceTypeFilter}
                placeholder={resourceLabels.all}
                options={RESOURCE_FILTER_VALUES.map((value) => ({
                  value,
                  label: resourceLabels[value],
                }))}
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit">{t("applyFilters")}</Button>
              <Link href={PAGE_PATH}>
                <Button type="button" variant="outline">{t("resetFilters")}</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("resultsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {visibleEvents.length > 0 && (
            <p className="mb-4 text-sm text-muted-foreground">
              {t("pagination.results", { start: rangeStart, end: rangeEnd, total: totalCount })}
            </p>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.timestamp")}</TableHead>
                <TableHead>{t("table.action")}</TableHead>
                <TableHead>{t("table.resource")}</TableHead>
                <TableHead>{t("table.actor")}</TableHead>
                <TableHead>{t("table.summary")}</TableHead>
                <TableHead>{t("table.details")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleEvents.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    {event.createdAt ? formatDateTimeInTimeZone(event.createdAt, locale, timeZone) : "-"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{event.action}</TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">
                      {resourceLabels[event.resourceType as keyof typeof resourceLabels] ?? event.resourceType}
                    </div>
                    <div className="text-xs text-muted-foreground">{event.resourceLabel ?? event.resourceId ?? "-"}</div>
                    {event.resourceId && event.resourceLabel !== event.resourceId ? (
                      <div className="text-xs text-muted-foreground/80">ID: {event.resourceId}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {event.actor?.id ? (
                      isAdminViewer ? (
                        <Link href={`/dashboard/admin/users/${event.actor.id}`} className="block text-primary hover:underline">
                          <div className="font-medium text-foreground">{event.actor.name}</div>
                          <div className="text-xs text-muted-foreground">@{event.actor.username}</div>
                        </Link>
                      ) : (
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">{event.actor.name}</div>
                        <div className="text-xs text-muted-foreground">@{event.actor.username}</div>
                      </div>
                    )
                    ) : event.actorRole ? (
                      <div className="space-y-1">
                        <div className="font-medium text-foreground">
                          {actorLabels[event.actorRole as keyof typeof actorLabels] ?? event.actorRole}
                        </div>
                        <div className="text-xs text-muted-foreground">{t("systemGeneratedActor")}</div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{t("unknownActor")}</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal text-sm">{event.summary}</TableCell>
                  <TableCell className="text-sm">
                    {event.details || event.requestMethod || event.requestPath || event.ipAddress || event.userAgent ? (
                      <Collapsible className="max-w-xs whitespace-normal break-words">
                        <CollapsibleTrigger className="cursor-pointer text-primary hover:underline">{t("detailToggle")}</CollapsibleTrigger>
                        <CollapsibleContent className="mt-2 space-y-2">
                          {event.details ? (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-foreground">{t("detailSections.payload")}</p>
                              <pre className="rounded-md bg-muted p-2 text-xs overflow-x-auto whitespace-pre-wrap break-all">{event.details}</pre>
                            </div>
                          ) : null}
                          {event.requestMethod || event.requestPath || event.ipAddress || event.userAgent ? (
                            <div className="space-y-1 rounded-md border border-border/60 bg-background p-2 text-xs">
                              <p className="font-medium text-foreground">{t("detailSections.request")}</p>
                              {event.requestMethod ? (
                                <p>
                                  <span className="font-medium">{t("request.method")}:</span> {event.requestMethod}
                                </p>
                              ) : null}
                              {event.requestPath ? (
                                <p>
                                  <span className="font-medium">{t("request.path")}:</span> {event.requestPath}
                                </p>
                              ) : null}
                              {event.ipAddress ? (
                                <p>
                                  <span className="font-medium">{t("request.ipAddress")}:</span> {event.ipAddress}
                                </p>
                              ) : null}
                              {event.userAgent ? (
                                <p>
                                  <span className="font-medium">{t("request.userAgent")}:</span> {event.userAgent}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      <span className="text-muted-foreground">{tCommon("unknown")}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {visibleEvents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {t("noEvents")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {t("pagination.page", { current: currentPage, total: totalPages })}
        </p>
        <div className="flex items-center gap-2">
          {currentPage > 1 ? (
            <Link href={buildPageHref(currentPage - 1, resourceTypeFilter, searchQuery)}>
              <Button variant="outline">{tCommon("previous")}</Button>
            </Link>
          ) : (
            <Button variant="outline" disabled>
              {tCommon("previous")}
            </Button>
          )}

          {currentPage < totalPages ? (
            <Link href={buildPageHref(currentPage + 1, resourceTypeFilter, searchQuery)}>
              <Button variant="outline">{tCommon("next")}</Button>
            </Link>
          ) : (
            <Button variant="outline" disabled>
              {tCommon("next")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

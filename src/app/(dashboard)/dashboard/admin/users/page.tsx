import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FilterSelect } from "@/components/filter-select";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { users, roles } from "@/lib/db/schema";
import { safeUserSelect } from "@/lib/db/selects";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import UserActions from "./user-actions";
import AddUserDialog from "./add-user-dialog";
import BulkCreateDialog from "./bulk-create-dialog";
import EditUserDialog from "./edit-user-dialog";
import { formatDateInTimeZone } from "@/lib/datetime";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.users");
  return { title: t("title") };
}

const PAGE_SIZE = 25;

function normalizePage(value?: string) {
  const parsed = Number(value ?? "1");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function normalizeSearch(value?: string) {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

export default async function UserManagementPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; search?: string; role?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caps = await resolveCapabilities(session.user.role);
  if (!caps.has("users.view")) redirect("/dashboard");

  const isAdmin = caps.has("users.edit");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const t = await getTranslations("admin.users");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();
  const timeZone = await getResolvedSystemTimeZone();
  const currentPage = normalizePage(resolvedSearchParams?.page);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const searchQuery = normalizeSearch(resolvedSearchParams?.search);
  const roleFilter = resolvedSearchParams?.role;

  const availableRoles = await db
    .select({ name: roles.name, displayName: roles.displayName, level: roles.level })
    .from(roles)
    .orderBy(roles.level, roles.name);
  const roleLabels: Record<string, string> = {
    student: tCommon("roles.student"),
    instructor: tCommon("roles.instructor"),
    admin: tCommon("roles.admin"),
    super_admin: tCommon("roles.super_admin"),
  };
  // Add custom role display names
  for (const r of availableRoles) {
    if (!(r.name in roleLabels)) {
      roleLabels[r.name] = r.displayName;
    }
  }
  const validRoleNames = new Set(availableRoles.map((r) => r.name));
  const filters = [];

  // Instructors can only manage students
  if (!isAdmin) {
    filters.push(eq(users.role, "student"));
  }

  if (searchQuery) {
    const likePattern = `%${searchQuery.toLowerCase()}%`;
    filters.push(
      or(
        sql`lower(${users.username}) like ${likePattern}`,
        sql`lower(${users.name}) like ${likePattern}`
      )
    );
  }

  if (roleFilter && validRoleNames.has(roleFilter)) {
    filters.push(eq(users.role, roleFilter));
  }

  const whereClause =
    filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);

  const [totalRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(users)
    .where(whereClause);

  const allUsers = await db
    .select(safeUserSelect)
    .from(users)
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset(offset);
  const total = Number(totalRow?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasNextPage = allUsers.length > PAGE_SIZE;
  const visibleUsers = hasNextPage ? allUsers.slice(0, PAGE_SIZE) : allUsers;
  const rangeStart = visibleUsers.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + visibleUsers.length;

  const buildHref = (page: number) => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (searchQuery) params.set("search", searchQuery);
    if (roleFilter && validRoleNames.has(roleFilter)) params.set("role", roleFilter);
    const queryString = params.toString();
    return queryString ? `/dashboard/admin/users?${queryString}` : "/dashboard/admin/users";
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <div className="flex gap-2">
          <BulkCreateDialog />
          <AddUserDialog actorRole={session.user.role} availableRoles={availableRoles} />
        </div>
      </div>
      <Card>
        <CardContent>
          <form className="flex flex-col gap-4 md:flex-row md:items-end" method="get">
            <div className="flex-1 space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="users-search">
                {t("filters.searchLabel")}
              </label>
              <Input
                id="users-search"
                name="search"
                type="search"
                defaultValue={searchQuery}
                placeholder={t("filters.searchPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="users-role">
                {t("filters.roleLabel")}
              </label>
              <FilterSelect
                name="role"
                defaultValue={roleFilter && validRoleNames.has(roleFilter) ? roleFilter : ""}
                placeholder={t("allRoles")}
                options={[
                  { value: "", label: t("allRoles") },
                  ...Object.entries(roleLabels).map(([value, label]) => ({ value, label })),
                ]}
              />
            </div>
            <div className="flex gap-2 items-end">
              <Button type="submit">{t("applyFilters")}</Button>
              <Link href="/dashboard/admin/users">
                <Button type="button" variant="outline">{t("resetFilters")}</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t("resultsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {visibleUsers.length > 0 && (
            <p className="mb-4 text-sm text-muted-foreground">
              {t("pagination.results", { start: rangeStart, end: rangeEnd, total })}
            </p>
          )}
          <div className="overflow-x-auto">
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
              {visibleUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    <Link href={`/dashboard/admin/users/${user.id}`} className="text-primary hover:underline">
                      {user.username}
                    </Link>
                  </TableCell>
                  <TableCell>{user.className || tCommon("notSet")}</TableCell>
                  <TableCell>{user.email || "-"}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell className="align-middle">
                    <Badge variant="outline">{roleLabels[user.role] ?? user.role}</Badge>
                  </TableCell>
                  <TableCell>
                    {user.isActive ? (
                      <Badge variant="success">{tCommon("active")}</Badge>
                    ) : (
                      <Badge variant="destructive">{tCommon("inactive")}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.createdAt ? formatDateInTimeZone(user.createdAt, locale, timeZone) : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2 items-center">
                      <EditUserDialog actorRole={session.user.role} availableRoles={availableRoles} user={{
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        name: user.name,
                        className: user.className,
                        role: user.role
                      }} />
                      <UserActions
                        userId={user.id}
                        username={user.username}
                        isActive={!!user.isActive}
                        isSelf={user.id === session.user.id}
                        userRole={user.role}
                        actorRole={session.user.role}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {visibleUsers.length === 0 && (
                <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      {t("noUsers")}
                    </TableCell>
                  </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            buildHref={buildHref}
          />
        </CardContent>
      </Card>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
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
import { auth } from "@/lib/auth";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { FilterSelect } from "@/components/filter-select";
import { db } from "@/lib/db";
import { loginEvents, users } from "@/lib/db/schema";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";

const PAGE_SIZE = 50;
const PAGE_PATH = "/dashboard/admin/login-logs";
const OUTCOME_FILTER_VALUES = [
  "all",
  "success",
  "invalid_credentials",
  "rate_limited",
  "policy_denied",
] as const;
const MAX_SEARCH_LENGTH = 100;
const MAX_USER_AGENT_SUMMARY_LENGTH = 120;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.loginLogs");
  return { title: t("title") };
}

type OutcomeFilter = (typeof OUTCOME_FILTER_VALUES)[number];

function normalizePage(value?: string) {
  const parsed = Number(value ?? "1");

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.floor(parsed);
}

function normalizeOutcomeFilter(value?: string): OutcomeFilter {
  if (OUTCOME_FILTER_VALUES.includes(value as OutcomeFilter)) {
    return value as OutcomeFilter;
  }

  return "all";
}

function normalizeSearchQuery(value?: string) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, MAX_SEARCH_LENGTH);
}

function escapeLikePattern(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function summarizeUserAgent(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length <= MAX_USER_AGENT_SUMMARY_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_USER_AGENT_SUMMARY_LENGTH - 3)}...`;
}

function buildPageHref(page: number, outcome: OutcomeFilter, search: string) {
  const params = new URLSearchParams();

  if (page > 1) {
    params.set("page", String(page));
  }

  if (outcome !== "all") {
    params.set("outcome", outcome);
  }

  if (search) {
    params.set("search", search);
  }

  const queryString = params.toString();

  return queryString ? `${PAGE_PATH}?${queryString}` : PAGE_PATH;
}

export default async function AdminLoginLogsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; outcome?: string; search?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const caps = await resolveCapabilities(session.user.role);
  if (!caps.has("system.login_logs")) redirect("/dashboard");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedPage = normalizePage(resolvedSearchParams?.page);
  const outcomeFilter = normalizeOutcomeFilter(resolvedSearchParams?.outcome);
  const searchQuery = normalizeSearchQuery(resolvedSearchParams?.search);
  const normalizedSearch = searchQuery.toLowerCase();
  const t = await getTranslations("admin.loginLogs");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();
  const timeZone = await getResolvedSystemTimeZone();
  const outcomeLabels = {
    success: t("outcomes.success"),
    invalid_credentials: t("outcomes.invalid_credentials"),
    rate_limited: t("outcomes.rate_limited"),
    policy_denied: t("outcomes.policy_denied"),
  };
  const outcomeVariants = {
    success: "default",
    invalid_credentials: "destructive",
    rate_limited: "secondary",
    policy_denied: "outline",
  } as const;
  const filters: SQL[] = [];

  if (outcomeFilter !== "all") {
    filters.push(eq(loginEvents.outcome, outcomeFilter));
  }

  if (normalizedSearch) {
    const likePattern = `%${escapeLikePattern(normalizedSearch)}%`;

    filters.push(sql`
      (
        lower(coalesce(${loginEvents.attemptedIdentifier}, '')) like ${likePattern} escape '\\'
        or lower(coalesce(${users.username}, '')) like ${likePattern} escape '\\'
        or lower(coalesce(${users.name}, '')) like ${likePattern} escape '\\'
        or lower(coalesce(${loginEvents.ipAddress}, '')) like ${likePattern} escape '\\'
        or lower(coalesce(${loginEvents.userAgent}, '')) like ${likePattern} escape '\\'
      )
    `);
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;
  const countQuery = db
    .select({ total: sql<number>`count(${loginEvents.id})` })
    .from(loginEvents)
    .leftJoin(users, eq(loginEvents.userId, users.id));
  const [{ total }] = whereClause ? await countQuery.where(whereClause) : await countQuery;
  const totalCount = Number(total ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const eventsQuery = db
    .select({
      id: loginEvents.id,
      outcome: loginEvents.outcome,
      attemptedIdentifier: loginEvents.attemptedIdentifier,
      ipAddress: loginEvents.ipAddress,
      userAgent: loginEvents.userAgent,
      createdAt: loginEvents.createdAt,
      user: {
        id: users.id,
        name: users.name,
        username: users.username,
      },
    })
    .from(loginEvents)
    .leftJoin(users, eq(loginEvents.userId, users.id));
  const filteredEventsQuery = whereClause ? eventsQuery.where(whereClause) : eventsQuery;
  const visibleEvents = await filteredEventsQuery
    .orderBy(desc(loginEvents.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);
  const rangeStart = visibleEvents.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + visibleEvents.length;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <Card>
        <CardContent>
          <form className="flex flex-col gap-4 md:flex-row md:items-end" method="get">
            <div className="flex-1 space-y-1.5">
              <label className="block text-sm font-medium" htmlFor="login-log-search">
                {t("filters.searchLabel")}
              </label>
              <Input
                id="login-log-search"
                name="search"
                type="search"
                defaultValue={searchQuery}
                placeholder={t("filters.searchPlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="login-log-outcome">
                {t("filters.outcomeLabel")}
              </label>
              <FilterSelect
                name="outcome"
                defaultValue={outcomeFilter}
                placeholder={t("filters.allOutcomes")}
                options={[
                  { value: "all", label: t("filters.allOutcomes") },
                  ...OUTCOME_FILTER_VALUES.filter((value) => value !== "all").map((value) => ({
                    value,
                    label: outcomeLabels[value],
                  })),
                ]}
              />
            </div>

            <div className="flex gap-2 items-end">
              <Button type="submit" className="h-10">{t("applyFilters")}</Button>
              <Link href={PAGE_PATH}>
                <Button type="button" variant="outline" className="h-10">{t("resetFilters")}</Button>
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

          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.timestamp")}</TableHead>
                <TableHead>{t("table.outcome")}</TableHead>
                <TableHead>{t("table.identifier")}</TableHead>
                <TableHead>{t("table.resolvedUser")}</TableHead>
                <TableHead>{t("table.ipAddress")}</TableHead>
                <TableHead>{t("table.userAgent")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleEvents.map((event) => {
                const resolvedUser =
                  event.user?.id && event.user.name && event.user.username
                    ? event.user
                    : null;

                return (
                  <TableRow key={event.id}>
                    <TableCell>
                      {event.createdAt ? formatDateTimeInTimeZone(event.createdAt, locale, timeZone) : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={outcomeVariants[event.outcome as keyof typeof outcomeVariants] ?? "outline"}>
                        {outcomeLabels[event.outcome as keyof typeof outcomeLabels] ?? event.outcome}
                      </Badge>
                    </TableCell>
                    <TableCell className="!whitespace-normal">
                      {event.attemptedIdentifier ? (
                        <span className="font-mono text-xs break-all">{event.attemptedIdentifier}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="!whitespace-normal">
                      {resolvedUser ? (
                        <Link href={`/dashboard/admin/users/${resolvedUser.id}`} className="block text-primary hover:underline">
                          <div className="font-medium text-foreground">{resolvedUser.name}</div>
                          <div className="text-xs text-muted-foreground">@{resolvedUser.username}</div>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{t("unresolvedUser")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {event.ipAddress ? (
                        <span className="font-mono text-xs">{event.ipAddress}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-sm !whitespace-normal text-sm break-words text-muted-foreground">
                      {summarizeUserAgent(event.userAgent) ?? tCommon("unknown")}
                    </TableCell>
                  </TableRow>
                );
              })}
              {visibleEvents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {t("noEvents")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        buildHref={(page) => buildPageHref(page, outcomeFilter, searchQuery)}
      />
    </div>
  );
}

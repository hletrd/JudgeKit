import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getContestsForUser, getContestStatus } from "@/lib/assignments/contests";
import type { ContestStatus } from "@/lib/assignments/contests";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { getDbNow } from "@/lib/db-time";
import { CountdownTimer } from "@/components/exam/countdown-timer";
import { getResolvedSystemTimeZone } from "@/lib/system-settings";
import { KeyRound, Plus } from "lucide-react";
import { PaginationControls } from "@/components/pagination-controls";
import { getRecruitingAccessContext } from "@/lib/recruiting/access";
import { normalizePage } from "@/lib/pagination";

type FilterValue = "all" | "upcoming" | "active" | "past";

function normalizeFilter(value: string | undefined): FilterValue {
  if (value === "upcoming" || value === "active" || value === "past") return value;
  return "all";
}

function statusMatchesFilter(status: ContestStatus, filter: FilterValue): boolean {
  if (filter === "all") return true;
  if (filter === "upcoming") return status === "upcoming";
  if (filter === "active") return status === "open" || status === "in_progress";
  if (filter === "past") return status === "closed" || status === "expired";
  return true;
}

function getStatusBadgeVariant(status: ContestStatus) {
  switch (status) {
    case "upcoming":
      return "secondary" as const;
    case "open":
      return "success" as const;
    case "in_progress":
      return "default" as const;
    case "expired":
      return "outline" as const;
    case "closed":
      return "outline" as const;
  }
}

function buildContestPageHref(page: number, filter: FilterValue) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (filter !== "all") params.set("filter", filter);
  const qs = params.toString();
  return qs ? `/dashboard/contests?${qs}` : "/dashboard/contests";
}

function getStatusBorderClass(status: ContestStatus): string {
  switch (status) {
    case "upcoming":
      return "border-l-4 border-l-blue-500";
    case "open":
    case "in_progress":
      return "border-l-4 border-l-green-500";
    case "expired":
    case "closed":
      return "border-l-4 border-l-gray-400";
  }
}

export default async function ContestsPage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [resolvedSearchParams, t, locale, timeZone] = await Promise.all([
    searchParams ?? Promise.resolve(undefined),
    getTranslations("contests"),
    getLocale(),
    getResolvedSystemTimeZone(),
  ]);

  const role = session.user.role;
  const caps = await resolveCapabilities(session.user.role);
  const { isRecruitingCandidate, effectivePlatformMode } = await getRecruitingAccessContext(session.user.id);
  if (
    effectivePlatformMode === "recruiting" &&
    !isRecruitingCandidate &&
    !caps.has("system.settings") &&
    !caps.has("submissions.view_all")
  ) {
    redirect("/dashboard");
  }
  const contests = await getContestsForUser(session.user.id, role);
  // Use DB server time for contest status checks to avoid clock skew
  // between the app server and DB server (same rationale as recruit page fix).
  const now = await getDbNow();
  const filter = normalizeFilter(resolvedSearchParams?.filter);
  const PAGE_SIZE = 25;
  const currentPage = normalizePage(resolvedSearchParams?.page);

  const statusMap = new Map(
    contests.map((c) => [c.id, getContestStatus(c, now)])
  );

  const filteredContests = contests.filter((c) =>
    statusMatchesFilter(statusMap.get(c.id)!, filter)
  );

  const totalCount = filteredContests.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const clampedPage = Math.min(currentPage, totalPages);
  const offset = (clampedPage - 1) * PAGE_SIZE;
  const pagedContests = filteredContests.slice(offset, offset + PAGE_SIZE);

  const statusLabelMap: Record<ContestStatus, string> = {
    upcoming: t("statusUpcoming"),
    open: t("statusOpen"),
    in_progress: t("statusInProgress"),
    expired: t("statusExpired"),
    closed: t("statusClosed"),
  };

  const filterTabs: { value: FilterValue; label: string }[] = [
    { value: "all", label: t("filterAll") },
    { value: "upcoming", label: t("filterUpcoming") },
    { value: "active", label: t("filterActive") },
    { value: "past", label: t("filterPast") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">{t("title")}</h2>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {filterTabs.map((tab) => (
            <Link key={tab.value} href={buildContestPageHref(1, tab.value)}>
              <Badge
                variant={filter === tab.value ? "default" : "outline"}
                className="cursor-pointer px-3 py-1 text-sm"
              >
                {tab.label}
              </Badge>
            </Link>
          ))}
        </div>
        <div className="flex gap-2">
          {caps.has("contests.create") && (
            <Link href="/dashboard/contests/create">
              <Button size="sm" className="gap-1.5">
                <Plus className="size-4" />
                {t("createContest")}
              </Button>
            </Link>
          )}
          <Link href="/dashboard/contests/join">
            <Button variant="outline" size="sm" className="gap-1.5">
              <KeyRound className="size-4" />
              {t("joinWithCode")}
            </Button>
          </Link>
        </div>
      </div>

      {pagedContests.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {t("noContests")}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {pagedContests.map((contest) => {
            const status = statusMap.get(contest.id)!;
            return (
              <Link key={contest.id} href={`/dashboard/contests/${contest.id}`} className="block">
                <div className={`flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-accent/50 ${getStatusBorderClass(status)}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">{contest.title}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                      <span>{contest.groupName}</span>
                      <span>·</span>
                      <span>{t("problems")}: {contest.problemCount}</span>
                      {contest.examMode === "windowed" && contest.examDurationMinutes && (
                        <>
                          <span>·</span>
                          <span>{contest.examDurationMinutes}min</span>
                        </>
                      )}
                      {contest.startsAt && (
                        <>
                          <span>·</span>
                          {status === "upcoming" ? (
                            <CountdownTimer
                              deadline={new Date(contest.startsAt).getTime()}
                              label={t("startsIn")}
                            />
                          ) : (
                            <span>{formatDateTimeInTimeZone(contest.startsAt, locale, timeZone)}</span>
                          )}
                        </>
                      )}
                      {(status === "open" || status === "in_progress") && (contest.personalDeadline ?? contest.deadline) && (
                        <>
                          <span>·</span>
                          <CountdownTimer
                            deadline={new Date(contest.personalDeadline ?? contest.deadline as string | Date).getTime()}
                            label={t("endsIn")}
                          />
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={getStatusBadgeVariant(status)} className="text-xs">
                      {statusLabelMap[status]}
                    </Badge>
                    <Badge className={`text-xs ${contest.examMode === "scheduled" ? "bg-blue-500 text-white" : "bg-purple-500 text-white"}`}>
                      {contest.examMode === "scheduled" ? t("modeScheduled") : t("modeWindowed")}
                    </Badge>
                    <Badge className={`text-xs ${contest.scoringModel === "ioi" ? "bg-teal-500 text-white" : "bg-orange-500 text-white"}`}>
                      {contest.scoringModel === "ioi" ? t("scoringModelIoi") : t("scoringModelIcpc")}
                    </Badge>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <PaginationControls
        currentPage={clampedPage}
        totalPages={totalPages}
        buildHref={(page) => buildContestPageHref(page, filter)}
      />
    </div>
  );
}

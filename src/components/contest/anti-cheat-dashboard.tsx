"use client";

import { useState, useCallback, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useSystemTimezone } from "@/contexts/timezone-context";
import { formatDateTimeInTimeZone } from "@/lib/datetime";

// i18n keys used from "contests.antiCheat" and "common"
import { toast } from "sonner";
import { apiFetchJson } from "@/lib/api/client";
import { useVisibilityPolling } from "@/hooks/use-visibility-polling";
import { getAntiCheatReviewTier } from "@/lib/anti-cheat/review-model";
import { Button } from "@/components/ui/button";
import {
  Select as UiSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Shield,
  Search,
  Users,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

type AntiCheatEvent = {
  id: string;
  userId: string;
  userName: string;
  username: string;
  eventType: string;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
};

interface AntiCheatDashboardProps {
  assignmentId: string;
}

type SimilarityPairView = {
  userId1: string;
  userId2: string;
  user1Name: string;
  user2Name: string;
  problemId: string;
  language: string;
  similarity: number;
};

type SimilarityCheckResponse = {
  status: "completed" | "not_run" | "timed_out";
  reason: "no_submissions" | "too_many_submissions" | "service_unavailable" | "timeout" | null;
  flaggedPairs: number;
  submissionCount: number | null;
  maxSupportedSubmissions: number | null;
  pairs?: SimilarityPairView[];
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  tab_switch: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  copy: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  paste: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  blur: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  contextmenu: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  ip_change: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  code_similarity: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const REVIEW_TIER_COLORS: Record<string, string> = {
  context: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
  signal: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  escalate: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

function formatDetailsJson(raw: string, t: (key: string) => string): string {
  try {
    const parsed = JSON.parse(raw);
    // If has target field, show human-readable summary (matching participant-anti-cheat-timeline.tsx)
    if (parsed.target) {
      const target = parsed.target as string;
      const targetKey = `detailTargets.${target}`;
      const label = t(targetKey) !== targetKey ? t(targetKey) : target;
      return `${t("detailTargetLabel")}: ${label}`;
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

export function AntiCheatDashboard({ assignmentId }: AntiCheatDashboardProps) {
  const t = useTranslations("contests.antiCheat");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const timeZone = useSystemTimezone();
  const [events, setEvents] = useState<AntiCheatEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [runningCheck, setRunningCheck] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [studentFilter, setStudentFilter] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [similarityStatusMessage, setSimilarityStatusMessage] = useState<string | null>(null);
  const [similarityPairs, setSimilarityPairs] = useState<SimilarityPairView[]>([]);
  const PAGE_SIZE = 100;

  const fetchEvents = useCallback(async () => {
    try {
      const { ok, data: json } = await apiFetchJson<{ data: { events: AntiCheatEvent[]; total: number } }>(
        `/api/v1/contests/${assignmentId}/anti-cheat?limit=${PAGE_SIZE}&offset=0`,
        undefined,
        { data: { events: [], total: 0 } }
      );
      if (ok) {
        const firstPage = json.data.events as AntiCheatEvent[];
        setTotal(json.data.total);
        setEvents((prev) => {
          // If the user has already loaded beyond the first page (via loadMore),
          // only refresh the first page slice and keep the rest intact.
          // This prevents polling from discarding loaded-beyond-first-page data.

          // Skip re-render if first-page data is identical (same IDs in same order)
          const firstPageIds = firstPage.map((e) => e.id);
          const prevFirstPageIds = prev.slice(0, PAGE_SIZE).map((e) => e.id);
          const firstPageUnchanged = firstPageIds.length === prevFirstPageIds.length
            && firstPageIds.every((id, i) => id === prevFirstPageIds[i]);

          if (prev.length > PAGE_SIZE) {
            return firstPageUnchanged ? prev : [...firstPage, ...prev.slice(PAGE_SIZE)];
          }
          return firstPageUnchanged ? prev : firstPage;
        });
        setOffset((prev) => {
          // Only reset offset to first-page length if the user hasn't loaded more.
          // Otherwise preserve the offset so loadMore doesn't re-fetch duplicates.
          if (prev <= PAGE_SIZE) {
            return firstPage.length;
          }
          return prev;
        });
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const { ok, data: json } = await apiFetchJson<{ data: { events: AntiCheatEvent[]; total: number } }>(
        `/api/v1/contests/${assignmentId}/anti-cheat?limit=${PAGE_SIZE}&offset=${offset}`,
        undefined,
        { data: { events: [], total: 0 } }
      );
      if (ok) {
        setEvents((prev) => [...prev, ...json.data.events]);
        setTotal(json.data.total);
        setOffset((prev) => prev + json.data.events.length);
      }
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setLoadingMore(false);
    }
  }, [assignmentId, offset, tCommon]);

  useVisibilityPolling(() => { void fetchEvents(); }, 30_000);

  // Derived stats
  const uniqueStudentCount = useMemo(
    () => new Set(events.map((e) => e.userId)).size,
    [events]
  );

  const topEventType = useMemo(() => {
    if (events.length === 0) return null;
    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.eventType] = (counts[e.eventType] ?? 0) + 1;
    }
    const [type, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return { type, count };
  }, [events]);

  const eventTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.eventType))).sort(),
    [events]
  );

  const uniqueStudents = useMemo(() => {
    const seen = new Map<string, { userId: string; userName: string; username: string }>();
    for (const e of events) {
      if (!seen.has(e.userId)) {
        seen.set(e.userId, { userId: e.userId, userName: e.userName, username: e.username });
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.userName.localeCompare(b.userName));
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (typeFilter !== null && e.eventType !== typeFilter) return false;
      if (studentFilter !== null && e.userId !== studentFilter) return false;
      return true;
    });
  }, [events, typeFilter, studentFilter]);

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSimilarityCheck() {
    setRunningCheck(true);
    try {
      const { ok, data: json } = await apiFetchJson<{ data: SimilarityCheckResponse }>(
        `/api/v1/contests/${assignmentId}/similarity-check`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
        { data: {} as SimilarityCheckResponse }
      );
      if (ok) {
        const data = json.data as SimilarityCheckResponse;

        if (data.status === "completed") {
          const message = t("similarityComplete", { count: data.flaggedPairs });
          setSimilarityStatusMessage(message);
          setSimilarityPairs(
            [...(data.pairs ?? [])].sort((a, b) => b.similarity - a.similarity)
          );
          toast.success(message);
          fetchEvents();
        } else if (data.reason === "no_submissions") {
          const message = t("similarityNoSubmissions");
          setSimilarityStatusMessage(message);
          toast(message);
        } else if (data.reason === "too_many_submissions") {
          const message = t("similaritySkippedTooManySubmissions", {
            count: data.submissionCount ?? 0,
            limit: data.maxSupportedSubmissions ?? 0,
          });
          setSimilarityStatusMessage(message);
          toast.warning(message);
        } else if (data.reason === "service_unavailable") {
          const message = t("similarityServiceUnavailable", {
            count: data.submissionCount ?? 0,
          });
          setSimilarityStatusMessage(message);
          toast.warning(message);
        } else {
          const message = t("similarityTimedOut");
          setSimilarityStatusMessage(message);
          toast.warning(message);
        }
      }
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setRunningCheck(false);
    }
  }

  function formatEventTime(ts: string | number): string {
    const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
    if (isNaN(d.getTime())) return "-";
    return formatDateTimeInTimeZone(d, locale, timeZone);
  }

  if (error && events.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <p className="text-destructive">{t("fetchError")}</p>
          <Button variant="outline" size="sm" onClick={() => { setError(false); fetchEvents(); }}>
            {t("retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="size-4" />
            {t("dashboard")}
            <Badge variant="secondary">{t("eventCount", { count: total })}</Badge>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSimilarityCheck}
            disabled={runningCheck}
          >
            <Search className="size-4" />
            {runningCheck ? t("similarityRunning") : t("similarityCheck")}
          </Button>
        </div>
        {similarityStatusMessage ? (
          <p className="text-xs text-muted-foreground">{similarityStatusMessage}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {similarityPairs.length > 0 && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="size-4 text-destructive" />
              {t("flaggedPairs")}
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("student1")}</TableHead>
                  <TableHead>{t("student2")}</TableHead>
                  <TableHead>{t("language")}</TableHead>
                  <TableHead className="text-right">{t("similarityPercent")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {similarityPairs.map((pair) => (
                  <TableRow key={`${pair.userId1}-${pair.userId2}-${pair.language}`}>
                    <TableCell className="text-sm">{pair.user1Name}</TableCell>
                    <TableCell className="text-sm">{pair.user2Name}</TableCell>
                    <TableCell className="text-sm">{pair.language}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={pair.similarity >= 90 ? "destructive" : "secondary"}>
                        {pair.similarity}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="space-y-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <p>{t("signalsDisclaimer")}</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>{t("reviewModelTelemetry")}</li>
            <li>{t("reviewModelCorroboration")}</li>
            <li>{t("reviewModelSeriousActions")}</li>
            <li>{t("reviewModelTiers")}</li>
          </ul>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <Shield className="size-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("totalEvents")}</p>
              {loading ? (
                <Skeleton className="mt-1 h-5 w-12" />
              ) : (
                <p className="text-lg font-semibold leading-tight">{total}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-orange-500/10 dark:bg-orange-500/15">
              <Users className="size-4 text-orange-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("uniqueStudents")}</p>
              {loading ? (
                <Skeleton className="mt-1 h-5 w-12" />
              ) : (
                <p className="text-lg font-semibold leading-tight">{uniqueStudentCount}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/10">
              <AlertTriangle className="size-4 text-destructive" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("topEventType")}</p>
              {loading ? (
                <Skeleton className="mt-1 h-5 w-24" />
              ) : topEventType ? (
                <p className="truncate text-sm font-semibold leading-tight">
                  {topEventType.type}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    ({topEventType.count})
                  </span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">-</p>
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        {!loading && events.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Event type filter chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant={typeFilter === null ? "default" : "outline"}
                className="cursor-pointer select-none"
                onClick={() => setTypeFilter(null)}
              >
                {t("allTypes")}
              </Badge>
              {eventTypes.map((type) => (
                <Badge
                  key={type}
                  variant={typeFilter === type ? "default" : "outline"}
                  className={`cursor-pointer select-none ${typeFilter !== type ? (EVENT_TYPE_COLORS[type] ?? "") : ""}`}
                  onClick={() => setTypeFilter(typeFilter === type ? null : type)}
                >
                  {t(`eventTypes.${type}` as Parameters<typeof t>[0]) ?? type}
                </Badge>
              ))}
            </div>

            {/* Student filter */}
            {uniqueStudents.length > 1 && (
              <UiSelect
                value={studentFilter ?? ""}
                onValueChange={(v) => setStudentFilter(v === "" ? null : v)}
              >
                <SelectTrigger className="ml-auto h-7 w-[180px] text-xs" aria-label={t("filterByStudent")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="" label={t("allStudents")}>{t("allStudents")}</SelectItem>
                  {uniqueStudents.map((s) => (
                    <SelectItem key={s.userId} value={s.userId} label={`${s.userName} (${s.username})`}>
                      {s.userName} ({s.username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </UiSelect>
            )}
          </div>
        )}

        {/* Table / loading / empty states */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 flex-1" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-28" />
              </div>
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {events.length === 0 ? t("noEvents") : t("noEventsForFilter")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("student")}</TableHead>
                  <TableHead>{t("event")}</TableHead>
                  <TableHead>{t("reviewTier")}</TableHead>
                  <TableHead>{t("details")}</TableHead>
                  <TableHead>{t("ipAddress")}</TableHead>
                  <TableHead>{t("time")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((event) => {
                  const isExpanded = expandedRows.has(event.id);
                  const hasDetails = event.details !== null && event.details !== "";
                  return (
                    <TableRow key={event.id}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{event.userName}</span>
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({event.username})
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={EVENT_TYPE_COLORS[event.eventType] ?? ""}
                        >
                          {t(`eventTypes.${event.eventType}` as Parameters<typeof t>[0]) ?? event.eventType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={REVIEW_TIER_COLORS[getAntiCheatReviewTier(event.eventType)]}>
                          {t(`reviewTiers.${getAntiCheatReviewTier(event.eventType)}` as Parameters<typeof t>[0])}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {hasDetails ? (
                          <div>
                            <button
                              type="button"
                              className="flex items-center gap-1 text-xs text-primary hover:underline focus:outline-none"
                              onClick={() => toggleRow(event.id)}
                              aria-expanded={isExpanded}
                              aria-controls={`anti-cheat-dashboard-detail-${event.id}`}
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronDown className="size-3" />
                                  {t("collapseDetails")}
                                </>
                              ) : (
                                <>
                                  <ChevronRight className="size-3" />
                                  {t("expandDetails")}
                                </>
                              )}
                            </button>
                            {isExpanded && (
                              <pre id={`anti-cheat-dashboard-detail-${event.id}`} className="mt-1.5 max-h-48 overflow-auto rounded-md bg-muted px-2 py-1.5 text-xs">
                                <code>{formatDetailsJson(event.details!, t)}</code>
                              </pre>
                            )}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {event.ipAddress ?? "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatEventTime(event.createdAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination: showing count + load more */}
        {!loading && events.length > 0 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              {t("showingEvents", { shown: events.length, total })}
            </p>
            {events.length < total && (
              <Button
                variant="outline"
                size="sm"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? tCommon("loading") : t("loadMore")}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

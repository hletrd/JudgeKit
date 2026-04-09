"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
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
import { Shield, ChevronDown, ChevronRight } from "lucide-react";

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

const EVENT_TYPE_COLORS: Record<string, string> = {
  tab_switch: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  copy: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  paste: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  blur: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  contextmenu: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  ip_change: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  code_similarity: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function formatDetailsJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

interface ParticipantAntiCheatTimelineProps {
  assignmentId: string;
  userId: string;
}

export function ParticipantAntiCheatTimeline({
  assignmentId,
  userId,
}: ParticipantAntiCheatTimelineProps) {
  const t = useTranslations("contests.antiCheat");
  const tAudit = useTranslations("contests.participantAudit");
  const tCommon = useTranslations("common");
  const [events, setEvents] = useState<AntiCheatEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 50;

  const fetchEvents = useCallback(async () => {
    try {
      const res = await apiFetch(
        `/api/v1/contests/${assignmentId}/anti-cheat?userId=${userId}&limit=${PAGE_SIZE}&offset=0`
      );
      if (res.ok) {
        const json = await res.json();
        setEvents(json.data.events);
        setTotal(json.data.total);
        setOffset(json.data.events.length);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [assignmentId, userId]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await apiFetch(
        `/api/v1/contests/${assignmentId}/anti-cheat?userId=${userId}&limit=${PAGE_SIZE}&offset=${offset}`
      );
      if (res.ok) {
        const json = await res.json();
        setEvents((prev) => [...prev, ...json.data.events]);
        setTotal(json.data.total);
        setOffset((prev) => prev + json.data.events.length);
      }
    } catch {
      // silently fail on load-more
    } finally {
      setLoadingMore(false);
    }
  }, [assignmentId, userId, offset]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const eventTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.eventType))).sort(),
    [events]
  );

  const filteredEvents = useMemo(() => {
    if (typeFilter === null) return events;
    return events.filter((e) => e.eventType === typeFilter);
  }, [events, typeFilter]);

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function formatEventTime(ts: string | number): string {
    const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleString();
  }

  if (error && events.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <p className="text-destructive">{t("fetchError")}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError(false);
              fetchEvents();
            }}
          >
            {t("retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="size-4" />
          {tAudit("antiCheatTimeline.title")}
          <Badge variant="secondary">{t("eventCount", { count: total })}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {t("signalsDisclaimer")}
        </div>

        {/* Filter chips */}
        {!loading && events.length > 0 && (
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
        )}

        {/* Loading state */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 flex-1" />
                <Skeleton className="h-6 w-28" />
              </div>
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {events.length === 0
              ? tAudit("antiCheatTimeline.noEvents")
              : t("noEventsForFilter")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("event")}</TableHead>
                  <TableHead>{t("details")}</TableHead>
                  <TableHead>{t("ipAddress")}</TableHead>
                  <TableHead>{t("time")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((event) => {
                  const isExpanded = expandedRows.has(event.id);
                  const hasDetails =
                    event.details !== null && event.details !== "";
                  return (
                    <TableRow key={event.id}>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={EVENT_TYPE_COLORS[event.eventType] ?? ""}
                        >
                          {t(`eventTypes.${event.eventType}` as Parameters<typeof t>[0]) ?? event.eventType}
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
                              <pre className="mt-1.5 max-h-48 overflow-auto rounded-md bg-muted px-2 py-1.5 text-xs">
                                <code>
                                  {formatDetailsJson(event.details!)}
                                </code>
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

        {/* Pagination */}
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

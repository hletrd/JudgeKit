"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { useSystemTimezone } from "@/contexts/timezone-context";
import { formatDateTimeInTimeZone } from "@/lib/datetime";
import { apiFetchJson } from "@/lib/api/client";
import { useVisibilityPolling } from "@/hooks/use-visibility-polling";
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
import {
  EVENT_TYPE_COLORS,
  antiCheatEventTypeLabel,
  formatAntiCheatDetails,
} from "@/components/contest/anti-cheat-presentation";

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

type HeartbeatGap = {
  userId: string;
  gapStartedAt: string;
  gapEndedAt: string;
  gapSeconds: number;
  /** True for the synthetic boundary gap: monitor dark from gapStartedAt until NOW. */
  ongoing?: boolean;
};

interface ParticipantAntiCheatTimelineProps {
  assignmentId: string;
  userId: string;
}

/** Render a gap length via the shared duration message keys (G2). */
function formatGapDuration(
  gapSeconds: number,
  t: (key: string, values?: Record<string, string | number>) => string
): string {
  const minutes = Math.floor(gapSeconds / 60);
  const seconds = gapSeconds % 60;
  return minutes > 0
    ? t("durationMinutesSeconds", { minutes, seconds })
    : t("durationSeconds", { seconds });
}

export function ParticipantAntiCheatTimeline({
  assignmentId,
  userId,
}: ParticipantAntiCheatTimelineProps) {
  const t = useTranslations("contests.antiCheat");
  const tAudit = useTranslations("contests.participantAudit");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const timeZone = useSystemTimezone();
  const [events, setEvents] = useState<AntiCheatEvent[]>([]);
  const [heartbeatGaps, setHeartbeatGaps] = useState<HeartbeatGap[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 50;
  const abortControllerRef = useRef<AbortController | null>(null);
  // Monotonic fetch sequence (RPF cycle-6 AGG6-6): a poll refresh RESETS the
  // list to the fresh first page, so a loadMore that was already in flight
  // when the reset happened would append rows positioned against the OLD
  // list — duplicating evidence rows in the reviewer's view. loadMore
  // captures the sequence before awaiting and discards its response if a
  // reset bumped it.
  const fetchSeqRef = useRef(0);

  const fetchEvents = useCallback(async () => {
    // Abort any in-flight request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    fetchSeqRef.current += 1;

    try {
      // `includeGaps=1` opts into the server-side heartbeat-gap scan (RPF
      // cycle-5 AGG5-3): this view is the gaps' consumer; plain event polls
      // elsewhere skip the scan.
      const { ok, data: json } = await apiFetchJson<{ data: { events: AntiCheatEvent[]; total: number; heartbeatGaps?: HeartbeatGap[] } }>(
        `/api/v1/contests/${assignmentId}/anti-cheat?userId=${userId}&limit=${PAGE_SIZE}&offset=0&includeGaps=1`,
        { signal: controller.signal },
        { data: { events: [], total: 0 } }
      );
      if (ok) {
        const freshFirstPage: AntiCheatEvent[] = json.data.events;
        setTotal(json.data.total);
        // On poll refresh, reset to just the first page to avoid
        // duplicate or missing events at the page boundary when new
        // events have been created server-side since the last fetch.
        // The user can load more pages again via the "Load more" button.
        setEvents(freshFirstPage);
        setHeartbeatGaps(json.data.heartbeatGaps ?? []);
        setOffset(freshFirstPage.length);
      } else {
        setError(true);
      }
    } catch (err) {
      // AbortError means the request was cancelled — not a real error
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [assignmentId, userId]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    const seqAtStart = fetchSeqRef.current;
    try {
      const { ok, data: json } = await apiFetchJson<{ data: { events: AntiCheatEvent[]; total: number } }>(
        `/api/v1/contests/${assignmentId}/anti-cheat?userId=${userId}&limit=${PAGE_SIZE}&offset=${offset}`,
        undefined,
        { data: { events: [], total: 0 } }
      );
      // A poll reset replaced the list while this page was in flight — its
      // offset no longer means anything against the fresh list (AGG6-6).
      if (seqAtStart !== fetchSeqRef.current) return;
      if (ok) {
        // Defensive id-dedupe: even within one sequence, rows can shift
        // pages server-side between requests as new events arrive.
        setEvents((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          return [...prev, ...json.data.events.filter((e) => !seen.has(e.id))];
        });
        setTotal(json.data.total);
        setOffset((prev) => prev + json.data.events.length);
      }
    } catch {
      toast.error(t("fetchError"));
    } finally {
      setLoadingMore(false);
    }
  }, [assignmentId, userId, offset, t]);

  useVisibilityPolling(() => { void fetchEvents(); }, 30_000);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

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
    return formatDateTimeInTimeZone(d, locale, timeZone);
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

        {/* Monitor coverage gaps (RPF cycle-5 AGG5-3/AGG5-4): periods with no
            heartbeat, including the ongoing "dark since X" boundary gap. */}
        {!loading && heartbeatGaps.length > 0 && (
          <div
            className="space-y-1.5 rounded-lg border border-red-500/40 bg-red-500/5 p-3"
            role="region"
            aria-label={t("heartbeatGaps.title")}
          >
            <p className="text-xs font-medium">{t("heartbeatGaps.title")}</p>
            <p className="text-xs text-muted-foreground">{t("heartbeatGaps.description")}</p>
            <ul className="space-y-1 text-xs">
              {heartbeatGaps.map((gap) => (
                <li
                  key={`${gap.gapStartedAt}-${gap.gapEndedAt}`}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1"
                >
                  <span className="whitespace-nowrap text-muted-foreground">
                    {formatEventTime(gap.gapStartedAt)}
                    {" → "}
                    {gap.ongoing ? t("heartbeatGaps.now") : formatEventTime(gap.gapEndedAt)}
                  </span>
                  <Badge variant="secondary" className="font-mono">
                    {formatGapDuration(gap.gapSeconds, t)}
                  </Badge>
                  {gap.ongoing && (
                    <Badge variant="destructive">{t("heartbeatGaps.ongoing")}</Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Filter chips */}
        {!loading && events.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Real <button>s (RPF cycle-6 AGG6-3): keyboard-operable with
                pressed semantics — see the dashboard's identical chips. */}
            <Badge
              variant={typeFilter === null ? "default" : "outline"}
              render={<button type="button" />}
              aria-pressed={typeFilter === null}
              className="cursor-pointer select-none"
              onClick={() => setTypeFilter(null)}
            >
              {t("allTypes")}
            </Badge>
            {eventTypes.map((type) => (
              <Badge
                key={type}
                variant={typeFilter === type ? "default" : "outline"}
                render={<button type="button" />}
                aria-pressed={typeFilter === type}
                className={`cursor-pointer select-none ${typeFilter !== type ? (EVENT_TYPE_COLORS[type] ?? "") : ""}`}
                onClick={() => setTypeFilter(typeFilter === type ? null : type)}
              >
                {antiCheatEventTypeLabel(type, t)}
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
                          {antiCheatEventTypeLabel(event.eventType, t)}
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
                              aria-controls={`anti-cheat-timeline-detail-${event.id}`}
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
                              <pre id={`anti-cheat-timeline-detail-${event.id}`} className="mt-1.5 max-h-48 overflow-auto rounded-md bg-muted px-2 py-1.5 text-xs">
                                <code>
                                  {formatAntiCheatDetails(event.details!, t)}
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

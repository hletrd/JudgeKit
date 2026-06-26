import { NextRequest, NextResponse } from "next/server";
import { createApiHandler } from "@/lib/api/handler";
import { apiError } from "@/lib/api/responses";
import { canViewAssignmentSubmissions } from "@/lib/assignments/submissions";
import { computeContestRanking } from "@/lib/assignments/contest-scoring";
import { getLeaderboardProblems } from "@/lib/assignments/leaderboard";
import { rawQueryOne, rawQueryAll } from "@/lib/db/queries";
import { recordAuditEventDurable } from "@/lib/audit/events";
import { contentDispositionAttachment } from "@/lib/http/content-disposition";
import { escapeCsvField } from "@/lib/csv/escape-field";

/** Hard cap to prevent OOM on large contests — matches the CSV-01 limit applied to
 *  audit-logs, login-logs, and submissions exports in prior cycles. */
const MAX_EXPORT_ENTRIES = 10_000;

type AssignmentRow = {
  groupId: string;
  instructorId: string | null;
  examMode: string;
  title: string;
  scoringModel: string;
};

type CheatCountRow = {
  userId: string;
  count: number;
};

type IpRow = {
  userId: string;
  ips: string;
};

export const GET = createApiHandler({
  rateLimit: "export",
  handler: async (req: NextRequest, { user, params }) => {
    const { assignmentId } = params;

    const assignment = await rawQueryOne<AssignmentRow>(
      `SELECT a.group_id AS "groupId", g.instructor_id AS "instructorId", a.exam_mode AS "examMode",
              a.title, a.scoring_model AS "scoringModel"
       FROM assignments a INNER JOIN groups g ON g.id = a.group_id WHERE a.id = @assignmentId`,
      { assignmentId }
    );

    if (!assignment || assignment.examMode === "none") {
      return apiError("notFound", 404);
    }

    const canView = await canViewAssignmentSubmissions(assignmentId, user.id, user.role);

    if (!canView) {
      return apiError("forbidden", 403);
    }

    const format = req.nextUrl.searchParams.get("format") ?? "csv";
    const anonymized = req.nextUrl.searchParams.get("anonymized") === "1";
    const isDownload = req.nextUrl.searchParams.get("download") === "1" || format === "csv";
    const problems = await getLeaderboardProblems(assignmentId);
    const { scoringModel, entries } = await computeContestRanking(assignmentId);
    const truncated = entries.length > MAX_EXPORT_ENTRIES;
    const limitedEntries = truncated ? entries.slice(0, MAX_EXPORT_ENTRIES) : entries;

    // Get anti-cheat event counts per user
    const cheatCounts = await rawQueryAll<CheatCountRow>(
      `SELECT user_id AS "userId", COUNT(*)::int AS count FROM anti_cheat_events WHERE assignment_id = @assignmentId GROUP BY user_id`,
      { assignmentId }
    );
    const cheatCountMap = new Map(cheatCounts.map((r) => [r.userId, r.count]));

    // Get distinct IPs per user
    const ipRows = await rawQueryAll<IpRow>(
      `SELECT user_id AS "userId", STRING_AGG(DISTINCT ip_address, ',') AS ips
       FROM submissions WHERE assignment_id = @assignmentId AND ip_address IS NOT NULL GROUP BY user_id`,
      { assignmentId }
    );
    const ipMap = new Map(ipRows.map((r) => [r.userId, r.ips]));

    const exportedEntries = limitedEntries.map((entry) => {
      if (!anonymized) return entry;
      return {
        ...entry,
        name: `Candidate ${entry.rank}`,
        username: "",
        className: null,
      };
    });

    if (format === "json") {
      const data = exportedEntries.map((entry) => ({
        rank: entry.rank,
        name: entry.name,
        username: entry.username,
        className: entry.className,
        totalScore: entry.totalScore,
        totalPenalty: scoringModel === "icpc" ? entry.totalPenalty : undefined,
        problemsSolved: entry.problems.filter((p) => p.solved).length,
        problems: entry.problems.map((p) => {
          const problem = problems.find((pr) => pr.problemId === p.problemId);
          return {
            title: problem?.title ?? p.problemId,
            score: p.score,
            attempts: p.attempts,
            solved: p.solved,
            firstAcAt: p.firstAcAt,
          };
        }),
        antiCheatEventCount: cheatCountMap.get(entry.userId) ?? 0,
        ipAddresses: anonymized ? "" : (ipMap.get(entry.userId) ?? ""),
      }));

      const jsonSuffix = `${anonymized ? "-anonymized" : ""}-export`;
      // Audit EVERY JSON PII read, not only explicit downloads. The
      // recruiter-candidates-panel fetches `?format=json` with no
      // `download=1`, so gating on `isDownload` left the primary UI read
      // path unaudited. Durable so the row survives a crash. See C3-AGG-1.
      await recordAuditEventDurable({
        actorId: user.id,
        actorRole: user.role,
        action: anonymized ? "contest.export_downloaded_anonymized" : "contest.export_downloaded",
        resourceType: "assignment",
        resourceId: assignmentId,
        resourceLabel: assignment.title,
        summary: `${anonymized ? "Read anonymized" : "Read"} contest export for "${assignment.title}"`,
        details: { format, anonymized, download: isDownload },
        request: req,
      });
      return NextResponse.json(
        truncated ? { data, truncated: true, totalEntries: entries.length } : data,
        {
          headers: {
            "Content-Disposition": contentDispositionAttachment(`${assignment.title}-${jsonSuffix}`, ".json"),
          },
        },
      );
    }

    // CSV export
    const headers = [
      "Rank",
      "Name",
      "Username",
      "Class",
      scoringModel === "icpc" ? "Solved" : "Total Score",
      ...(scoringModel === "icpc" ? ["Penalty"] : []),
      ...problems.map((p) => `${p.title} (Score)`),
      ...problems.map((p) => `${p.title} (Attempts)`),
      "Anti-Cheat Events",
      "IP Addresses",
    ];

    const rows = exportedEntries.map((entry) => {
      const row: (string | number)[] = [
        entry.rank,
        entry.name,
        entry.username,
        entry.className ?? "",
        entry.totalScore,
        ...(scoringModel === "icpc" ? [entry.totalPenalty] : []),
        ...problems.map((p) => {
          const pr = entry.problems.find((ep) => ep.problemId === p.problemId);
          return pr?.score ?? 0;
        }),
        ...problems.map((p) => {
          const pr = entry.problems.find((ep) => ep.problemId === p.problemId);
          return pr?.attempts ?? 0;
        }),
        cheatCountMap.get(entry.userId) ?? 0,
        anonymized ? "" : (ipMap.get(entry.userId) ?? ""),
      ];
      return row;
    });

    const BOM = "\uFEFF";
    const csvLines = [
      headers.map(escapeCsvField).join(","),
      ...rows.map((row) => row.map(escapeCsvField).join(",")),
      ...(truncated ? [`# Truncated: showing ${MAX_EXPORT_ENTRIES} of ${entries.length} entries`] : []),
    ];

    const csvSuffix = `${anonymized ? "-anonymized" : ""}-export`;
    // Use the durable audit helper for parity with the JSON branch (C4-9): a
    // SIGKILL/OOM in the buffered flush window must not drop the CSV PII-read
    // audit row.
    await recordAuditEventDurable({
      actorId: user.id,
      actorRole: user.role,
      action: anonymized ? "contest.export_downloaded_anonymized" : "contest.export_downloaded",
      resourceType: "assignment",
      resourceId: assignmentId,
      resourceLabel: assignment.title,
      summary: `${anonymized ? "Downloaded anonymized" : "Downloaded"} contest export for "${assignment.title}"`,
      details: { format, anonymized },
      request: req,
    });
    return new NextResponse(BOM + csvLines.join("\r\n") + "\r\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDispositionAttachment(`${assignment.title}-${csvSuffix}`, ".csv"),
      },
    });
  },
});

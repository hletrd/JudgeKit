import { NextRequest, NextResponse } from "next/server";
import { createApiHandler, isAdmin, isInstructor } from "@/lib/api/handler";
import { apiError } from "@/lib/api/responses";
import { computeContestRanking } from "@/lib/assignments/contest-scoring";
import { getLeaderboardProblems } from "@/lib/assignments/leaderboard";
import { sqlite } from "@/lib/db";

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, "_").slice(0, 100);
}

function escapeCsvCell(cell: string | number): string {
  const str = String(cell);
  let escaped = str.includes(",") || str.includes('"') || str.includes("\n")
    ? `"${str.replace(/"/g, '""')}"`
    : str;
  // Prevent CSV formula injection
  if (/^[=+\-@\t\r]/.test(escaped)) {
    escaped = `'${escaped}`;
  }
  return escaped;
}

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

    const assignment = sqlite
      .prepare<[string], AssignmentRow>(
        `SELECT a.group_id AS groupId, g.instructor_id AS instructorId, a.exam_mode AS examMode,
                a.title, a.scoring_model AS scoringModel
         FROM assignments a INNER JOIN groups g ON g.id = a.group_id WHERE a.id = ?`
      )
      .get(assignmentId);

    if (!assignment || assignment.examMode === "none") {
      return apiError("notFound", 404);
    }

    const canView =
      isAdmin(user.role) ||
      (isInstructor(user.role) && assignment.instructorId === user.id);

    if (!canView) {
      return apiError("forbidden", 403);
    }

    const format = req.nextUrl.searchParams.get("format") ?? "csv";
    const problems = getLeaderboardProblems(assignmentId);
    const { scoringModel, entries } = computeContestRanking(assignmentId);

    // Get anti-cheat event counts per user
    const cheatCounts = sqlite
      .prepare<[string], CheatCountRow>(
        `SELECT user_id AS userId, COUNT(*) AS count FROM anti_cheat_events WHERE assignment_id = ? GROUP BY user_id`
      )
      .all(assignmentId);
    const cheatCountMap = new Map(cheatCounts.map((r) => [r.userId, r.count]));

    // Get distinct IPs per user
    const ipRows = sqlite
      .prepare<[string], IpRow>(
        `SELECT user_id AS userId, GROUP_CONCAT(DISTINCT ip_address) AS ips
         FROM submissions WHERE assignment_id = ? AND ip_address IS NOT NULL GROUP BY user_id`
      )
      .all(assignmentId);
    const ipMap = new Map(ipRows.map((r) => [r.userId, r.ips]));

    if (format === "json") {
      const data = entries.map((entry) => ({
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
        ipAddresses: ipMap.get(entry.userId) ?? "",
      }));

      const safeName = sanitizeFilename(assignment.title);
      return NextResponse.json(data, {
        headers: {
          "Content-Disposition": `attachment; filename="${safeName}-export.json"`,
        },
      });
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

    const rows = entries.map((entry) => {
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
        ipMap.get(entry.userId) ?? "",
      ];
      return row;
    });

    const csvLines = [
      headers.map(escapeCsvCell).join(","),
      ...rows.map((row) => row.map(escapeCsvCell).join(",")),
    ];

    const safeName = sanitizeFilename(assignment.title);
    return new NextResponse(csvLines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}-export.csv"`,
      },
    });
  },
});

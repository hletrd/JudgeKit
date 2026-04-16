import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments } from "@/lib/db/schema";
import { getContestStatus, type ContestStatus } from "@/lib/assignments/contests";
import type { ExamMode, ScoringModel } from "@/types";

export type PublicContestEntry = {
  id: string;
  title: string;
  description: string | null;
  groupName: string;
  examMode: ExamMode;
  scoringModel: ScoringModel;
  startsAt: Date | null;
  deadline: Date | null;
  problemCount: number;
  publicProblemCount: number;
  status: ContestStatus;
};

export type PublicContestDetail = PublicContestEntry & {
  publicProblems: Array<{
    id: string;
    title: string;
    difficulty: number | null;
  }>;
};

export async function getPublicContests(): Promise<PublicContestEntry[]> {
  const now = new Date();
  const rows = await db.query.assignments.findMany({
    where: and(eq(assignments.visibility, "public"), ne(assignments.examMode, "none")),
    with: {
      group: {
        columns: { name: true },
      },
      assignmentProblems: {
        with: {
          problem: {
            columns: { id: true, visibility: true },
          },
        },
      },
    },
    orderBy: [asc(assignments.startsAt), asc(assignments.createdAt)],
  });

  return rows.map((assignment) => {
    const contest = {
      id: assignment.id,
      title: assignment.title,
      description: assignment.description ?? null,
      groupName: assignment.group.name,
      examMode: assignment.examMode as ExamMode,
      scoringModel: assignment.scoringModel as ScoringModel,
      startsAt: assignment.startsAt ? new Date(assignment.startsAt) : null,
      deadline: assignment.deadline ? new Date(assignment.deadline) : null,
      problemCount: assignment.assignmentProblems.length,
      publicProblemCount: assignment.assignmentProblems.filter((entry) => entry.problem?.visibility === "public").length,
    };

    return {
      ...contest,
      status: getContestStatus(
        {
          ...contest,
          groupId: assignment.groupId,
          examDurationMinutes: assignment.examDurationMinutes ?? null,
          freezeLeaderboardAt: assignment.freezeLeaderboardAt ? new Date(assignment.freezeLeaderboardAt) : null,
          enableAntiCheat: Boolean(assignment.enableAntiCheat),
          startedAt: null,
          personalDeadline: null,
        },
        now
      ),
    };
  });
}

export async function getPublicContestById(assignmentId: string): Promise<PublicContestDetail | null> {
  const assignment = await db.query.assignments.findFirst({
    where: and(eq(assignments.id, assignmentId), eq(assignments.visibility, "public"), ne(assignments.examMode, "none")),
    with: {
      group: {
        columns: { name: true },
      },
      assignmentProblems: {
        with: {
          problem: {
            columns: { id: true, title: true, visibility: true, difficulty: true },
          },
        },
      },
    },
  });

  if (!assignment) return null;

  const base = {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description ?? null,
    groupName: assignment.group.name,
    examMode: assignment.examMode as ExamMode,
    scoringModel: assignment.scoringModel as ScoringModel,
    startsAt: assignment.startsAt ? new Date(assignment.startsAt) : null,
    deadline: assignment.deadline ? new Date(assignment.deadline) : null,
    problemCount: assignment.assignmentProblems.length,
    publicProblemCount: assignment.assignmentProblems.filter((entry) => entry.problem?.visibility === "public").length,
  };

  return {
    ...base,
    status: getContestStatus(
      {
        ...base,
        groupId: assignment.groupId,
        examDurationMinutes: assignment.examDurationMinutes ?? null,
        freezeLeaderboardAt: assignment.freezeLeaderboardAt ? new Date(assignment.freezeLeaderboardAt) : null,
        enableAntiCheat: Boolean(assignment.enableAntiCheat),
        startedAt: null,
        personalDeadline: null,
      },
      new Date()
    ),
    publicProblems: assignment.assignmentProblems
      .filter((entry) => entry.problem?.visibility === "public")
      .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
      .map((entry) => ({
        id: entry.problem?.id ?? entry.problemId,
        title: entry.problem?.title ?? "",
        difficulty: entry.problem?.difficulty ?? null,
      })),
  };
}

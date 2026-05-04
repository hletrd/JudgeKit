import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("participant audit page implementation", () => {
  it("loads contest participant data and delegates rendering to the shared timeline view", () => {
    const source = read("src/app/(public)/contests/manage/[assignmentId]/participant/[userId]/page.tsx");

    expect(source).toContain('import { ParticipantTimelineView } from "@/components/contest/participant-timeline-view";');
    expect(source).toContain("getParticipantAuditData(assignmentId, userId)");
    expect(source).toContain("getParticipantTimeline(assignmentId, userId)");
    expect(source).toContain("<ParticipantTimelineView");
    expect(source).toContain("assignmentProblems={assignmentProblemRows}");
    expect(source).toContain("participantTimeline={participantTimeline}");
  });

  it("keeps the page responsible for assignment-level access checks before rendering the shared view", () => {
    const source = read("src/app/(public)/contests/manage/[assignmentId]/participant/[userId]/page.tsx");

    expect(source).toContain("canViewAssignmentSubmissions(");
    expect(source).toContain('redirect(`/dashboard/contests/${assignmentId}`)');
    expect(source).toContain('notFound()');
  });
});

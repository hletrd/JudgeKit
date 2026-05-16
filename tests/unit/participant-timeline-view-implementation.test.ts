import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("participant timeline view implementation", () => {
  it("renders the shared participant timeline UI surface from its own component", () => {
    const source = read("src/components/contest/participant-timeline-view.tsx");

    expect(source).toContain('export async function ParticipantTimelineView');
    expect(source).toContain('getTranslations("contests.participantAudit")');
    expect(source).toContain("<CodeTimelinePanel");
    expect(source).toContain("<ParticipantAntiCheatTimeline");
  });

  it("keeps the per-problem summary badges and anti-cheat summary in the shared component", () => {
    const source = read("src/components/contest/participant-timeline-view.tsx");

    // Per-problem summary keys actually wired into the rendered output (CR10-2:
    // the previously-asserted `problemSummary.bestScore` and
    // `problemSummary.timeToSolve` bag fields were dead — they were declared in
    // `TimelineTranslations` but never consumed by `ParticipantTimelineBar`,
    // and were dropped in cycle 10).
    expect(source).toContain('t("problemSummary.attempts"');
    expect(source).toContain('t("problemSummary.tries"');
    expect(source).toContain('t("problemSummary.best"');
    expect(source).toContain('t("problemSummary.firstAccepted")');
    expect(source).toContain('t("antiCheatSummary.title")');
    expect(source).toContain("participantTimeline.antiCheatSummary.byType");
  });

  it("wires the new timelineBar i18n keys for the participation bar", () => {
    const source = read("src/components/contest/participant-timeline-view.tsx");
    expect(source).toContain('t("timelineBar.axisStart")');
    expect(source).toContain('t("timelineBar.scoreLabel"');
    expect(source).toContain('t("timelineBar.durationLong"');
    expect(source).toContain('t("timelineBar.durationShort"');
  });
});

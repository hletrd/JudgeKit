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

  it("keeps the per-problem summary badges and anti-cheat summary wired (via the shared translations helper)", () => {
    // Cycle 11 (ARCH11-2): the per-call-site inline translations bag was
    // factored into `buildParticipantTimelineTranslations(t)`. The keys we
    // care about now live in the helper, not the view file. The view file
    // still owns the anti-cheat summary surface.
    const view = read("src/components/contest/participant-timeline-view.tsx");
    const helper = read("src/components/contest/participant-timeline-translations.ts");

    expect(helper).toContain('t("problemSummary.attempts"');
    expect(helper).toContain('t("problemSummary.tries"');
    expect(helper).toContain('t("problemSummary.best"');
    expect(helper).toContain('t("problemSummary.firstAccepted")');
    expect(view).toContain('t("antiCheatSummary.title")');
    expect(view).toContain("participantTimeline.antiCheatSummary.byType");
    expect(view).toContain("buildParticipantTimelineTranslations(t)");
  });

  it("wires the timelineBar i18n keys for the participation bar via the shared helper", () => {
    const helper = read("src/components/contest/participant-timeline-translations.ts");
    expect(helper).toContain('t("timelineBar.axisStart")');
    expect(helper).toContain('t("timelineBar.scoreLabel"');
    expect(helper).toContain('t("timelineBar.durationLong"');
    expect(helper).toContain('t("timelineBar.durationShort"');
    // Cycle 11 (CR11-2): snapshot-marker a11y label
    expect(helper).toContain('t("timelineBar.snapshotMarkerLabel"');
  });
});

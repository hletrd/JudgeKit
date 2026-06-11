import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EVENT_TYPE_COLORS,
  REVIEW_TIER_COLORS,
  antiCheatEventTypeLabel,
  formatAntiCheatDetails,
} from "@/components/contest/anti-cheat-presentation";
import { CLIENT_EVENT_TYPES } from "@/lib/anti-cheat/client-events";
import { getAntiCheatReviewTier } from "@/lib/anti-cheat/review-model";

/**
 * Server-originated event classes (see src/lib/anti-cheat/review-model.ts).
 * Pinned here so the catalog-coverage test below cannot silently skip them;
 * the escalate-tier assertion keeps this list honest against the model.
 */
const SERVER_EVENT_TYPES = [
  "ip_change",
  "code_similarity",
  "submission_stale_heartbeat",
] as const;

const ALL_EVENT_TYPES = [...CLIENT_EVENT_TYPES, ...SERVER_EVENT_TYPES];

function loadEventTypeMessages(locale: string): Record<string, string> {
  const raw = readFileSync(join(process.cwd(), `messages/${locale}.json`), "utf8");
  return JSON.parse(raw).contests.antiCheat.eventTypes;
}

/** Simulates next-intl's missing-message behavior: returns the key path. */
const missingT = (key: string) => `contests.antiCheat.${key}`;

describe("anti-cheat presentation — catalog coverage (AGG5-2)", () => {
  it.each(["en", "ko"])("every known event type has a %s label", (locale) => {
    const labels = loadEventTypeMessages(locale);
    for (const type of ALL_EVENT_TYPES) {
      expect(labels[type], `missing ${locale} label for ${type}`).toBeTruthy();
    }
  });

  it("keeps the pinned server-event list honest against the review model", () => {
    for (const type of SERVER_EVENT_TYPES) {
      expect(getAntiCheatReviewTier(type)).toBe("escalate");
    }
  });

  it("every known event type has a badge color, and escalate types read red", () => {
    for (const type of ALL_EVENT_TYPES) {
      expect(EVENT_TYPE_COLORS[type], `missing color for ${type}`).toBeTruthy();
    }
    for (const type of SERVER_EVENT_TYPES) {
      expect(EVENT_TYPE_COLORS[type]).toContain("red");
    }
    expect(REVIEW_TIER_COLORS.escalate).toContain("red");
  });
});

describe("antiCheatEventTypeLabel", () => {
  it("returns the translated label when the message exists", () => {
    const t = (key: string) =>
      key === "eventTypes.submission_stale_heartbeat" ? "Submission while monitor inactive" : key;
    expect(antiCheatEventTypeLabel("submission_stale_heartbeat", t)).toBe(
      "Submission while monitor inactive"
    );
  });

  it("falls back to the raw event type on a missing message (next-intl returns the key path, never nullish)", () => {
    expect(antiCheatEventTypeLabel("future_event_type", missingT)).toBe("future_event_type");
  });
});

describe("formatAntiCheatDetails", () => {
  const t = (key: string, values?: Record<string, string | number | Date>) => {
    switch (key) {
      case "detailStaleWithAge":
        return `Last monitor activity ${values?.age} before this submission (threshold ${values?.threshold})`;
      case "detailStaleNoActivity":
        return `No monitor activity recorded before this submission (threshold ${values?.threshold})`;
      case "detailSubmissionRef":
        return `Submission: ${values?.id}`;
      case "durationMinutesSeconds":
        return `${values?.minutes}m ${values?.seconds}s`;
      case "durationSeconds":
        return `${values?.seconds}s`;
      case "detailTargetLabel":
        return "Target";
      case "detailTargets.code-editor":
        return "Code editor";
      default:
        return `contests.antiCheat.${key}`;
    }
  };

  it("renders a stale-flag payload with age + submission reference instead of a JSON dump", () => {
    const raw = JSON.stringify({
      latestEventAt: 1_000,
      ageMs: 252_000,
      thresholdMs: 90_000,
      submissionId: "sub-abc",
    });
    expect(formatAntiCheatDetails(raw, t)).toBe(
      "Last monitor activity 4m 12s before this submission (threshold 1m 30s)\nSubmission: sub-abc"
    );
  });

  it("renders the no-prior-activity variant when ageMs is null", () => {
    const raw = JSON.stringify({
      latestEventAt: null,
      ageMs: null,
      thresholdMs: 90_000,
      submissionId: "sub-abc",
    });
    expect(formatAntiCheatDetails(raw, t)).toBe(
      "No monitor activity recorded before this submission (threshold 1m 30s)\nSubmission: sub-abc"
    );
  });

  it("omits the submission line for legacy flag rows without submissionId", () => {
    const raw = JSON.stringify({ latestEventAt: null, ageMs: null, thresholdMs: 90_000 });
    expect(formatAntiCheatDetails(raw, t)).toBe(
      "No monitor activity recorded before this submission (threshold 1m 30s)"
    );
  });

  it("renders copy/paste target payloads via the translated target", () => {
    expect(formatAntiCheatDetails(JSON.stringify({ target: "code-editor" }), t)).toBe(
      "Target: Code editor"
    );
  });

  it("falls back to the raw target name when its translation is missing", () => {
    expect(formatAntiCheatDetails(JSON.stringify({ target: "mystery-zone" }), t)).toBe(
      "Target: mystery-zone"
    );
  });

  it("pretty-prints unknown JSON payloads and passes through unparseable input", () => {
    expect(formatAntiCheatDetails(JSON.stringify({ pairedWith: "u2" }), t)).toBe(
      JSON.stringify({ pairedWith: "u2" }, null, 2)
    );
    expect(formatAntiCheatDetails("not-json", t)).toBe("not-json");
  });
});

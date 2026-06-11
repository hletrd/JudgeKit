import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLIENT_EVENT_TYPES } from "@/lib/anti-cheat/client-events";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("anti-cheat public event types", () => {
  it("keeps the canonical client-event vocabulary in lib (AGG4-7) without server-originated classes", () => {
    // The canonical list moved from the route module to lib in RPF cycle-4 so
    // the submission validator's freshness probe can consume it (routes are
    // leaves; lib must not import them).
    expect([...CLIENT_EVENT_TYPES]).toEqual([
      "tab_switch",
      "copy",
      "paste",
      "blur",
      "contextmenu",
      "heartbeat",
    ]);

    const source = read("src/lib/anti-cheat/client-events.ts");
    expect(source).toContain("export const CLIENT_EVENT_TYPES = [");
    expect(source).not.toContain('"ip_change",');
    expect(source).not.toContain('"code_similarity",');
    expect(source).not.toContain('"submission_stale_heartbeat",');
  });

  it("does not let contestant POSTs forge server-originated event classes", () => {
    const source = read("src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts");

    // The route's zod schema must be derived from the shared lib list — a
    // locally re-declared list could silently drift and re-open the forgery
    // hole this pin exists for.
    expect(source).toContain('import { CLIENT_EVENT_TYPES } from "@/lib/anti-cheat/client-events"');
    expect(source).toContain("z.enum(CLIENT_EVENT_TYPES)");
    expect(source).not.toContain("export const CLIENT_EVENT_TYPES");
    expect(source).not.toContain('"ip_change",');
    expect(source).not.toContain('"code_similarity",');
  });

  it("filters the submission freshness probe to client-emitted events (AGG4-2)", () => {
    const source = read("src/lib/assignments/submissions.ts");

    // Server-inserted rows (submission_stale_heartbeat, code_similarity) must
    // never count as browser liveness — otherwise one flag suppresses the
    // next ~90 s of flags.
    expect(source).toContain("inArray(antiCheatEvents.eventType, [...CLIENT_EVENT_TYPES])");
  });

  it("still keeps server-side code similarity evidence generation in the backend path", () => {
    const source = read("src/lib/assignments/code-similarity.ts");

    expect(source).toContain('eventType: "code_similarity" as const');
  });
});

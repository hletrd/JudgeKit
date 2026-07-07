import { describe, expect, it } from "vitest";
import {
  createInitialProblemTestCaseDrafts,
  serializeProblemTestCaseDraftsForMutation,
} from "@/lib/problems/test-case-drafts";
import { mergeTestCasePatchIntoExisting } from "@/lib/problem-management";

describe("problem test case draft helpers", () => {
  it("sends full content for reordered rows (server merges positionally)", () => {
    const initial = createInitialProblemTestCaseDrafts([
      { input: "1 2", expectedOutput: "3", isVisible: false },
      { input: "2 3", expectedOutput: "5", isVisible: true },
    ]);

    const reordered = [initial[1], initial[0]].map((draft) => ({ ...draft }));

    const serialized = serializeProblemTestCaseDraftsForMutation(reordered, true);

    // A sparse (undefined) entry is merged against the existing row at the
    // SAME index on the server, so once rows move the client must send full
    // content or the server would stitch together content from the wrong
    // rows (RPF cycle-1 PR-H1).
    expect(serialized).toEqual([
      { input: "2 3", expectedOutput: "5", isVisible: true },
      { input: "1 2", expectedOutput: "3", isVisible: false },
    ]);
  });

  it("keeps sparse payloads for rows still at their originally loaded position", () => {
    const initial = createInitialProblemTestCaseDrafts([
      { input: "1 2", expectedOutput: "3", isVisible: false },
      { input: "2 3", expectedOutput: "5", isVisible: true },
    ]);

    const serialized = serializeProblemTestCaseDraftsForMutation(
      initial.map((draft) => ({ ...draft })),
      true
    );

    expect(serialized).toEqual([
      { input: undefined, expectedOutput: undefined, isVisible: false },
      { input: undefined, expectedOutput: undefined, isVisible: true },
    ]);
  });

  it("keeps full payloads for newly added rows while diffing existing rows", () => {
    const initial = createInitialProblemTestCaseDrafts([
      { input: "1 2", expectedOutput: "3", isVisible: false },
    ]);

    const serialized = serializeProblemTestCaseDraftsForMutation(
      [
        { ...initial[0], expectedOutput: "4" },
        { input: "9 9", expectedOutput: "18", isVisible: false, _key: "new-row" },
      ],
      true
    );

    expect(serialized).toEqual([
      { input: undefined, expectedOutput: "4", isVisible: false },
      { input: "9 9", expectedOutput: "18", isVisible: false },
    ]);
  });

  it("deleting a middle row does not corrupt later rows through the server merge (PR-H1)", () => {
    const loaded = [
      { input: "in-A", expectedOutput: "out-A", isVisible: true },
      { input: "in-B", expectedOutput: "out-B", isVisible: false },
      { input: "in-C", expectedOutput: "out-C", isVisible: true },
    ];
    const initial = createInitialProblemTestCaseDrafts(loaded);

    // User deletes middle case B in the editor.
    const afterDelete = [initial[0], initial[2]].map((draft) => ({ ...draft }));
    const patch = serializeProblemTestCaseDraftsForMutation(afterDelete, true);

    // Simulate the server-side positional merge against the existing rows.
    const existingRows = loaded.map((row, index) => ({
      id: `row-${index}`,
      input: row.input,
      expectedOutput: row.expectedOutput,
      isVisible: row.isVisible,
      sortOrder: index,
    }));
    const merged = mergeTestCasePatchIntoExisting(existingRows, patch);

    // Before the fix, index 1 merged sparse against row B and stored B's
    // content with C's visibility — silent test-data corruption.
    expect(merged).toEqual([
      { input: "in-A", expectedOutput: "out-A", isVisible: true },
      { input: "in-C", expectedOutput: "out-C", isVisible: true },
    ]);
  });
});

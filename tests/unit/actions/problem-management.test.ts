import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
//
// sqlite.transaction() receives a callback and returns a *new* function that,
// when called, runs the callback synchronously (mirroring better-sqlite3's
// synchronous transaction API).  We capture the callback so individual tests
// can inspect the calls made inside it.

const {
  insertRunMock,
  updateSetMock,
  updateWhereMock,
  deleteWhereMock,
  sanitizeHtmlMock,
} = vi.hoisted(() => {
  const insertRunMock = vi.fn();
  const updateSetMock = vi.fn();
  const updateWhereMock = vi.fn();
  const deleteWhereMock = vi.fn();
  const sanitizeHtmlMock = vi.fn((html: string) => `sanitized:${html}`);
  return { insertRunMock, updateSetMock, updateWhereMock, deleteWhereMock, sanitizeHtmlMock };
});

// db.insert(table).values(v).run()
const dbInsertMock = vi.hoisted(() =>
  vi.fn(() => ({ values: vi.fn(() => ({ run: insertRunMock })) }))
);

// db.update(table).set(v).where(cond).run()
const dbUpdateMock = vi.hoisted(() =>
  vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({ run: updateWhereMock })),
    })),
  }))
);

// db.delete(table).where(cond).run()
const dbDeleteMock = vi.hoisted(() =>
  vi.fn(() => ({ where: vi.fn(() => ({ run: deleteWhereMock })) }))
);

// sqlite.transaction(fn) returns a wrapper that calls fn() synchronously
const sqliteTransactionMock = vi.hoisted(() =>
  vi.fn((fn: () => void) => () => fn())
);

vi.mock("@/lib/db", () => ({
  db: {
    insert: dbInsertMock,
    update: dbUpdateMock,
    delete: dbDeleteMock,
  },
  sqlite: {
    transaction: sqliteTransactionMock,
  },
}));

vi.mock("@/lib/security/sanitize-html", () => ({
  sanitizeHtml: sanitizeHtmlMock,
}));

// nanoid produces predictable IDs in tests so we can assert on them
vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "test-id-nanoid"),
}));

// ── Subject under test (imported after mocks) ────────────────────────────────
import {
  createProblemWithTestCases,
  updateProblemWithTestCases,
} from "@/lib/problem-management";
import type { ProblemMutationInput } from "@/lib/validators/problem-management";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<ProblemMutationInput> = {}): ProblemMutationInput {
  return {
    title: "Two Sum",
    description: "<p>Find two numbers</p>",
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    visibility: "public",
    showCompileOutput: true,
    showDetailedResults: true,
    showRuntimeErrors: true,
    allowAiAssistant: true,
    comparisonMode: "exact",
    testCases: [],
    ...overrides,
  };
}

function makeTestCases(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    input: `${i + 1}\n`,
    expectedOutput: `${(i + 1) * 2}\n`,
    isVisible: i === 0,
  }));
}

// ── Reset mocks between tests ────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Restore default implementations after clearAllMocks resets call counts
  dbInsertMock.mockImplementation(
    () => ({ values: vi.fn(() => ({ run: insertRunMock })) })
  );
  dbUpdateMock.mockImplementation(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({ run: updateWhereMock })),
    })),
  }));
  dbDeleteMock.mockImplementation(
    () => ({ where: vi.fn(() => ({ run: deleteWhereMock })) })
  );
  sqliteTransactionMock.mockImplementation((fn: () => void) => () => fn());
  sanitizeHtmlMock.mockImplementation((html: string) => `sanitized:${html}`);
});

// ════════════════════════════════════════════════════════════════════════════
// createProblemWithTestCases
// ════════════════════════════════════════════════════════════════════════════

describe("createProblemWithTestCases", () => {
  it("returns the generated problem id", () => {
    const id = createProblemWithTestCases(makeInput(), "author-1");
    expect(id).toBe("test-id-nanoid");
  });

  it("runs inside a sqlite transaction", () => {
    createProblemWithTestCases(makeInput(), "author-1");
    expect(sqliteTransactionMock).toHaveBeenCalledOnce();
  });

  it("inserts problem row with sanitized description", () => {
    const input = makeInput({ description: "<script>xss</script>" });
    createProblemWithTestCases(input, "author-1");

    expect(dbInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({}) // problems table ref
    );
    // The .values() call receives an object — grab it from the chain
    const valuesCall = dbInsertMock.mock.results[0].value.values;
    expect(valuesCall).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Two Sum",
        description: "sanitized:<script>xss</script>",
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        visibility: "public",
        authorId: "author-1",
      })
    );
  });

  it("sanitizes html description before storing", () => {
    createProblemWithTestCases(makeInput({ description: "<b>bold</b>" }), "author-1");
    expect(sanitizeHtmlMock).toHaveBeenCalledWith("<b>bold</b>");
  });

  it("does NOT insert test cases when testCases array is empty", () => {
    createProblemWithTestCases(makeInput({ testCases: [] }), "author-1");
    // Only one insert call: the problem itself
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
  });

  it("inserts test cases when testCases array is non-empty", () => {
    const input = makeInput({ testCases: makeTestCases(2) });
    createProblemWithTestCases(input, "author-1");
    // Two insert calls: problem + test cases batch
    expect(dbInsertMock).toHaveBeenCalledTimes(2);
  });

  it("maps test cases with correct sortOrder", () => {
    const testCases = makeTestCases(3);
    createProblemWithTestCases(makeInput({ testCases }), "author-1");

    const testCasesValuesCall = dbInsertMock.mock.results[1].value.values;
    const insertedTestCases = testCasesValuesCall.mock.calls[0][0] as Array<{
      sortOrder: number;
      input: string;
      expectedOutput: string;
      isVisible: boolean;
    }>;

    expect(insertedTestCases).toHaveLength(3);
    expect(insertedTestCases[0].sortOrder).toBe(0);
    expect(insertedTestCases[1].sortOrder).toBe(1);
    expect(insertedTestCases[2].sortOrder).toBe(2);
  });

  it("sets isVisible correctly on each test case", () => {
    const testCases = makeTestCases(2); // first is visible, rest are not
    createProblemWithTestCases(makeInput({ testCases }), "author-1");

    const testCasesValuesCall = dbInsertMock.mock.results[1].value.values;
    const inserted = testCasesValuesCall.mock.calls[0][0] as Array<{ isVisible: boolean }>;

    expect(inserted[0].isVisible).toBe(true);
    expect(inserted[1].isVisible).toBe(false);
  });

  it("assigns problemId to every test case row", () => {
    const input = makeInput({ testCases: makeTestCases(2) });
    createProblemWithTestCases(input, "author-1");

    const testCasesValuesCall = dbInsertMock.mock.results[1].value.values;
    const inserted = testCasesValuesCall.mock.calls[0][0] as Array<{ problemId: string }>;

    inserted.forEach((tc) => {
      expect(tc.problemId).toBe("test-id-nanoid");
    });
  });

  it("stores the correct authorId on the problem row", () => {
    createProblemWithTestCases(makeInput(), "instructor-42");

    const valuesCall = dbInsertMock.mock.results[0].value.values;
    expect(valuesCall).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: "instructor-42" })
    );
  });

  it("propagates errors thrown during the transaction", () => {
    insertRunMock.mockImplementationOnce(() => {
      throw new Error("DB constraint violation");
    });

    expect(() => createProblemWithTestCases(makeInput(), "author-1")).toThrow(
      "DB constraint violation"
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// updateProblemWithTestCases
// ════════════════════════════════════════════════════════════════════════════

describe("updateProblemWithTestCases", () => {
  it("runs inside a sqlite transaction", () => {
    updateProblemWithTestCases("problem-1", makeInput());
    expect(sqliteTransactionMock).toHaveBeenCalledOnce();
  });

  it("updates the problem row with sanitized description", () => {
    const input = makeInput({ description: "<em>updated</em>" });
    updateProblemWithTestCases("problem-1", input);

    expect(dbUpdateMock).toHaveBeenCalledTimes(1);
    const setCall = dbUpdateMock.mock.results[0].value.set;
    expect(setCall).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Two Sum",
        description: "sanitized:<em>updated</em>",
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        visibility: "public",
      })
    );
  });

  it("sanitizes html description before updating", () => {
    updateProblemWithTestCases("problem-1", makeInput({ description: "<u>text</u>" }));
    expect(sanitizeHtmlMock).toHaveBeenCalledWith("<u>text</u>");
  });

  it("deletes existing test cases for the problem", () => {
    updateProblemWithTestCases("problem-1", makeInput());
    expect(dbDeleteMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT insert test cases when the new testCases array is empty", () => {
    updateProblemWithTestCases("problem-1", makeInput({ testCases: [] }));
    // update + delete only; no insert
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("inserts replacement test cases when testCases array is non-empty", () => {
    const input = makeInput({ testCases: makeTestCases(3) });
    updateProblemWithTestCases("problem-1", input);
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
  });

  it("maps replacement test cases with correct sortOrder", () => {
    const testCases = makeTestCases(3);
    updateProblemWithTestCases("problem-1", makeInput({ testCases }));

    const testCasesValuesCall = dbInsertMock.mock.results[0].value.values;
    const inserted = testCasesValuesCall.mock.calls[0][0] as Array<{
      sortOrder: number;
    }>;

    expect(inserted.map((tc) => tc.sortOrder)).toEqual([0, 1, 2]);
  });

  it("assigns the given problemId to every replacement test case row", () => {
    const input = makeInput({ testCases: makeTestCases(2) });
    updateProblemWithTestCases("problem-99", input);

    const testCasesValuesCall = dbInsertMock.mock.results[0].value.values;
    const inserted = testCasesValuesCall.mock.calls[0][0] as Array<{ problemId: string }>;

    inserted.forEach((tc) => {
      expect(tc.problemId).toBe("problem-99");
    });
  });

  it("propagates errors thrown during the transaction", () => {
    updateWhereMock.mockImplementationOnce(() => {
      throw new Error("DB update failure");
    });

    expect(() => updateProblemWithTestCases("problem-1", makeInput())).toThrow(
      "DB update failure"
    );
  });
});

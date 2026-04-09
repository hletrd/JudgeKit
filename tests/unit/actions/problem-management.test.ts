import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
//
// execTransaction(fn) receives a callback and runs it with a transaction-like
// client. We capture that call so individual tests can inspect behavior.

const {
  insertRunMock,
  updateSetMock,
  updateWhereMock,
  deleteWhereMock,
  sanitizeHtmlMock,
  sanitizeMarkdownMock,
} = vi.hoisted(() => {
  const insertRunMock = vi.fn();
  const updateSetMock = vi.fn();
  const updateWhereMock = vi.fn();
  const deleteWhereMock = vi.fn();
  const sanitizeHtmlMock = vi.fn((html: string) => `sanitized:${html}`);
  const sanitizeMarkdownMock = vi.fn((markdown: string) => `sanitized:${markdown}`);
  return { insertRunMock, updateSetMock, updateWhereMock, deleteWhereMock, sanitizeHtmlMock, sanitizeMarkdownMock };
});

// db.insert(table).values(v)
const dbInsertMock = vi.hoisted(() =>
  vi.fn(() => ({
    values: vi.fn(async (values: unknown) => insertRunMock(values)),
  }))
);

// db.update(table).set(v).where(cond)
const dbUpdateMock = vi.hoisted(() =>
  vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(async (cond: unknown) => updateWhereMock(cond)),
    })),
  }))
);

// db.delete(table).where(cond)
const dbDeleteMock = vi.hoisted(() =>
  vi.fn(() => ({ where: vi.fn(async (cond: unknown) => deleteWhereMock(cond)) }))
);

const execTransactionMock = vi.hoisted(() =>
  vi.fn(async (fn: (tx: { insert: typeof dbInsertMock; update: typeof dbUpdateMock; delete: typeof dbDeleteMock }) => unknown) =>
    fn({
      insert: dbInsertMock,
      update: dbUpdateMock,
      delete: dbDeleteMock,
    })
  )
);

vi.mock("@/lib/db", () => ({
  db: {
    insert: dbInsertMock,
    update: dbUpdateMock,
    delete: dbDeleteMock,
  },
  execTransaction: execTransactionMock,
}));

vi.mock("@/lib/security/sanitize-html", () => ({
  sanitizeHtml: sanitizeHtmlMock,
  sanitizeMarkdown: sanitizeMarkdownMock,
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
    tags: [],
    ...overrides,
  } as ProblemMutationInput;
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
    () => ({ values: vi.fn(async (values: unknown) => insertRunMock(values)) })
  );
  dbUpdateMock.mockImplementation(() => ({
    set: vi.fn(() => ({
      where: vi.fn(async (cond: unknown) => updateWhereMock(cond)),
    })),
  }));
  dbDeleteMock.mockImplementation(
    () => ({ where: vi.fn(async (cond: unknown) => deleteWhereMock(cond)) })
  );
  execTransactionMock.mockImplementation(async (fn: (tx: { insert: typeof dbInsertMock; update: typeof dbUpdateMock; delete: typeof dbDeleteMock }) => unknown) =>
    fn({
      insert: dbInsertMock,
      update: dbUpdateMock,
      delete: dbDeleteMock,
    })
  );
  sanitizeMarkdownMock.mockImplementation((markdown: string) => `sanitized:${markdown}`);
});

// ════════════════════════════════════════════════════════════════════════════
// createProblemWithTestCases
// ════════════════════════════════════════════════════════════════════════════

describe("createProblemWithTestCases", () => {
  it("returns the generated problem id", async () => {
    const id = await createProblemWithTestCases(makeInput(), "author-1");
    expect(id).toBe("test-id-nanoid");
  });

  it("runs inside execTransaction", async () => {
    await createProblemWithTestCases(makeInput(), "author-1");
    expect(execTransactionMock).toHaveBeenCalledOnce();
  });

  it("inserts problem row with sanitized description", async () => {
    const input = makeInput({ description: "<script>xss</script>" });
    await createProblemWithTestCases(input, "author-1");

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

  it("sanitizes html description before storing", async () => {
    await createProblemWithTestCases(makeInput({ description: "<b>bold</b>" }), "author-1");
    expect(sanitizeMarkdownMock).toHaveBeenCalledWith("<b>bold</b>");
  });

  it("does NOT insert test cases when testCases array is empty", async () => {
    await createProblemWithTestCases(makeInput({ testCases: [] }), "author-1");
    // Only one insert call: the problem itself
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
  });

  it("inserts test cases when testCases array is non-empty", async () => {
    const input = makeInput({ testCases: makeTestCases(2) });
    await createProblemWithTestCases(input, "author-1");
    // Two insert calls: problem + test cases batch
    expect(dbInsertMock).toHaveBeenCalledTimes(2);
  });

  it("maps test cases with correct sortOrder", async () => {
    const testCases = makeTestCases(3);
    await createProblemWithTestCases(makeInput({ testCases }), "author-1");

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

  it("sets isVisible correctly on each test case", async () => {
    const testCases = makeTestCases(2); // first is visible, rest are not
    await createProblemWithTestCases(makeInput({ testCases }), "author-1");

    const testCasesValuesCall = dbInsertMock.mock.results[1].value.values;
    const inserted = testCasesValuesCall.mock.calls[0][0] as Array<{ isVisible: boolean }>;

    expect(inserted[0].isVisible).toBe(true);
    expect(inserted[1].isVisible).toBe(false);
  });

  it("assigns problemId to every test case row", async () => {
    const input = makeInput({ testCases: makeTestCases(2) });
    await createProblemWithTestCases(input, "author-1");

    const testCasesValuesCall = dbInsertMock.mock.results[1].value.values;
    const inserted = testCasesValuesCall.mock.calls[0][0] as Array<{ problemId: string }>;

    inserted.forEach((tc) => {
      expect(tc.problemId).toBe("test-id-nanoid");
    });
  });

  it("stores the correct authorId on the problem row", async () => {
    await createProblemWithTestCases(makeInput(), "instructor-42");

    const valuesCall = dbInsertMock.mock.results[0].value.values;
    expect(valuesCall).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: "instructor-42" })
    );
  });

  it("propagates errors thrown during the transaction", async () => {
    insertRunMock.mockImplementationOnce(() => {
      throw new Error("DB constraint violation");
    });

    await expect(createProblemWithTestCases(makeInput(), "author-1")).rejects.toThrow(
      "DB constraint violation"
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// updateProblemWithTestCases
// ════════════════════════════════════════════════════════════════════════════

describe("updateProblemWithTestCases", () => {
  it("runs inside execTransaction", async () => {
    await updateProblemWithTestCases("problem-1", makeInput());
    expect(execTransactionMock).toHaveBeenCalledOnce();
  });

  it("updates the problem row with sanitized description", async () => {
    const input = makeInput({ description: "<em>updated</em>" });
    await updateProblemWithTestCases("problem-1", input);

    expect(dbUpdateMock).toHaveBeenCalled();
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

  it("sanitizes html description before updating", async () => {
    await updateProblemWithTestCases("problem-1", makeInput({ description: "<u>text</u>" }));
    expect(sanitizeMarkdownMock).toHaveBeenCalledWith("<u>text</u>");
  });

  it("deletes existing test cases for the problem", async () => {
    await updateProblemWithTestCases("problem-1", makeInput());
    expect(dbDeleteMock).toHaveBeenCalled();
  });

  it("does NOT insert test cases when the new testCases array is empty", async () => {
    await updateProblemWithTestCases("problem-1", makeInput({ testCases: [] }));
    // update + delete only; no insert
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("inserts replacement test cases when testCases array is non-empty", async () => {
    const input = makeInput({ testCases: makeTestCases(3) });
    await updateProblemWithTestCases("problem-1", input);
    expect(dbInsertMock).toHaveBeenCalledTimes(1);
  });

  it("maps replacement test cases with correct sortOrder", async () => {
    const testCases = makeTestCases(3);
    await updateProblemWithTestCases("problem-1", makeInput({ testCases }));

    const testCasesValuesCall = dbInsertMock.mock.results[0].value.values;
    const inserted = testCasesValuesCall.mock.calls[0][0] as Array<{
      sortOrder: number;
    }>;

    expect(inserted.map((tc) => tc.sortOrder)).toEqual([0, 1, 2]);
  });

  it("assigns the given problemId to every replacement test case row", async () => {
    const input = makeInput({ testCases: makeTestCases(2) });
    await updateProblemWithTestCases("problem-99", input);

    const testCasesValuesCall = dbInsertMock.mock.results[0].value.values;
    const inserted = testCasesValuesCall.mock.calls[0][0] as Array<{ problemId: string }>;

    inserted.forEach((tc) => {
      expect(tc.problemId).toBe("problem-99");
    });
  });

  it("propagates errors thrown during the transaction", async () => {
    updateWhereMock.mockImplementationOnce(() => {
      throw new Error("DB update failure");
    });

    await expect(updateProblemWithTestCases("problem-1", makeInput())).rejects.toThrow(
      "DB update failure"
    );
  });
});

import { nanoid } from "nanoid";

export type ProblemTestCaseDraft = {
  _key?: string;
  input: string;
  expectedOutput: string;
  isVisible: boolean;
  _inputDirty?: boolean;
  _outputDirty?: boolean;
  _originalInput?: string;
  _originalExpectedOutput?: string;
  /** Position of this draft in the originally loaded test-case list. The
   * server merges sparse patches positionally against that list, so a draft
   * may only omit unchanged content while it still sits at its original
   * index. Deleting or reordering rows shifts positions, and a sparse patch
   * would then merge against the WRONG existing row, silently corrupting
   * test data (RPF cycle-1 PR-H1). */
  _originalIndex?: number;
};

export function createEmptyProblemTestCaseDraft(): ProblemTestCaseDraft {
  return {
    _key: nanoid(),
    input: "",
    expectedOutput: "",
    isVisible: false,
  };
}

export function createInitialProblemTestCaseDrafts(
  testCases: Array<Pick<ProblemTestCaseDraft, "input" | "expectedOutput" | "isVisible">>
): ProblemTestCaseDraft[] {
  return testCases.map((testCase, index) => ({
    ...testCase,
    _key: nanoid(),
    _originalInput: testCase.input,
    _originalExpectedOutput: testCase.expectedOutput,
    _originalIndex: index,
  }));
}

export function serializeProblemTestCaseDraftsForMutation(
  testCases: ProblemTestCaseDraft[],
  isEditing: boolean
) {
  return testCases.map(
    (
      {
        _key,
        _inputDirty,
        _outputDirty,
        _originalInput,
        _originalExpectedOutput,
        _originalIndex,
        ...rest
      },
      index
    ) => {
      void _key;
      void _inputDirty;
      void _outputDirty;

      if (!isEditing || (_originalInput === undefined && _originalExpectedOutput === undefined)) {
        return rest;
      }

      // The server merges sparse patches positionally against the existing
      // rows (sorted by sortOrder, id) — the same order this list was loaded
      // in. Omitting content is therefore only safe while this draft still
      // occupies its originally loaded position. After a deletion or reorder
      // the positions shift, and a sparse entry would inherit content from a
      // DIFFERENT existing row, silently corrupting the test case
      // (RPF cycle-1 PR-H1). Send full content in that case.
      if (_originalIndex !== index) {
        return rest;
      }

      return {
        ...rest,
        input: _originalInput === rest.input ? undefined : rest.input,
        expectedOutput:
          _originalExpectedOutput === rest.expectedOutput ? undefined : rest.expectedOutput,
      };
    }
  );
}

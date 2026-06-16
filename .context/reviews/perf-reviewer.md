# Perf Reviewer — Function-Judging (cycle 1, 2026-06-16)

### PERF-1 (Low) compute-expected runs cases serially
`compute-expected/route.ts:129` loops cases with `await executeCompilerRun` sequentially. For a problem with many test cases this is O(n) sandbox spawns end-to-end. Author-only, bounded by case count; acceptable but could batch/parallelize with a concurrency cap. Confidence: High.

### PERF-2 (Low) FunctionTestCaseEditor recomputes errorsByCase on every keystroke
`function-test-case-editor.tsx:217` `useMemo` over all cases × params reparses every field on each `fields` change. Fine for typical case counts (<50) but parsing scales with total fields. Confidence: Medium. Acceptable for v1.

### PERF-3 (Low) Stub regenerated via getAdapter().generateStub on every spec change
`function-reference-solution.tsx:100` `useMemo` keyed on `[selectedLanguage, spec]` — spec is a new object each render so memo rarely hits. Cheap string build; negligible. Confidence: High.

No CPU/memory hot paths or N+1 DB queries in the function-judging request handlers beyond PERF-1.

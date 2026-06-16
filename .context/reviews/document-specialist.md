# Document Specialist — doc/code consistency (cycle 1, 2026-06-16)

### DOC-1 (OK) function-judging v1 type limits documented
Commit b6a6acc5 "docs(api): reflect function-judging v1 type limits". docs/ describes the 7 languages and excluded double. Cross-checked against AUTHORABLE_FUNCTION_TYPES — consistent.

### DOC-2 (Low) Single-line stdin contract undocumented
The implicit "args are one compact JSON line" invariant (ARC-1/DBG-2) is not stated in the design doc. Add a short note so future serializer changes preserve it.

### DOC-3 (Low) Cross-language string-escaping equivalence not specified
The design doc does not state that all 7 language writers MUST produce byte-identical JSON for the same value (required for exact-match cross-language judging). Document this contract and back it with a golden test (see tracer Hypothesis A).

No CLAUDE.md / AGENTS.md violations introduced. Korean-typography rule (no custom letter-spacing/tracking on Korean) not violated by function-judging components (no tracking-* utilities present).

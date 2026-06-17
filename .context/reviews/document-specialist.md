# Document Specialist — cycle 6 (2026-06-18)

Documentation review of v1.1 changes.

## NEW FINDINGS

### DOC6-1 (Medium) `docs/function-judging.md` may not mention locale requirements
The function-judging documentation should explicitly state that all adapters
must use locale-independent formatting for doubles. The current docs focus on
type support and comparison modes but may not mention the locale issue.

Fix: Add a "Locale Independence" section to `docs/function-judging.md` stating
that all adapters must produce dot-decimal output regardless of environment locale.
Confidence: Medium.

### DOC6-2 (Low) `README.md` was updated for v1.1 but should be checked for completeness
Commit `dbf55d70` updated README.md. Verify that all v1.1 features are documented:
- double/double[] support
- float comparison mode
- tolerance inputs

Fix: Verify README completeness.
Confidence: Low.

## CARRIED FORWARD

- DOC-2 (Low) Single-line stdin contract documented — partially addressed by `serialization.ts` comment
- DOC-3 (Low) Cross-language string-escaping equivalence documented — partially addressed by adapter comments

## VERIFIED

- `docs/function-judging.md` exists and was updated in recent commits
- `docs/api.md` documents double/double[] v1.1 support (commit `ff0b2f93`)

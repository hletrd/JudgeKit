# Critic — cycle 6 (2026-06-18)

Multi-perspective critique of v1.1 changes.

## NEW FINDINGS

### CRIT6-1 (Medium) Inconsistent locale handling across adapters
Seven adapters, three different approaches to locale:
- C++: uses `snprintf`/`stod` — locale-sensitive, NOT fixed
- Java: uses `Locale.ROOT` — locale-independent, FIXED
- C#: uses `CultureInfo.InvariantCulture` — locale-independent, correct
- Go: uses `strconv` — locale-independent by design, correct
- Python: uses `repr`/`json.dumps` — locale-independent, correct
- JS/TS: uses `String()`/`JSON.stringify` — locale-independent, correct

The inconsistency is a maintainability risk. A future developer adding a new
adapter might not know to handle locale. The C++ adapter's omission is the
most critical because it was not fixed when Java was.

Fix: Document the locale-independence requirement in the adapter contract
(`adapter.ts` interface docs) and add a golden test.
Confidence: Medium.

### CRIT6-2 (Low) `isFloatComparedReturn` duplicates logic from `resolveComparisonMode`
`src/components/problem/function-signature-builder.tsx:46-48`
```typescript
export function isFloatComparedReturn(type: FunctionType): boolean {
  return (isArrayType(type) ? elementType(type) : type) === "double";
}
```
This logic is duplicated from `resolveComparisonMode` in `problem-management.ts`.
The UI uses this to show the float-comparison note. If the server-side logic
changes, the UI might drift.

Fix: Share the logic via a shared utility (e.g., `isFloatComparisonMode(returnType)`).
Confidence: Low.

## CARRIED FORWARD

- Remove button detachment on mobile (from cycle 1) — still present but not a regression

## VERIFIED

- Cross-language string escaping divergence: FIXED in cycle 5, all adapters now match
- Single-line stdin contract: ASSERTED in cycle 5

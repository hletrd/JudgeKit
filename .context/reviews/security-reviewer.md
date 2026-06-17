# Security Review — cycle 6 (2026-06-18)

Review of function-judging v1.1 changes and security posture.

## NEW FINDINGS

### SEC6-1 (Medium) `compute-expected` runs author code with no output size limit
`src/app/api/v1/problems/[id]/compute-expected/route.ts` (not re-read this cycle,
but the design is unchanged from cycle 1): The reference solution execution via
`executeCompilerRun` has no output size limit. A malicious author could craft a
reference solution that prints an extremely large string (e.g., a loop printing
a 100MB string), causing memory pressure on the app server during compute-expected.

The sandbox has resource limits (time, memory), but the output itself is captured
in memory before being returned to the client. The existing `RUNTIME_ERROR_OUTPUT_LIMIT`
(500 chars) only applies to the judge worker, not the app server's compiler execution.

Fix: Add an output size cap to `executeCompilerRun` in the compiler path, or
specifically in the compute-expected route. Reject if stdout exceeds a reasonable
limit (e.g., 1MB for expected outputs).
Confidence: Medium.

### SEC6-2 (Low) `submissions/route.ts` POST does not validate `sourceCode` for null bytes
`src/app/api/v1/submissions/route.ts:219`
```typescript
if (Buffer.byteLength(sourceCode, "utf8") > getMaxSourceCodeSizeBytes()) {
```
The source code size check happens before any content validation. Null bytes in
source code could cause issues with some language compilers or the judge worker's
string handling. While most compilers handle null bytes gracefully (treating them
as end-of-string in C, or as literal bytes in others), this is an edge case that
could cause unexpected behavior.

Fix: Add a null byte check to the validator or reject null bytes in source code.
Confidence: Low.

## CARRIED FORWARD

- SEC-3 (Low) host-path trim from compute-expected diagnostics — still open

## VERIFIED OK

- Reference solution non-exposure: still correctly stripped
- Function name/param injection: still regex-validated
- Language restriction at submit time: confirmed enforced at `submissions/route.ts:254-261`
- Comparison mode derivation: server-authoritative, client cannot override

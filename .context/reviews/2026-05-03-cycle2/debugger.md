# Debugger Review — Cycle 2 (2026-05-03)

**Reviewer:** debugger
**HEAD:** `689cf61d`

---

## C2-DBG-1 (MEDIUM, HIGH confidence) — `redeemRecruitingToken` transaction rollback swallows root cause

**File:** `src/lib/assignments/recruiting-invitations.ts:536-544`

```ts
} catch (err: unknown) {
  if (err instanceof Error && err.message === "alreadyRedeemed") {
    return { ok: false, error: "alreadyRedeemed" };
  }
  if (err instanceof Error && err.message === "tokenExpired") {
    return { ok: false, error: "tokenExpired" };
  }
  throw err;
}
```

The outer catch only handles `alreadyRedeemed` and `tokenExpired` errors. Any other error from the transaction (e.g., DB connection failure, constraint violation) is re-thrown and will surface as a 500 error. However, the `tokenExpired` error is caught but never thrown in the current code — the `throw new Error("tokenExpired")` was replaced by the atomic SQL check in a prior commit, making the `tokenExpired` catch branch dead code.

**Fix:** Remove the dead `tokenExpired` catch branch. Add a catch-all that returns `{ ok: false, error: "internalError" }` with appropriate logging, rather than letting the error propagate to the generic 500 handler.

---

## C2-DBG-2 (LOW, HIGH confidence) — File upload handler double-wraps error handling

**File:** `src/app/api/v1/files/route.ts:129-133`

The POST handler has its own try/catch that returns `apiError("internalServerError", 500)`. But the `createApiHandler` wrapper also has a catch-all that returns the same error. This means the inner try/catch is redundant — the wrapper would handle any uncaught errors.

**Fix:** Remove the inner try/catch from the POST handler, relying on the `createApiHandler` wrapper's error handling. Or keep it if there's a specific error format needed, but add a comment explaining why.

---

## C2-DBG-3 (LOW, MEDIUM confidence) — `bestByProblem` Map in results page uses full submission row as value

**File:** `src/app/(auth)/recruit/[token]/results/page.tsx:174-186`

```ts
const bestByProblem = new Map<string, (typeof submissionRows)[number]>();
```

The Map stores the full submission row, but `computeRecruitResultsTotals` only reads `score` from it (per `RecruitBestSubmission` interface). This is correct due to TypeScript structural typing, but the Map carries more data than needed. If a future change reads additional fields from the Map, the data would be there — but that's exactly the hazard noted in the JSDoc for `computeRecruitResultsTotals`.

**Fix:** No code change needed. The existing JSDoc comment adequately documents the contract.

---

## Final Sweep

Checked for: null pointer dereferences (guarded throughout), race conditions (advisory locks on submission creation and recruiting invitation claim), unhandled promise rejections (all async paths have try/catch), and error propagation (consistent pattern via createApiHandler wrapper). No critical latent bugs found.

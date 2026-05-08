# Tracer Review — Cycle 5 (2026-05-03)

**HEAD reviewed:** `eb4429a5`

---

## C5-TR-1 (HIGH, HIGH confidence) — Causal trace: compileOutput leaks from DB to guest tooltip

**Trace:**
1. Guest visits `GET /submissions`
2. `SubmissionsPage` (RSC) queries DB: `select({ ..., compileOutput: submissions.compileOutput, ... })`
3. No `isGuest` filter on `compileOutput` in the query
4. Data flows to JSX: `<SubmissionStatusBadge compileOutput={sub.compileOutput} />`
5. Badge renders: if `status === "compile_error"` && `compileOutput` is truthy → shows tooltip with raw compileOutput text
6. Guest hovers → sees compiler error which may contain source code fragments

**Contrast path (detail page, correct):**
1. Guest visits `GET /submissions/[id]`
2. Detail page: `compileOutput: isOwner ? (submission.compileOutput ?? null) : null`
3. Non-owner sees `null` → no tooltip

**Root cause:** The list page query was written before the visibility model was established. The detail page was fixed in isolation. There is no centralized enforcement mechanism that the list page must respect.

---

## C5-TR-2 (MEDIUM, HIGH confidence) — API key hash divergence trace

**Trace:**
1. User creates API key via `POST /api/v1/admin/api-keys`
2. `src/lib/api/api-key-auth.ts:22` hashes with inline `createHash("sha256")`
3. Hash stored in DB
4. Later, `token-hash.ts` algorithm changes (hypothetical)
5. All recruiting tokens update because they use `hashToken()`
6. API key verification still uses old inline `createHash("sha256")` → BROKEN if algorithm changed

**Root cause:** Duplicated hash logic not using the shared module.

---

## No other suspicious data flows detected

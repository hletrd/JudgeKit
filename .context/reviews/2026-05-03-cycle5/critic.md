# Critic Review — Cycle 5 (2026-05-03)

**HEAD reviewed:** `eb4429a5`

---

## C5-CRIT-1 (HIGH, HIGH confidence) — Guest compileOutput exposure is the most critical actionable finding this cycle

The `compileOutput` leak (C5-CR-1/C5-SEC-1) is a genuine information disclosure. Compiler errors in many languages include variable names, function signatures, and even inline source snippets. The per-detail-page correctly nulls it for non-owners, but the list page does not. This inconsistency suggests the list-page query was written before the visibility model was fully thought through, and the detail page was fixed in isolation.

**Recommendation:** Fix this cycle. It is a security finding that directly contradicts the intent of the visibility system.

---

## C5-CRIT-2 (MEDIUM, MEDIUM confidence) — Inconsistent visibility model between list and detail views for public submissions

**File:** `src/app/(public)/submissions/page.tsx` vs `src/app/(public)/submissions/[id]/page.tsx`

The list page selects raw DB fields and renders them directly, while the detail page uses `isOwner` checks and nulls sensitive fields. This architectural inconsistency means every new field added to the submissions query is at risk of being exposed to guests through the list page. The `sanitizeSubmissionForViewer` function in `visibility.ts` exists but is not used by the list page.

**Recommendation:** The list page should use a similar sanitization step. At minimum, establish a convention that the list page query explicitly lists safe fields or applies the existing sanitizer.

---

## C5-CRIT-3 (MEDIUM, HIGH confidence) — `_sys.` namespace should be enforced at the Zod schema level

While the runtime check works, it is fragile — a future developer adding a new code path that handles `metadata` might forget to call `findInternalKeyViolation()`. Zod-level enforcement would catch this at the API boundary regardless of the code path.

---

## C5-CRIT-4 (LOW, MEDIUM confidence) — `getPeriodStart` timezone sensitivity

The function uses `new Date(now).setHours(0, 0, 0, 0)` which is timezone-dependent. If `getDbNow()` returns a UTC Date and the server is in a non-UTC timezone, the period boundary will be wrong. Most production deployments run in UTC, but this is a latent correctness bug.

---

## Positive observations

- The `_sys.` namespace bypass fix (cycle 4) is correctly implemented with both runtime guard and error handling in the PATCH route.
- The shared `hashToken` module consolidation is complete for the recruiting paths.
- The `sql.raw` safety documentation is clear and prevents false-positive security reviews.
- The recruiting context ALS cache is well-documented with single-user constraint clearly called out.

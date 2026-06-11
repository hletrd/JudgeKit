# Critic — RPF Cycle 5/100

**Date:** 2026-04-26
**Lens:** multi-perspective critique; what's missing, over-engineered, or assumed-invisible.

---

## CRIT5-1: [HIGH, actionable, NEW] Deploy script's "[OK] Database migrated" is reported even when drizzle-kit push errors interactively

**Severity:** HIGH (operational visibility)
**Confidence:** HIGH (orchestrator note from cycle 4 documents this exact behavior)

**Evidence:**
- `deploy-docker.sh:564-566`:
  ```sh
  sh -c '... npx drizzle-kit push'" 2>&1 || \
    die "drizzle-kit push failed — aborting deploy"
  success "Database migrated"
  ```
- The orchestrator note for cycle 5: "Deploy still proceeded via the additive `[OK] Database migrated` path" despite the data-loss warning.
- This means drizzle-kit push exits 0 even when its data-loss prompt was unanswered and the destructive change was NOT applied.

**Why it's a problem:** Operators see "Database migrated" in the log but the schema didn't change. Future drift compounds silently. This is exactly the kind of failure that causes a 3am page when production breaks for non-obvious reasons.

**Fix:**
1. Capture drizzle-kit push output, scan for "data loss" / "Are you sure" / unanswered prompt, and downgrade the success log to a warning when detected:
   ```sh
   PUSH_OUT=$(remote "... npx drizzle-kit push" 2>&1) || die "..."
   if grep -qi "data loss\|are you sure" <<<"$PUSH_OUT"; then
     warn "drizzle-kit push detected destructive change but did not apply it (interactive prompt). Manual intervention required."
   else
     success "Database migrated"
   fi
   ```
2. Or switch to `drizzle-kit migrate` (see ARCH5-1) which has no interactive prompt.

**Exit criteria:** A deploy that hits the data-loss prompt does NOT print `[OK] Database migrated`. The deploy log surfaces the actual drizzle-kit message that triggered the prompt.

---

## CRIT5-2: [MEDIUM, actionable, NEW] Workspace-to-public migration is "high priority" but the per-cycle remediation loop has surfaced zero migration findings since cycle 2

**Severity:** MEDIUM (process / prioritization)
**Confidence:** MEDIUM

**Evidence:**
- `user-injected/workspace-to-public-migration.md` is flagged HIGH priority, ongoing.
- `src/components/layout/app-sidebar.tsx:55-59` already documents that "All non-admin navigation ... is now in the PublicHeader dropdown. The sidebar only renders for users with admin capabilities and contains only admin-specific items."
- The migration appears largely **done** — sidebar is admin-only, public dropdown carries the rest.
- The user-injected doc still lists "Problems / Submissions / Compiler/Playground / Contests" as "evaluate unifying," but the actual code has done the unification (`public-nav.ts:61-70` exposes Dashboard/Problems/Problem-Sets/Groups/My-Submissions/Contests/Profile/Admin in the dropdown).

**Why it's a problem:** The user-injected directive's "current state" section is stale. The migration loop is asked to "make progress where the review surfaces a relevant opportunity" — but if the actual state is "mostly done," the directive should reflect that, or the per-cycle review wastes attention on a phantom backlog.

**Fix:** Update `user-injected/workspace-to-public-migration.md`:
- Mark the "non-admin nav items removed from sidebar" milestone as DONE with citation `src/components/layout/app-sidebar.tsx:55-59`.
- Update "Current State" to reflect that the public dropdown carries Dashboard/Problems/Problem-Sets/Groups/My-Submissions/Contests/Profile/Admin (per `public-nav.ts:61-70`).
- Identify SPECIFIC remaining migration candidates, or close the directive.

**Exit criteria:** The directive accurately reflects what is and isn't done; per-cycle reviews can identify real residual work or close the directive.

---

## CRIT5-3: [LOW, NEW] Cycle 4 plan claimed `__test_internals` would be `undefined` outside test, but the actual implementation casts to the type

**Severity:** LOW
**Confidence:** HIGH

**Evidence:** Cycle 4 plan (`plans/open/2026-04-27-rpf-cycle-4-review-remediation.md` Task A) says:
> Production builds (`NODE_ENV=production`) have `__test_internals === undefined`.

The actual fix (`route.ts:113-118`) writes `(undefined as unknown as <typeof methods>)`. Runtime IS undefined, but the TYPE is not. The cycle-4 verifier's exit criterion was met (runtime undefined), but the spirit ("don't let production code accidentally call this") is undermined by the type cast — see ARCH5-2.

**Fix:** Adopt ARCH5-2's recommendation. Plan intent and implementation type then converge.

---

## CRIT5-4: [LOW, NEW] Plans directory `plans/open/` has stale entries from prior cycles

**Severity:** LOW
**Confidence:** HIGH

**Evidence:** `git status` shows:
- `D plans/open/2026-04-23-rpf-cycle-48-review-remediation.md`
- `D plans/open/2026-04-25-rpf-cycle-47-review-remediation.md`
- `?? plans/open/2026-04-25-rpf-cycle-48-review-remediation.md`
- `?? plans/open/_archive/2026-04-23-rpf-cycle-48-review-remediation.md`
- `?? plans/open/_archive/2026-04-25-rpf-cycle-47-review-remediation.md`

These untracked moves should be committed; the working tree shouldn't have orphaned plan files between cycles.

**Fix:** Commit the archive moves (or revert them). Per `plans/open/README.md`, the canonical archive is `plans/done/` — but the moves above land in `plans/open/_archive/`. Verify and pick one convention.

**Exit criteria:** Working tree clean of orphaned plan files; archive convention applied consistently.

---

## Final Sweep

- The two cycle-5 NEW findings (ARCH5-1 + SEC5-1 = same root cause; CRIT5-1 = deploy log lying about it) form a single "deploy + migration honesty" cluster — the highest-signal item this cycle.
- The workspace-to-public migration directive needs a freshness pass.
- All gates green: lint, test:unit, build.

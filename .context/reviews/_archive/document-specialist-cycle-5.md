# Document Specialist — RPF Cycle 5/100

**Date:** 2026-04-26
**Lens:** documentation accuracy, code/doc mismatches, plan hygiene

---

## DOC5-1: [MEDIUM, actionable, NEW] `user-injected/workspace-to-public-migration.md` is stale relative to actual code state

**Severity:** MEDIUM (process — the directive drives per-cycle migration attention)
**Confidence:** HIGH

**Evidence:**
- The directive's "Current State" lists Sidebar items as if non-admin pages were still there.
- Actual code: `src/components/layout/app-sidebar.tsx:55-59` says: "Non-admin nav items have been removed from the sidebar. All non-admin navigation ... is now in the PublicHeader dropdown."
- Actual code: `src/lib/navigation/public-nav.ts:61-70` exposes Dashboard/Problems/Problem-Sets/Groups/My-Submissions/Contests/Profile/Admin in the dropdown.

**Why it's a problem:** Reviewers reading the directive each cycle will plan migration work that's already done, wasting cycle attention.

**Fix:** Update the directive (see CRIT5-2 details).

---

## DOC5-2: [LOW, deferred-carry] AGENTS.md vs `password.ts` mismatch (carried from cycles 3-4)

Same as SEC5-3. Reason for deferral: requires user/PM decision.

---

## DOC5-3: [LOW, actionable, NEW] `deploy-docker.sh:547,553-554,565-566` says "drizzle-kit push" but the broader system has `0020_drop_judge_workers_secret_token.sql` which IS a migrate-style file

**Severity:** LOW
**Confidence:** HIGH

**Evidence:**
- `deploy-docker.sh:547` log: "Running database migrations (drizzle-kit push)..."
- `deploy-docker.sh:553-554` comment: "Run drizzle-kit push via a temporary Node container ..."
- BUT there ARE journaled migrations in `drizzle/pg/*.sql`. `package.json:14-15` exposes both `db:push` (drizzle-kit push) and `db:generate` (drizzle-kit generate) but NOT `db:migrate`.

**Why it's a problem:** The deploy script's choice of `push` over `migrate` is a hidden architectural decision — there's no comment explaining WHY push was chosen. This makes ARCH5-1's fix harder to reason about: a maintainer might "fix" by adding `db:migrate` not realizing push was intentional (or vice versa).

**Fix:** Add a short comment at `deploy-docker.sh:547` explaining the choice:
```sh
# We use `drizzle-kit push` (schema-vs-DB diff) instead of `drizzle-kit migrate`
# (apply numbered SQL files) because [historical reason]. Destructive changes
# require manual intervention or `--force`.
```
Or change the strategy to migrate (per ARCH5-1) and update the comment to match.

**Exit criteria:** The script's choice of strategy is documented in-place.

---

## DOC5-4: [LOW, deferred-carry] Privacy notice has no decline path (carried from DES3-1)

Already-deferred cosmetic / UX-legal judgment call.

---

## Final Sweep

- The cycle-4 plan archive question (CRIT5-4) has a documentation angle: `plans/open/README.md` says archive convention is `plans/done/`, but the working tree shows moves to `plans/open/_archive/`. Pick one.
- All gates green; documentation drift is the main signal this cycle.

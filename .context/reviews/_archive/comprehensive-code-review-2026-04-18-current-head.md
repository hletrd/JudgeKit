# Comprehensive code review — 2026-04-18 current HEAD

## Scope and inventory

I first built a repository inventory from tracked files and reviewed every **review-relevant** tracked area:

- `src/` — 560 files
  - `src/app/` — 275
  - `src/components/` — 96
  - `src/lib/` — 175
- `tests/` — 401 files
- `docs/` — 24 files
- `scripts/` — 35 files
- `docker/` — 106 files
- `judge-worker-rs/` — 13 files
- `rate-limiter-rs/` — 9 files
- `code-similarity-rs/` — 6 files
- `drizzle/` — 70 files
- `messages/`, `.github/`, root deploy/compose files, `README.md`, `AGENTS.md`

Excluded as **not review-relevant** for this pass:
- `node_modules/`, coverage output, build artifacts, `.next/`, `.omc/`, `.omx/`
- binary/static assets where no code logic lives
- untracked local scratch files (for example `add-stress-tests.mjs`, `dedup-problems.mjs`, etc.), because they are not part of the tracked repository state

## Method

I used a repo-wide pass plus targeted cross-file sweeps for:
- auth/capability enforcement
- dashboard routing and capability-driven UI
- admin/server-action parity
- profile and user-management flows
- recruiting/candidate isolation
- problem-set visibility
- deployment/docs/runtime consistency
- test health and inventory drift

## Verification evidence gathered

- `npx tsc --noEmit` ✅
- `npx vitest run` ❌
  - 266 test files ran
  - 1866 tests passed
  - 1 test failed:
    - `tests/unit/infra/source-grep-inventory.test.ts` (`DOCUMENTED_BASELINE` stale: expected `111`, actual `112`)
- `cd judge-worker-rs && cargo test` ✅ `54` tests passed

## Findings summary

- **Confirmed issues:** 6
- **Likely issues:** 1
- **Risks needing manual validation:** 1

---

## Confirmed issues

### 1. Group-scoped assistants can currently read the global user directory
**Confidence:** High  
**Category:** Authorization / privacy / least privilege

**Files / regions**
- `src/lib/capabilities/defaults.ts:15-25`
- `src/app/(dashboard)/dashboard/page.tsx:24-35`
- `src/app/(dashboard)/dashboard/admin/users/page.tsx:56-118`
- `src/app/(dashboard)/dashboard/admin/users/[id]/page.tsx:23-64`

**Why this is a problem**
The built-in `assistant` capability set includes `users.view`. The dashboard shell treats **any** `users.view` capability as an admin-workspace signal. The users index/detail pages then grant access based on `users.view` alone, with no group scoping.

That means a role intended to be group-scoped (for example a TA/assistant) can browse platform-wide user records, including usernames, emails, class names, and role labels.

**Concrete failure scenario**
A TA assigned to one course section logs in. Because `assistant` includes `users.view`, the dashboard routes them into the admin shell. From there they can open `/dashboard/admin/users` and inspect all users across the system, not just users from their assigned groups.

**Suggested fix**
Split this into two capabilities/contracts:
- `users.view_all` for platform-wide directory access
- a scoped capability or helper for group-bound user visibility

At minimum:
- remove `users.view` from `ASSISTANT_CAPABILITIES`, **or**
- add group-scoped filtering to the users index/detail pages and routes
- add behavioural tests proving assistants/TAs cannot enumerate unrelated users

---

### 2. Profile editing relies on UI-only role gating; students can still change `className` server-side
**Confidence:** High  
**Category:** Authorization / invariant enforcement

**Files / regions**
- `src/app/(dashboard)/dashboard/profile/page.tsx:80-90`
- `src/app/(dashboard)/dashboard/profile/profile-form.tsx:63-76`
- `src/lib/actions/update-profile.ts:61-98`

**Why this is a problem**
The page decides whether the class-name field is editable using a built-in role check:
- `canEditClassName={session.user.role !== "student"}`

The form then omits `className` only when that boolean is false. But the server action `updateProfile(...)` accepts and writes `className` without enforcing the same rule.

So the real authorization boundary is in the UI, not in the mutation layer.

**Concrete failure scenario**
A student opens DevTools (or replays the server action request) and includes a `className` field manually. The server accepts it and updates the database even though the UI intended that field to be read-only for students.

**Suggested fix**
Move the rule into `updateProfile(...)`:
- derive a capability/rule server-side
- ignore or reject `className` updates when the actor lacks permission

Also replace the built-in role check with a capability- or policy-based decision so custom roles do not inherit arbitrary `role !== "student"` behavior.

---

### 3. The profile page still uses built-in-only role labels and will render blank/incorrect labels for assistant or custom roles
**Confidence:** High  
**Category:** UX correctness / role-model consistency

**Files / regions**
- `src/app/(dashboard)/dashboard/profile/page.tsx:30-35,63-68`

**Why this is a problem**
The profile page defines role labels only for:
- `student`
- `instructor`
- `admin`
- `super_admin`

There is no `assistant` label and no fallback to a role-record `displayName`. The rendered badge uses `roleLabels[session.user.role]` directly.

**Concrete failure scenario**
An `assistant` or custom-role user opens `/dashboard/profile` and sees an empty/incorrect role badge instead of a human-readable role label, even though other parts of user management already localize `assistant` and resolve custom role display names.

**Suggested fix**
Mirror the safer label strategy already used elsewhere:
- include `assistant` in built-in localized labels
- resolve custom-role display names from the `roles` table (or a shared helper)
- use a fallback chain like `builtinLabel ?? roleDisplayName ?? rawRole`

---

### 4. `AdminDashboard` computes system health even for roles that are not allowed to see it
**Confidence:** High  
**Category:** Performance / availability / privilege boundary leakage

**Files / regions**
- `src/app/(dashboard)/dashboard/_components/admin-dashboard.tsx:13-20`

**Why this is a problem**
`AdminDashboard` calls `getAdminHealthSnapshot()` unconditionally inside `Promise.all(...)`, then only later checks `canViewHealth` to decide whether to render the health card.

So low-scope admin roles that should not see health details still trigger the health query path and any worker/DB probing behind it.

**Concrete failure scenario**
A role with `users.view` but without `system.settings` lands on the admin shell. The page still performs the health snapshot work on every request. If the health helper is slow or throws, the low-scope role can experience admin-dashboard slowness or failure despite not being allowed to see the health data.

**Suggested fix**
Make the fetch conditional:
- compute `caps` / `canViewHealth` first
- only call `getAdminHealthSnapshot()` when `canViewHealth` is true
- otherwise skip the health fetch entirely

---

### 5. Bulk user creation aborts the entire request when one row requests a disallowed role
**Confidence:** Medium  
**Category:** Batch semantics / error handling / UX correctness

**Files / regions**
- `src/app/api/v1/users/bulk/route.ts:29-35`
- `src/app/api/v1/users/bulk/route.ts:116-157`

**Why this is a problem**
The route first validates role escalation for **every** row. If any row fails `validateRoleChangeAsync(...)`, the handler immediately returns `403` and creates **none** of the users.

That is inconsistent with the rest of the route, which is explicitly engineered for partial success via:
- per-row password preparation
- per-row savepoints
- `created[]` / `failed[]` reporting

**Concrete failure scenario**
An admin uploads a CSV with 199 valid student rows and 1 accidental `super_admin` row. Instead of creating the 199 valid users and reporting the one invalid row in `failed[]`, the endpoint returns `403` and creates no one.

**Suggested fix**
Treat role-escalation failures like other per-row failures:
- convert them into `failed[]` entries during preprocessing
- continue processing valid rows
- reserve request-level `403` only for the actor lacking `users.create`

**Why this is not marked High**
This may be an intentional policy choice, but it conflicts with the route’s otherwise clear partial-failure design.

---

### 6. Language-count documentation is inconsistent with the actual source of truth
**Confidence:** High  
**Category:** Documentation-code mismatch

**Files / regions**
- `src/lib/judge/languages.ts:199-1556` (current source of truth)
- `AGENTS.md:18-20`
- `README.md:272`
- `docs/languages.md:233-238` and the generated table ending at row `120`

**Why this is a problem**
The repository currently describes different totals for supported languages:
- `AGENTS.md` says **120**
- `README.md` says **124**
- `docs/languages.md` still ends at **120**
- `src/lib/judge/languages.ts` currently defines **125** language entries

**Concrete failure scenario**
Operators, contributors, and testers use the docs to validate coverage or deployment presets and get the wrong expected count. This is especially risky in a project where language coverage is a core product feature and sync scripts/tests depend on the canonical list.

**Suggested fix**
Generate the human-facing count from `src/lib/judge/languages.ts` (or from the same sync source that populates the DB), then refresh:
- `README.md`
- `docs/languages.md`
- any static guidance blocks in `AGENTS.md` / project docs

---

### 7. The full JS test suite is currently red because the source-grep baseline is stale
**Confidence:** High  
**Category:** Test health / maintenance

**Files / regions**
- `tests/unit/infra/source-grep-inventory.test.ts:80-86`

**Why this is a problem**
The full `npx vitest run` currently fails because:
- `DOCUMENTED_BASELINE = 111`
- actual `sourceGrepFiles.length = 112`

This means the repository’s own “full unit suite” gate is not green, even though most functional tests pass.

**Concrete failure scenario**
A contributor runs the full JS unit suite and gets a failure unrelated to product behavior. CI/release trust drops because the failure is effectively bookkeeping drift, not product regression.

**Suggested fix**
Do one of the following intentionally:
- update the documented baseline to the current count if the new source-grep test is intended, **or**
- convert the new test to a behavioural test and keep the baseline unchanged

Also add a short note in the review checklist or test-maintenance docs so future additions update the inventory gate intentionally.

---

## Likely issues

### 8. Admin-shell routing is now broad enough that read-only admin capabilities may get the wrong dashboard framing
**Confidence:** Medium  
**Category:** UX / authorization ergonomics

**Files / regions**
- `src/app/(dashboard)/dashboard/page.tsx:24-36`

**Why this is likely a problem**
The top-level dashboard now treats any of these capabilities as “admin workspace”:
- `users.view`
- `users.manage_roles`
- `system.audit_logs`
- `system.login_logs`
- `system.chat_logs`
- `system.plugins`
- `files.manage`
- `system.settings`

That is probably directionally correct for some scoped admin roles, but it also means the dashboard shell decision is doing UI composition from a mixed set of read-only and write-capable capabilities. Depending on product intent, some of those roles may be better served by a dedicated read-only ops shell or a role-specific landing page.

**Concrete failure scenario**
A narrowly scoped support role with only `system.chat_logs` lands on the full admin dashboard shell and sees an admin-centric landing experience, even though their actual work surface is just transcript review.

**Suggested fix**
Manually validate desired dashboard-shell mapping for:
- audit-only roles
- login-log-only roles
- chat-log-only roles
- files-only roles

If the current behavior is intentional, document it explicitly. If not, split “admin shell” routing from “admin capability exists” and route narrower roles to task-specific dashboards.

---

## Risks needing manual validation

### 9. Non-recruiting students can still view operational judge-system summaries; confirm whether that is product-intended
**Confidence:** Low  
**Category:** Information exposure / product policy

**Files / regions**
- `src/app/(dashboard)/dashboard/page.tsx:118-126`
- `src/app/(dashboard)/dashboard/_components/dashboard-judge-system-section.tsx:8-61`
- `src/app/(dashboard)/dashboard/languages/page.tsx:13-61`

**Why this needs manual validation**
The code now hides these surfaces from recruiting candidates, but **ordinary logged-in non-admin users** still receive:
- online worker count
- worker capacity
- active judge task count
- default limits
- full enabled language catalog

This may be intended transparency for coursework users, or it may be unnecessary ops exposure depending on deployment context.

**Concrete failure scenario**
A public classroom deployment unintentionally reveals operational capacity/worker details to students, which may be harmless in practice but could be considered over-sharing in a stricter environment.

**Suggested fix if this is not intended**
Gate the dashboard judge-system section and `/dashboard/languages` behind a dedicated capability or a stricter product-mode rule instead of exposing them to all authenticated non-recruiting users.

---

## Final sweep

I did one last sweep specifically for commonly missed issues:
- remaining built-in role-string checks in tracked runtime code
- page/action/route capability mismatches in admin surfaces
- dashboard shell routing vs. per-card visibility
- role-label rendering consistency across user/profile surfaces
- documentation-source-of-truth mismatches
- full-suite verification health (`tsc`, `vitest`, Rust worker tests)

### Final sweep result
- No additional **high-confidence** issues were found beyond the items above.
- The remaining built-in role checks in current runtime code are mostly concentrated in:
  - explicit `super_admin` protection logic in user management (appears intentional)
  - the profile page’s remaining built-in assumptions (already captured above)
- The most important unresolved risks are still:
  1. global user-directory exposure via `assistant` / `users.view`
  2. server-side profile authorization gap for `className`
  3. stale full-suite test inventory baseline

## Bottom line

The repository is in substantially better shape than many historical review snapshots suggest, and the Rust worker test surface is healthy. The highest-risk current issue is **platform-wide user-directory exposure for assistant/scoped roles**. The most obvious correctness gap is the **UI-only class-name edit restriction on profile updates**. The most obvious repo-health issue is that the **full JS unit suite is currently red because the source-grep baseline test was not updated intentionally**.

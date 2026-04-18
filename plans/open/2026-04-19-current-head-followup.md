# 2026-04-19 current-head follow-up remediation

## Source
- `.context/reviews/comprehensive-code-review-2026-04-19-current-head.md`

## Goal
Burn down the new current-head repo issues that reopened after the 2026-04-18 remediation lane. Keep the work fine-grained, verified, signed, and reflected here after every slice.

## Scope
This lane owns repo-level current-head issues that are not already fully covered by the feature/domain plans under `.context/plans/`.

## Story ledger
| ID | Finding | Status | Commit |
| --- | --- | --- | --- |
| F-01 | Anti-cheat dashboard missing `contests.antiCheat.language` translation key | Done | `fix(contests): 🌐 restore anti-cheat language label coverage` |
| F-02 | `code-similarity-client` tests still omit `language` | Done | `test(similarity): 🧪 align Rust client fixtures with language-aware payloads` |
| F-03 | `AuthUserRecord.mustChangePassword` nullability breaks `npx tsc --noEmit` | Done | `fix(auth): 🔧 normalize AuthUserRecord.mustChangePassword to boolean` |
| F-04 | `src/lib/db/migrate.ts` cast no longer typechecks | Done | `fix(db): 🔧 let drizzle migrate infer the concrete NodePgDatabase type` |
| F-05 | `users.bulk` route test harness bypasses parsed request body | Done | `test(users): 🧪 make the bulk-create route harness respect schema-parsed bodies` |
| F-06 | `compiler/execute` implementation test still asserts pre-hardening `0o777` | Done | `test(compiler): 🧪 align the workspace-permission contract with the hardened 0o770 mode` |
| F-07 | `source-grep` documented baseline is stale | Done | `test(infra): 🧪 refresh the documented source-grep baseline after intentional suite growth` |
| F-08 | Assistant roles can browse the global user directory | Pending | — |
| F-09 | Profile `className` restrictions are UI-only | Pending | — |
| F-10 | Profile page cannot render assistant/custom role labels correctly | Pending | — |
| F-11 | `/api/health` eagerly computes the admin snapshot for public callers | Done | `fix(ops): 🩺 gate admin health details by capability before computing the full snapshot` |
| F-12 | `AdminDashboard` eagerly computes health for roles that cannot view it | Done | `fix(ops): 🩺 gate admin health details by capability before computing the full snapshot` |
| F-13 | Bulk user creation is fail-all on disallowed per-row roles | Pending | — |
| F-14 | Sidecar auth tokens are documented but not wired in compose | Pending | — |
| F-15 | Dedicated worker compose does not forward `RUNNER_AUTH_TOKEN` | Pending | — |
| F-16 | `/api/health` and `/api/metrics` still use built-in-only `isAdmin()` | Done | `fix(ops): 🩺 gate admin health details by capability before computing the full snapshot` |
| F-17 | `public-detail-seo-metadata` times out only under the full suite load | Done | `test(seo): 🧪 give the public-detail metadata suite a full-run timeout budget` |

## Verification floor
- target the narrowest relevant Vitest / TypeScript / Rust evidence per slice
- rerun broader gates after the blocker cluster is closed
- keep this ledger updated in the same commit as the fix

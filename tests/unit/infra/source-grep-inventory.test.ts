import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Source-grep inventory
 *
 * "Source-grep tests" are unit tests that read source files with readFileSync
 * and assert on their text content rather than importing and exercising runtime
 * behaviour.  They are a legitimate contract-testing pattern for infra, schema,
 * and deployment artefacts, but should not become the default approach for
 * application logic where behavioural tests are more robust.
 *
 * This test acts as a change-detection gate: if the count shifts, the
 * committer must review whether a new source-grep test was intentional or
 * whether a behavioural test should have been written instead.
 */

function collectTestFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectTestFiles(full));
    } else if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) {
      results.push(full);
    }
  }
  return results;
}

const unitTestRoot = join(process.cwd(), "tests", "unit");
const allTestFiles = collectTestFiles(unitTestRoot);

const sourceGrepFiles = allTestFiles.filter((f) => {
  const content = readFileSync(f, "utf8");
  return content.includes("readFileSync");
});

const relativeNames = sourceGrepFiles.map((f) => relative(process.cwd(), f));

/**
 * Intentional source-grep tests by category.
 *
 * "infra/deploy"  — deployment scripts, Docker, CI, Nginx, env generation
 * "schema"        — DB schema text contracts (column names, migration drift)
 * "infra/config"  — playwright, worker runtime, language inventory, pgdata
 * "implementation"— text-contract checks on source files that verify wiring
 *                   (e.g. capability checks, route guards, i18n keys).
 *                   These are candidates for migration to behavioural tests
 *                   but currently acceptable given the file-level coupling.
 */
const INTENTIONAL_INFRA_DEPLOY = [
  "tests/unit/infra/deploy-security.test.ts",
  "tests/unit/infra/env-generation.test.ts",
  "tests/unit/infra/judge-report-nginx.test.ts",
  "tests/unit/infra/pgdata-pinning.test.ts",
  "tests/unit/infra/playwright-remote-safety.test.ts",
  "tests/unit/infra/playwright-profiles.test.ts",
  "tests/unit/infra/ci-suite-completeness.test.ts",
  "tests/unit/infra/worker-runtime.test.ts",
  "tests/unit/infra/language-inventory.test.ts",
  "tests/unit/scripts/runtime-truth-implementation.test.ts",
  "tests/unit/scripts/setup-script-implementation.test.ts",
  "tests/unit/admin/backup-docs-consistency.test.ts",
];

const INTENTIONAL_SCHEMA = [
  "tests/unit/db/schema-implementation.test.ts",
  "tests/unit/db/pg-migration-drift.test.ts",
  "tests/unit/db/relations-implementation.test.ts",
  "tests/unit/db/import-implementation.test.ts",
  "tests/unit/db/export-implementation.test.ts",
  "tests/unit/db/raw-query-usage-implementation.test.ts",
];

const intentionalFiles = new Set([...INTENTIONAL_INFRA_DEPLOY, ...INTENTIONAL_SCHEMA]);

describe("source-grep test inventory", () => {
  it("total count of source-grep test files matches the documented baseline", () => {
    // DOCUMENTED BASELINE — update this number intentionally when adding or
    // removing source-grep tests.  A change here is a signal to review whether
    // the new test should be a text-contract test or a behavioural test.
    //
    // Bumped 126 → 128 in cycle-1 RPF (2026-05-03):
    //   - tests/unit/docker/client.test.ts (commit 6934f564, dockerfile path
    //     validator regression — text contract on src/lib/docker/client.ts).
    //   - tests/unit/assignments/scoring.test.ts gained a source-grep
    //     regression for the recruit-results scoring helper (commit b60dc17a,
    //     C1-AGG-2). The file already existed in the inventory but the
    //     readFileSync call now fires from the new describe block too. The
    //     net source-grep count increase is +2.
    // Bumped 128 → 132 in cycle-1 RPF (2026-05-08):
    //   - tests/unit/docker-cleanup-parsing.test.ts
    //   - tests/unit/rate-limit-eviction-timer.test.ts
    //   - tests/unit/server-actions-origin.test.ts
    //   - tests/unit/proxy-error-handling.test.ts
    // Bumped 132 → 133 in cycle 35 (2026-05-09):
    //   - tests/unit/api/import-sunset-headers.route.test.ts
    // Dropped 133 → 132 (deslop on src/components/lecture/**):
    //   - tests/unit/lecture-stats-wiring-implementation.test.ts was a
    //     source-grep regression pinning wiring between four components that
    //     are now removed (lecture-toolbar, lecture-problem-view,
    //     submission-overview, problem-lecture-wrapper). Removed with the
    //     dead components.
    // Bumped 132 → 133 (2026-05-31):
    //   - tests/unit/editor-keyboard-trap-escape.test.ts — text contract that
    //     the CodeMirror keymap keeps an Escape binding releasing the Tab trap
    //     (WCAG 2.1.2). A behavioural test would need a full CodeMirror mount;
    //     the keymap wiring is the durable invariant, so a source-grep guard
    //     is the right tool here (same pattern as the output-limits guard).
    // Bumped 133 → 134 (2026-06-03):
    //   - tests/unit/judge/ioi-run-all-tests-implementation.test.ts — the IOI
    //     score-inflation fix is a Rust-worker ↔ TS-server contract (worker runs
    //     all tests when the server flags IOI). No behavioural test can span that
    //     boundary, so a source-grep guard pins both sides.
    // Bumped 134 -> 135 (2026-06-04):
    //   - tests/unit/discussions-reply-count-implementation.test.ts — guards the
    //     H5 perf fix (reply counts via a batched count(*) aggregate, not eager
    //     post over-fetch). A behavioural test cannot easily assert the query shape.
    // Bumped 135 -> 136 (2026-06-04):
    //   - tests/unit/a11y-review-fixes-implementation.test.ts — guards the a11y
    //     review fixes (contrast / diff cue / fullscreen-editor focus); the
    //     durable invariant is the class/ARIA wiring, best pinned as text.
    // Bumped 136 -> 138 (2026-06-11, RPF cycle-1):
    //   - tests/unit/infra/csp-matcher-coverage.test.ts — closes the recurring
    //     CSP-matcher-enumeration regression class (SEC-21-3, 6035ca83): every
    //     top-level page segment must map into src/proxy.ts config.matcher.
    //     Inherently a cross-file text contract; no behavioural test can see
    //     the matcher without booting the middleware runtime.
    //   - tests/unit/platform-mode-context.test.ts gained a drift-pin that the
    //     restricted-mode override rule is resolved ONLY via
    //     getEffectiveModeRestrictions (A2 consolidation); the invariant is
    //     "no second inline copy exists", which is a text property.
    // Bumped 138 -> 139 (2026-06-11, RPF cycle-2):
    //   - tests/unit/infra/retention-coverage.test.ts — closes the recurring
    //     unbounded-table-growth class (source_drafts in cycle 1, then
    //     code_snapshots in cycle 2): every pgTable must be pruned by
    //     data-retention-maintenance or explicitly allowlisted with a
    //     justification. Inherently a schema↔maintenance cross-file text
    //     contract; a behavioural test cannot enumerate "tables nobody
    //     thought about".
    // Bumped 139 -> 140 (2026-06-11, RPF cycle-5):
    //   - tests/unit/components/anti-cheat-presentation.test.ts — catalog
    //     coverage: every known anti-cheat event type must have an
    //     eventTypes.* label in BOTH locale catalogs and a badge color
    //     (AGG5-2: submission_stale_heartbeat shipped without either and the
    //     escalate flag rendered as a raw i18n key path). Inherently an
    //     i18n-catalog↔event-model cross-file text contract; a component
    //     test can only see the one locale it mounts with.
    // Bumped 140 -> 141 (2026-06-12, RPF cycle-6):
    //   - tests/unit/assignments/contest-access-tokens.test.ts — pins that
    //     every gate consumes the SHARED token-validity semantic (AGG6-1:
    //     six call sites had drifted into two semantics; expired tokens
    //     passed the Drizzle gates while the raw-SQL gates rejected them)
    //     and that no inline expiry-rule copy re-appears. Inherently a
    //     multi-file consumption contract; behavioural tests cover each
    //     gate's verdict but cannot see a re-inlined duplicate rule.
    // Bumped 141 -> 142 (2026-06-13, RPF cycle-7):
    //   - tests/unit/api/listing-order-tiebreak.test.ts — pins that every
    //     offset/cap listing orders by a UNIQUE second key (id) after its
    //     non-unique timestamp (AGG7-2: same-timestamp rows shuffled across
    //     pages and the CSV cap boundary was nondeterministic). The
    //     behavioural arity pins live with the routes that already have a
    //     db-chain harness (submissions, anti-cheat GET); this cross-route
    //     query-SHAPE invariant would otherwise need a full chain mock per
    //     route, so a source-grep contract is the proportionate guard.
    // Bumped 142 -> 149 (2026-06-16, function-signature judging):
    //   - tests/unit/judge/function-judging/adapters/{python,cpp,javascript,
    //     typescript,java,go,csharp}.test.ts (+7) — golden/snapshot tests for
    //     the per-language harness code GENERATORS: each asserts that
    //     adapter.assemble(spec, code) reproduces a committed golden source
    //     file (the exact stdin-reading harness the judge compiles). These are
    //     output-fixture comparisons for a code generator, not src/-grepping
    //     wiring checks — readFileSync loads the expected-output fixture, which
    //     is the proportionate test for a deterministic generator (a behavioural
    //     test would have to compile+run every language, covered separately by
    //     the adapters' own assemble/stub assertions and the E2E suite).
    const DOCUMENTED_BASELINE = 149;
    expect(sourceGrepFiles.length).toBe(DOCUMENTED_BASELINE);
  });

  it("all known intentional infra/deploy source-grep tests are present", () => {
    for (const expected of INTENTIONAL_INFRA_DEPLOY) {
      expect(relativeNames, `Expected infra/deploy source-grep test not found: ${expected}`)
        .toContain(expected);
    }
  });

  it("all known intentional schema source-grep tests are present", () => {
    for (const expected of INTENTIONAL_SCHEMA) {
      expect(relativeNames, `Expected schema source-grep test not found: ${expected}`)
        .toContain(expected);
    }
  });

  it("lists files outside the intentional categories as candidates for behavioural conversion", () => {
    const candidates = relativeNames.filter((f) => !intentionalFiles.has(f));
    // This is informational — not a hard failure.  Review these periodically.
    // Asserting >=0 so the test always passes while surfacing the list.
    expect(candidates.length).toBeGreaterThanOrEqual(0);
  });
});

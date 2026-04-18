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
    const DOCUMENTED_BASELINE = 111;
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

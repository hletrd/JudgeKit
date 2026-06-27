import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * AGG-41: the audit-logs instructor-scope branch must use correlated EXISTS
 * subqueries rather than the prior 4-round-trip `findMany` fan-out + wide
 * `IN (id, ...)` arrays. The mock architecture of route-level tests bypasses
 * SQL, so a source-grep contract is the realistic revert-RED guard: a future
 * refactor that re-introduces the IN-array fan-out (or drops the EXISTS scope)
 * flips this red.
 */
describe("audit-logs instructor scope: EXISTS subqueries (AGG-41)", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/api/v1/admin/audit-logs/route.ts"),
    "utf8",
  );

  it("builds instructor scopes as correlated EXISTS subqueries", () => {
    // Each of the 4 FK-based scopes is an EXISTS against its resource table.
    expect(source).toMatch(/EXISTS\s*\(SELECT 1 FROM\s+\$\{groups\}/);
    expect(source).toMatch(/EXISTS\s*\(SELECT 1 FROM\s+\$\{assignments\}/);
    expect(source).toMatch(/EXISTS\s*\(SELECT 1 FROM\s+\$\{submissions\}/);
    expect(source).toMatch(/EXISTS\s*\(SELECT 1 FROM\s+\$\{problems\}/);
  });

  it("does NOT fan out to per-resource findMany + IN-array scope filters", () => {
    // The old form built `inArray(auditEvents.resourceId, <array>)` per scope
    // from preparatory findMany calls. After AGG-41 the only IN-array scope is
    // the group_member JSONB lookup (buildGroupMemberScopeFilter); the
    // resource-id IN-arrays must be gone.
    expect(source).not.toMatch(/inArray\(auditEvents\.resourceId/);
    // The 4 preparatory per-resource findMany fetches are gone (only the
    // taught-groups fetch remains, for the JSONB member scope).
    expect(source).not.toMatch(/db\.query\.assignments\.findMany/);
    expect(source).not.toMatch(/db\.query\.submissions\.findMany/);
    expect(source).not.toMatch(/db\.query\.problems\.findMany/);
  });

  it("emits the instructor scope filter unconditionally (fail-closed for empty-scope instructor)", () => {
    // The 4 EXISTS predicates are pushed without `length > 0` guards so an
    // instructor who owns nothing resolves to OR(false, ...) → sees nothing.
    // A revert that re-introduces `if (groupIds.length > 0)` gating around the
    // whole block (letting an empty-scope instructor see every event) flips red.
    expect(source).toMatch(/const scopedInstructorFilter = or\(\.\.\.scopeFilters\)/);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression test for the time-route DB-time bug class (cycle 7 close-out).
 *
 * The /api/v1/time endpoint must use DB server time (getDbNowMs) instead of
 * Date.now(), because the client uses this endpoint to synchronize the exam
 * countdown timer with the server. Server-side deadline enforcement uses DB
 * time (NOW() in SQL), so the client's clock-sync source must also be DB time
 * to avoid a frustrating "submission rejected with time remaining" UX bug
 * when the app server clock drifts from the DB server clock.
 *
 * Additionally, the route must export `dynamic = "force-dynamic"` to prevent
 * Next.js from serving cached (stale) timestamps.
 *
 * This test verifies the source code uses the correct DB-time function and
 * the correct dynamic-rendering directive. It is a source-level regression
 * test (does not require a Postgres harness) so it runs under DEFER-ENV-GATES.
 */
describe("time route DB-time usage", () => {
  const filePath = join(process.cwd(), "src/app/api/v1/time/route.ts");

  it("imports getDbNowMs from @/lib/db-time", () => {
    const source = readFileSync(filePath, "utf8");

    expect(
      source,
      "time route must import getDbNowMs from @/lib/db-time"
    ).toMatch(/import\s*\{[^}]*\bgetDbNowMs\b[^}]*\}\s*from\s*["']@\/lib\/db-time["']/);
  });

  it("uses getDbNowMs (not Date.now()) in the GET handler", () => {
    const source = readFileSync(filePath, "utf8");

    // Locate the exported GET handler block. Accept arrow or async function form.
    const getHandlerMatch = source.match(
      /export\s+async\s+function\s+GET\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/
    );

    expect(getHandlerMatch, "GET handler must be exported as an async function").not.toBeNull();
    const handlerBody = getHandlerMatch?.[1] ?? "";

    // Must reference getDbNowMs and must NOT reference Date.now().
    expect(
      handlerBody,
      "GET handler must call getDbNowMs() to return DB server time"
    ).toMatch(/\bgetDbNowMs\s*\(\s*\)/);

    expect(
      handlerBody,
      "GET handler must NOT use Date.now() (would reintroduce app-server clock-skew bug class)"
    ).not.toMatch(/\bDate\.now\s*\(\s*\)/);
  });

  it("exports dynamic = \"force-dynamic\" to prevent Next.js cache from serving stale timestamps", () => {
    const source = readFileSync(filePath, "utf8");

    expect(
      source,
      'time route must export `dynamic = "force-dynamic"` to prevent Next.js cache from serving stale timestamps'
    ).toMatch(/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
  });
});

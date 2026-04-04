import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, hasPostgresIntegrationSupport, seedUser, type TestDb } from "../support";
import { eq, sql } from "drizzle-orm";
import { users } from "@/lib/db/schema";

describe.skipIf(!hasPostgresIntegrationSupport)("Integration DB health check", () => {
  let ctx: TestDb;

  beforeEach(async () => {
    ctx = await createTestDb();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("creates an isolated PostgreSQL schema with all tables", async () => {
    const result = await ctx.client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name NOT LIKE '__drizzle%'
       ORDER BY table_name`,
    );

    const tableNames = result.rows.map((t) => t.table_name as string);

    expect(tableNames).toContain("users");
    expect(tableNames).toContain("problems");
    expect(tableNames).toContain("submissions");
    expect(tableNames).toContain("test_cases");
    expect(tableNames).toContain("groups");
    expect(tableNames).toContain("enrollments");
    expect(tableNames).toContain("assignments");
    expect(tableNames).toContain("assignment_problems");
    expect(tableNames).toContain("sessions");
    expect(tableNames).toContain("accounts");
    expect(tableNames).toContain("login_events");
    expect(tableNames).toContain("audit_events");
    expect(tableNames).toContain("language_configs");
    expect(tableNames).toContain("system_settings");
    expect(tableNames).toContain("rate_limits");
    expect(tableNames).toContain("submission_results");
    expect(tableNames).toContain("submission_comments");
    expect(tableNames).toContain("score_overrides");
    expect(tableNames).toContain("problem_group_access");
  });

  it("supports basic insert and select via Drizzle", async () => {
    const seeded = await seedUser(ctx, { username: "healthcheck", name: "Health Check" });

    const found = await ctx.db
      .select()
      .from(users)
      .where(eq(users.id, seeded.id))
      .then((rows) => rows[0]);

    expect(found).toBeDefined();
    expect(found!.username).toBe("healthcheck");
    expect(found!.name).toBe("Health Check");
  });

  it("enforces foreign keys", async () => {
    await expect(
      ctx.client.query(
        "INSERT INTO sessions (session_token, user_id, expires) VALUES ($1, $2, $3)",
        ["tok-1", "nonexistent-user", new Date(Date.now() + 60_000)]
      )
    ).rejects.toThrow();
  });

  it("provides isolated databases per call", async () => {
    await seedUser(ctx, { username: "isolated" });

    const ctx2 = await createTestDb();
    try {
      const rows = await ctx2.db.select({ count: sql<number>`count(*)` }).from(users);
      expect(Number(rows[0]?.count ?? 0)).toBe(0);
    } finally {
      await ctx2.cleanup();
    }
  });
});

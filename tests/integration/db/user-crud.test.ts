import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestDb,
  hasPostgresIntegrationSupport,
  seedUser,
  seedGroup,
  seedEnrollment,
  type TestDb,
} from "../support";
import { users, groups, enrollments } from "@/lib/db/schema";
import { withUpdatedAt } from "@/lib/db/helpers";

describe.skipIf(!hasPostgresIntegrationSupport)("User CRUD (integration)", () => {
  let ctx: TestDb;

  beforeEach(async () => {
    ctx = await createTestDb();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe("create", () => {
    it("inserts a user with all default fields", async () => {
      const seeded = await seedUser(ctx, {
        username: "alice",
        name: "Alice",
        email: "alice@example.com",
        role: "student",
      });

      const row = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, seeded.id))
        .then((rows) => rows[0]);

      expect(row).toBeDefined();
      expect(row!.username).toBe("alice");
      expect(row!.name).toBe("Alice");
      expect(row!.email).toBe("alice@example.com");
      expect(row!.role).toBe("student");
      expect(row!.isActive).toBe(true);
      expect(row!.mustChangePassword).toBe(false);
    });

    it("inserts a user with admin role", async () => {
      const seeded = await seedUser(ctx, { username: "admin1", name: "Admin", role: "admin" });
      const row = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, seeded.id))
        .then((rows) => rows[0]);
      expect(row!.role).toBe("admin");
    });

    it("enforces unique username constraint", async () => {
      await seedUser(ctx, { username: "duplicate" });
      await expect(seedUser(ctx, { username: "duplicate" })).rejects.toThrow();
    });

    it("enforces unique email constraint", async () => {
      await seedUser(ctx, { username: "u1", email: "same@example.com" });
      await expect(seedUser(ctx, { username: "u2", email: "same@example.com" })).rejects.toThrow();
    });

    it("allows multiple users with null email", async () => {
      await seedUser(ctx, { username: "no-email-1", email: null });
      await seedUser(ctx, { username: "no-email-2", email: null });

      const rows = await ctx.db.select().from(users);
      expect(rows).toHaveLength(2);
    });
  });

  describe("read", () => {
    it("finds a user by username", async () => {
      await seedUser(ctx, { username: "findme", name: "Found" });

      const row = await ctx.db
        .select()
        .from(users)
        .where(eq(users.username, "findme"))
        .then((rows) => rows[0]);

      expect(row).toBeDefined();
      expect(row!.name).toBe("Found");
    });

    it("returns undefined for nonexistent user", async () => {
      const row = await ctx.db
        .select()
        .from(users)
        .where(eq(users.username, "ghost"))
        .then((rows) => rows[0]);

      expect(row).toBeUndefined();
    });

    it("lists all users", async () => {
      await seedUser(ctx, { username: "a" });
      await seedUser(ctx, { username: "b" });
      await seedUser(ctx, { username: "c" });

      const rows = await ctx.db.select().from(users);
      expect(rows).toHaveLength(3);
    });

    it("uses Drizzle relational query to find user with enrollments", async () => {
      const instructor = await seedUser(ctx, { username: "prof", role: "instructor" });
      const student = await seedUser(ctx, { username: "stu", role: "student" });
      const group = await seedGroup(ctx, { name: "CS101", instructorId: instructor.id });
      await seedEnrollment(ctx, { userId: student.id, groupId: group.id });

      const result = await ctx.db.query.users.findFirst({
        where: eq(users.id, student.id),
        with: { enrollments: true },
      });

      expect(result).toBeDefined();
      expect(result!.enrollments).toHaveLength(1);
      expect(result!.enrollments[0].groupId).toBe(group.id);
    });
  });

  describe("update", () => {
    it("updates user name", async () => {
      const seeded = await seedUser(ctx, { username: "original", name: "Original" });

      await ctx.db
        .update(users)
        .set(withUpdatedAt({ name: "Updated" }))
        .where(eq(users.id, seeded.id));

      const row = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, seeded.id))
        .then((rows) => rows[0]);

      expect(row!.name).toBe("Updated");
      expect(row!.updatedAt).toBeDefined();
    });

    it("updates user role", async () => {
      const seeded = await seedUser(ctx, { username: "promote", role: "student" });

      await ctx.db
        .update(users)
        .set(withUpdatedAt({ role: "instructor" }))
        .where(eq(users.id, seeded.id));

      const row = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, seeded.id))
        .then((rows) => rows[0]);

      expect(row!.role).toBe("instructor");
    });

    it("deactivates a user", async () => {
      const seeded = await seedUser(ctx, { username: "active-user", isActive: true });

      await ctx.db
        .update(users)
        .set(withUpdatedAt({ isActive: false }))
        .where(eq(users.id, seeded.id));

      const row = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, seeded.id))
        .then((rows) => rows[0]);

      expect(row!.isActive).toBe(false);
    });

    it("sets mustChangePassword flag", async () => {
      const seeded = await seedUser(ctx, { username: "pwchange" });

      await ctx.db
        .update(users)
        .set(withUpdatedAt({ mustChangePassword: true }))
        .where(eq(users.id, seeded.id));

      const row = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, seeded.id))
        .then((rows) => rows[0]);

      expect(row!.mustChangePassword).toBe(true);
    });
  });

  describe("delete", () => {
    it("deletes a user by id", async () => {
      const seeded = await seedUser(ctx, { username: "doomed" });

      await ctx.db.delete(users).where(eq(users.id, seeded.id));

      const row = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, seeded.id))
        .then((rows) => rows[0]);

      expect(row).toBeUndefined();
    });

    it("cascades deletion to enrollments", async () => {
      const student = await seedUser(ctx, { username: "enrolled-stu" });
      const group = await seedGroup(ctx, { name: "Cascade Group" });
      await seedEnrollment(ctx, { userId: student.id, groupId: group.id });

      const before = await ctx.db
        .select()
        .from(enrollments)
        .where(eq(enrollments.userId, student.id));
      expect(before).toHaveLength(1);

      await ctx.db.delete(users).where(eq(users.id, student.id));

      const after = await ctx.db
        .select()
        .from(enrollments)
        .where(eq(enrollments.userId, student.id));
      expect(after).toHaveLength(0);
    });

    it("sets null on group instructorId when instructor is deleted", async () => {
      const instructor = await seedUser(ctx, { username: "instr", role: "instructor" });
      const group = await seedGroup(ctx, { name: "Orphan Group", instructorId: instructor.id });

      await ctx.db.delete(users).where(eq(users.id, instructor.id));

      const row = await ctx.db
        .select()
        .from(groups)
        .where(eq(groups.id, group.id))
        .then((rows) => rows[0]);

      expect(row).toBeDefined();
      expect(row!.instructorId).toBeNull();
    });
  });
});

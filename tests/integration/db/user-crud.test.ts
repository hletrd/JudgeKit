import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { createTestDb, seedUser, seedGroup, seedEnrollment, type TestDb } from "../support";
import { users, groups, enrollments } from "@/lib/db/schema";
import { withUpdatedAt } from "@/lib/db/helpers";

describe("User CRUD (integration)", () => {
  let ctx: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  // ---------------------------------------------------------------------------
  // CREATE
  // ---------------------------------------------------------------------------

  describe("create", () => {
    it("inserts a user with all default fields", () => {
      const seeded = seedUser(ctx, {
        username: "alice",
        name: "Alice",
        email: "alice@example.com",
        role: "student",
      });

      const row = ctx.db.select().from(users).where(eq(users.id, seeded.id)).get();
      expect(row).toBeDefined();
      expect(row!.username).toBe("alice");
      expect(row!.name).toBe("Alice");
      expect(row!.email).toBe("alice@example.com");
      expect(row!.role).toBe("student");
      expect(row!.isActive).toBe(true);
      expect(row!.mustChangePassword).toBe(false);
    });

    it("inserts a user with admin role", () => {
      const seeded = seedUser(ctx, { username: "admin1", name: "Admin", role: "admin" });
      const row = ctx.db.select().from(users).where(eq(users.id, seeded.id)).get();
      expect(row!.role).toBe("admin");
    });

    it("enforces unique username constraint", () => {
      seedUser(ctx, { username: "duplicate" });
      expect(() => {
        seedUser(ctx, { username: "duplicate" });
      }).toThrow(/UNIQUE/);
    });

    it("enforces unique email constraint", () => {
      seedUser(ctx, { username: "u1", email: "same@example.com" });
      expect(() => {
        seedUser(ctx, { username: "u2", email: "same@example.com" });
      }).toThrow(/UNIQUE/);
    });

    it("allows multiple users with null email", () => {
      seedUser(ctx, { username: "no-email-1", email: null });
      seedUser(ctx, { username: "no-email-2", email: null });

      const rows = ctx.db.select().from(users).all();
      expect(rows).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // READ
  // ---------------------------------------------------------------------------

  describe("read", () => {
    it("finds a user by username", () => {
      seedUser(ctx, { username: "findme", name: "Found" });

      const row = ctx.db
        .select()
        .from(users)
        .where(eq(users.username, "findme"))
        .get();

      expect(row).toBeDefined();
      expect(row!.name).toBe("Found");
    });

    it("returns undefined for nonexistent user", () => {
      const row = ctx.db
        .select()
        .from(users)
        .where(eq(users.username, "ghost"))
        .get();

      expect(row).toBeUndefined();
    });

    it("lists all users", () => {
      seedUser(ctx, { username: "a" });
      seedUser(ctx, { username: "b" });
      seedUser(ctx, { username: "c" });

      const rows = ctx.db.select().from(users).all();
      expect(rows).toHaveLength(3);
    });

    it("uses Drizzle relational query to find user with enrollments", () => {
      const instructor = seedUser(ctx, { username: "prof", role: "instructor" });
      const student = seedUser(ctx, { username: "stu", role: "student" });
      const group = seedGroup(ctx, { name: "CS101", instructorId: instructor.id });
      seedEnrollment(ctx, { userId: student.id, groupId: group.id });

      const result = ctx.db.query.users.findFirst({
        where: eq(users.id, student.id),
        with: { enrollments: true },
      });

      expect(result).toBeDefined();
      expect(result!.enrollments).toHaveLength(1);
      expect(result!.enrollments[0].groupId).toBe(group.id);
    });
  });

  // ---------------------------------------------------------------------------
  // UPDATE
  // ---------------------------------------------------------------------------

  describe("update", () => {
    it("updates user name", () => {
      const seeded = seedUser(ctx, { username: "original", name: "Original" });

      ctx.db
        .update(users)
        .set(withUpdatedAt({ name: "Updated" }))
        .where(eq(users.id, seeded.id))
        .run();

      const row = ctx.db.select().from(users).where(eq(users.id, seeded.id)).get();
      expect(row!.name).toBe("Updated");
      // updatedAt should be refreshed (at least not null)
      expect(row!.updatedAt).toBeDefined();
    });

    it("updates user role", () => {
      const seeded = seedUser(ctx, { username: "promote", role: "student" });

      ctx.db
        .update(users)
        .set(withUpdatedAt({ role: "instructor" }))
        .where(eq(users.id, seeded.id))
        .run();

      const row = ctx.db.select().from(users).where(eq(users.id, seeded.id)).get();
      expect(row!.role).toBe("instructor");
    });

    it("deactivates a user", () => {
      const seeded = seedUser(ctx, { username: "active-user", isActive: true });

      ctx.db
        .update(users)
        .set(withUpdatedAt({ isActive: false }))
        .where(eq(users.id, seeded.id))
        .run();

      const row = ctx.db.select().from(users).where(eq(users.id, seeded.id)).get();
      expect(row!.isActive).toBe(false);
    });

    it("sets mustChangePassword flag", () => {
      const seeded = seedUser(ctx, { username: "pwchange" });

      ctx.db
        .update(users)
        .set(withUpdatedAt({ mustChangePassword: true }))
        .where(eq(users.id, seeded.id))
        .run();

      const row = ctx.db.select().from(users).where(eq(users.id, seeded.id)).get();
      expect(row!.mustChangePassword).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE
  // ---------------------------------------------------------------------------

  describe("delete", () => {
    it("deletes a user by id", () => {
      const seeded = seedUser(ctx, { username: "doomed" });

      ctx.db.delete(users).where(eq(users.id, seeded.id)).run();

      const row = ctx.db.select().from(users).where(eq(users.id, seeded.id)).get();
      expect(row).toBeUndefined();
    });

    it("cascades deletion to enrollments", () => {
      const student = seedUser(ctx, { username: "enrolled-stu" });
      const group = seedGroup(ctx, { name: "Cascade Group" });
      seedEnrollment(ctx, { userId: student.id, groupId: group.id });

      // Verify enrollment exists
      const before = ctx.db
        .select()
        .from(enrollments)
        .where(eq(enrollments.userId, student.id))
        .all();
      expect(before).toHaveLength(1);

      // Delete user
      ctx.db.delete(users).where(eq(users.id, student.id)).run();

      // Enrollment should be cascade-deleted
      const after = ctx.db
        .select()
        .from(enrollments)
        .where(eq(enrollments.userId, student.id))
        .all();
      expect(after).toHaveLength(0);
    });

    it("sets null on group instructorId when instructor is deleted", () => {
      const instructor = seedUser(ctx, { username: "instr", role: "instructor" });
      const group = seedGroup(ctx, { name: "Orphan Group", instructorId: instructor.id });

      ctx.db.delete(users).where(eq(users.id, instructor.id)).run();

      const row = ctx.db.select().from(groups).where(eq(groups.id, group.id)).get();
      expect(row).toBeDefined();
      expect(row!.instructorId).toBeNull();
    });
  });
});

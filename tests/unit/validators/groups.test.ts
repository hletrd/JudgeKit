import { describe, expect, it } from "vitest";
import {
  createGroupSchema,
  groupMembershipSchema,
  updateGroupSchema,
  bulkEnrollmentSchema,
} from "@/lib/validators/groups";

// ------- createGroupSchema -------

describe("createGroupSchema", () => {
  it("accepts valid name only", () => {
    const result = createGroupSchema.safeParse({ name: "CS101" });
    expect(result.success).toBe(true);
  });

  it("accepts name and description", () => {
    const result = createGroupSchema.safeParse({
      name: "CS101",
      description: "Intro to Computer Science",
    });
    expect(result.success).toBe(true);
  });

  it("trims whitespace from name", () => {
    const parsed = createGroupSchema.parse({ name: "  CS101  " });
    expect(parsed.name).toBe("CS101");
  });

  it("rejects empty name", () => {
    const result = createGroupSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("nameRequired");
  });

  it("rejects whitespace-only name", () => {
    const result = createGroupSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 100 characters", () => {
    const result = createGroupSchema.safeParse({ name: "a".repeat(101) });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("nameTooLong");
  });

  it("accepts name at exactly 100 characters", () => {
    const result = createGroupSchema.safeParse({ name: "a".repeat(100) });
    expect(result.success).toBe(true);
  });

  it("converts blank description to undefined (normalizeOptionalString)", () => {
    const parsed = createGroupSchema.parse({ name: "CS101", description: "   " });
    expect(parsed.description).toBeUndefined();
  });

  it("rejects description longer than 500 characters", () => {
    const result = createGroupSchema.safeParse({
      name: "CS101",
      description: "a".repeat(501),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("descriptionTooLong");
  });

  it("accepts description at exactly 500 characters", () => {
    const result = createGroupSchema.safeParse({
      name: "CS101",
      description: "a".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it("accepts omitted description", () => {
    const result = createGroupSchema.safeParse({ name: "CS101" });
    expect(result.success).toBe(true);
    expect(result.data?.description).toBeUndefined();
  });

  it("rejects missing name", () => {
    const result = createGroupSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ------- groupMembershipSchema -------

describe("groupMembershipSchema", () => {
  it("accepts valid userId", () => {
    const result = groupMembershipSchema.safeParse({ userId: "user-123" });
    expect(result.success).toBe(true);
  });

  it("trims whitespace from userId", () => {
    const parsed = groupMembershipSchema.parse({ userId: "  user-123  " });
    expect(parsed.userId).toBe("user-123");
  });

  it("rejects empty userId", () => {
    const result = groupMembershipSchema.safeParse({ userId: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("studentRequired");
  });

  it("rejects whitespace-only userId", () => {
    const result = groupMembershipSchema.safeParse({ userId: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects missing userId", () => {
    const result = groupMembershipSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ------- updateGroupSchema -------

describe("updateGroupSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    const result = updateGroupSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update with only name", () => {
    const result = updateGroupSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with only description", () => {
    const result = updateGroupSchema.safeParse({ description: "New description" });
    expect(result.success).toBe(true);
  });

  it("accepts isArchived boolean field", () => {
    const result = updateGroupSchema.safeParse({ isArchived: true });
    expect(result.success).toBe(true);
    expect(result.data?.isArchived).toBe(true);
  });

  it("accepts full update", () => {
    const result = updateGroupSchema.safeParse({
      name: "CS202",
      description: "Advanced topics",
      isArchived: false,
    });
    expect(result.success).toBe(true);
  });

  it("still validates name length when provided", () => {
    const result = updateGroupSchema.safeParse({ name: "a".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("still trims name when provided", () => {
    const parsed = updateGroupSchema.parse({ name: "  CS101  " });
    expect(parsed.name).toBe("CS101");
  });

  it("still validates description length when provided", () => {
    const result = updateGroupSchema.safeParse({ description: "a".repeat(501) });
    expect(result.success).toBe(false);
  });
});

// ------- bulkEnrollmentSchema -------

describe("bulkEnrollmentSchema", () => {
  it("accepts a valid list of userIds", () => {
    const result = bulkEnrollmentSchema.safeParse({ userIds: ["user-1", "user-2"] });
    expect(result.success).toBe(true);
  });

  it("rejects empty userIds array", () => {
    const result = bulkEnrollmentSchema.safeParse({ userIds: [] });
    expect(result.success).toBe(false);
  });

  it("rejects more than 200 userIds", () => {
    const userIds = Array.from({ length: 201 }, (_, i) => `user-${i}`);
    const result = bulkEnrollmentSchema.safeParse({ userIds });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 200 userIds", () => {
    const userIds = Array.from({ length: 200 }, (_, i) => `user-${i}`);
    const result = bulkEnrollmentSchema.safeParse({ userIds });
    expect(result.success).toBe(true);
  });

  it("rejects an array containing empty string userId", () => {
    const result = bulkEnrollmentSchema.safeParse({ userIds: ["user-1", ""] });
    expect(result.success).toBe(false);
  });

  it("rejects missing userIds field", () => {
    const result = bulkEnrollmentSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

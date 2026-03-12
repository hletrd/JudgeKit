import { describe, expect, it } from "vitest";
import { bulkUserCreateSchema } from "@/lib/validators/bulk-users";

const validUser = {
  username: "jdoe",
  name: "John Doe",
};

describe("bulkUserCreateSchema", () => {
  it("accepts a valid single user with defaults", () => {
    const result = bulkUserCreateSchema.safeParse({ users: [validUser] });
    expect(result.success).toBe(true);
    expect(result.data?.users[0]?.role).toBe("student");
  });

  it("accepts all valid fields", () => {
    const result = bulkUserCreateSchema.safeParse({
      users: [
        {
          username: "jdoe",
          name: "John Doe",
          email: "jdoe@example.com",
          role: "instructor",
          className: "CS101",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty users array", () => {
    const result = bulkUserCreateSchema.safeParse({ users: [] });
    expect(result.success).toBe(false);
  });

  it("rejects more than 200 users", () => {
    const users = Array.from({ length: 201 }, (_, i) => ({
      username: `user${i}`,
      name: `User ${i}`,
    }));
    const result = bulkUserCreateSchema.safeParse({ users });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 200 users", () => {
    const users = Array.from({ length: 200 }, (_, i) => ({
      username: `user${String(i).padStart(3, "0")}`,
      name: `User ${i}`,
    }));
    const result = bulkUserCreateSchema.safeParse({ users });
    expect(result.success).toBe(true);
  });

  it("trims whitespace from username and name", () => {
    const result = bulkUserCreateSchema.parse({
      users: [{ username: "  jdoe  ", name: "  John Doe  " }],
    });
    expect(result.users[0]?.username).toBe("jdoe");
    expect(result.users[0]?.name).toBe("John Doe");
  });

  it("rejects username shorter than 2 characters", () => {
    const result = bulkUserCreateSchema.safeParse({
      users: [{ ...validUser, username: "a" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects username longer than 50 characters", () => {
    const result = bulkUserCreateSchema.safeParse({
      users: [{ ...validUser, username: "a".repeat(51) }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts username at min boundary (2 chars)", () => {
    const result = bulkUserCreateSchema.safeParse({
      users: [{ ...validUser, username: "ab" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts username at max boundary (50 chars)", () => {
    const result = bulkUserCreateSchema.safeParse({
      users: [{ ...validUser, username: "a".repeat(50) }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects name shorter than 1 character (empty after trim)", () => {
    const result = bulkUserCreateSchema.safeParse({
      users: [{ ...validUser, name: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 100 characters", () => {
    const result = bulkUserCreateSchema.safeParse({
      users: [{ ...validUser, name: "a".repeat(101) }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid email", () => {
    const result = bulkUserCreateSchema.safeParse({
      users: [{ ...validUser, email: "user@example.com" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email format", () => {
    const result = bulkUserCreateSchema.safeParse({
      users: [{ ...validUser, email: "not-an-email" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty string for email (treated as no email)", () => {
    const result = bulkUserCreateSchema.safeParse({
      users: [{ ...validUser, email: "" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts omitted email", () => {
    const result = bulkUserCreateSchema.safeParse({ users: [validUser] });
    expect(result.success).toBe(true);
    expect(result.data?.users[0]?.email).toBeUndefined();
  });

  it("defaults role to student when not provided", () => {
    const result = bulkUserCreateSchema.parse({ users: [validUser] });
    expect(result.users[0]?.role).toBe("student");
  });

  it("accepts role 'student'", () => {
    const result = bulkUserCreateSchema.safeParse({
      users: [{ ...validUser, role: "student" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts role 'instructor'", () => {
    const result = bulkUserCreateSchema.safeParse({
      users: [{ ...validUser, role: "instructor" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid role values", () => {
    const result = bulkUserCreateSchema.safeParse({
      users: [{ ...validUser, role: "admin" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects className longer than 50 characters", () => {
    const result = bulkUserCreateSchema.safeParse({
      users: [{ ...validUser, className: "a".repeat(51) }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty string for className", () => {
    const result = bulkUserCreateSchema.safeParse({
      users: [{ ...validUser, className: "" }],
    });
    expect(result.success).toBe(true);
  });

  it("trims whitespace from className", () => {
    const result = bulkUserCreateSchema.parse({
      users: [{ ...validUser, className: "  CS101  " }],
    });
    expect(result.users[0]?.className).toBe("CS101");
  });

  it("accepts omitted className", () => {
    const result = bulkUserCreateSchema.safeParse({ users: [validUser] });
    expect(result.success).toBe(true);
  });

  it("rejects missing users field entirely", () => {
    const result = bulkUserCreateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  updateProfileSchema,
  adminUpdateUserSchema,
  userCreateSchema,
} from "@/lib/validators/profile";

// ------- updateProfileSchema -------

describe("updateProfileSchema", () => {
  const validPayload = { name: "Alice Smith" };

  it("accepts valid name", () => {
    const result = updateProfileSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("trims whitespace from name", () => {
    const parsed = updateProfileSchema.parse({ name: "  Alice Smith  " });
    expect(parsed.name).toBe("Alice Smith");
  });

  it("rejects empty name", () => {
    const result = updateProfileSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("nameRequired");
  });

  it("rejects whitespace-only name", () => {
    const result = updateProfileSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 100 characters", () => {
    const result = updateProfileSchema.safeParse({ name: "a".repeat(101) });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("nameTooLong");
  });

  it("accepts name at exactly 100 characters", () => {
    const result = updateProfileSchema.safeParse({ name: "a".repeat(100) });
    expect(result.success).toBe(true);
  });

  it("accepts optional className", () => {
    const result = updateProfileSchema.safeParse({ name: "Alice", className: "CS101" });
    expect(result.success).toBe(true);
    expect(result.data?.className).toBe("CS101");
  });

  it("converts blank className to undefined (normalizeOptionalString)", () => {
    const parsed = updateProfileSchema.parse({ name: "Alice", className: "   " });
    expect(parsed.className).toBeUndefined();
  });

  it("rejects className longer than 100 characters", () => {
    const result = updateProfileSchema.safeParse({
      name: "Alice",
      className: "a".repeat(101),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("classNameTooLong");
  });

  it("accepts className at exactly 100 characters", () => {
    const result = updateProfileSchema.safeParse({
      name: "Alice",
      className: "a".repeat(100),
    });
    expect(result.success).toBe(true);
  });

  it("accepts omitted className", () => {
    const result = updateProfileSchema.safeParse({ name: "Alice" });
    expect(result.success).toBe(true);
    expect(result.data?.className).toBeUndefined();
  });

  it("rejects missing name field", () => {
    const result = updateProfileSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ------- adminUpdateUserSchema -------

describe("adminUpdateUserSchema", () => {
  const validPayload = { name: "Alice Smith" };

  it("accepts valid payload with name only", () => {
    const result = adminUpdateUserSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("accepts valid email", () => {
    const result = adminUpdateUserSchema.safeParse({ ...validPayload, email: "alice@example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = adminUpdateUserSchema.safeParse({ ...validPayload, email: "not-an-email" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("invalidEmail");
  });

  it("rejects email longer than 255 characters", () => {
    const localPart = "a".repeat(244);
    const result = adminUpdateUserSchema.safeParse({
      ...validPayload,
      email: `${localPart}@example.com`,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("invalidEmail");
  });

  it("converts blank email to undefined (normalizeOptionalString)", () => {
    const parsed = adminUpdateUserSchema.parse({ ...validPayload, email: "   " });
    expect(parsed.email).toBeUndefined();
  });

  it("accepts omitted email", () => {
    const result = adminUpdateUserSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    expect(result.data?.email).toBeUndefined();
  });

  it("accepts valid username", () => {
    const result = adminUpdateUserSchema.safeParse({ ...validPayload, username: "alice_01" });
    expect(result.success).toBe(true);
  });

  it("rejects username shorter than 2 characters", () => {
    const result = adminUpdateUserSchema.safeParse({ ...validPayload, username: "a" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("usernameTooShort");
  });

  it("rejects username longer than 50 characters", () => {
    const result = adminUpdateUserSchema.safeParse({ ...validPayload, username: "a".repeat(51) });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("usernameTooLong");
  });

  it("accepts username at exactly 2 characters", () => {
    const result = adminUpdateUserSchema.safeParse({ ...validPayload, username: "ab" });
    expect(result.success).toBe(true);
  });

  it("accepts username at exactly 50 characters", () => {
    const result = adminUpdateUserSchema.safeParse({ ...validPayload, username: "a".repeat(50) });
    expect(result.success).toBe(true);
  });

  it("rejects username with invalid characters (space)", () => {
    const result = adminUpdateUserSchema.safeParse({ ...validPayload, username: "alice smith" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("usernameInvalidChars");
  });

  it("rejects username with invalid characters (special symbols)", () => {
    const result = adminUpdateUserSchema.safeParse({ ...validPayload, username: "alice@01" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("usernameInvalidChars");
  });

  it("accepts username with allowed chars: letters, digits, underscore, hyphen", () => {
    const result = adminUpdateUserSchema.safeParse({ ...validPayload, username: "alice_01-AB" });
    expect(result.success).toBe(true);
  });

  it("trims whitespace from username", () => {
    const parsed = adminUpdateUserSchema.parse({ ...validPayload, username: "  alice_01  " });
    expect(parsed.username).toBe("alice_01");
  });

  it("accepts omitted username", () => {
    const result = adminUpdateUserSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    expect(result.data?.username).toBeUndefined();
  });
});

// ------- userCreateSchema -------

describe("userCreateSchema", () => {
  const validPayload = {
    name: "Alice Smith",
    username: "alice_01",
    role: "student",
  };

  it("accepts valid required fields", () => {
    const result = userCreateSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("requires username (not optional like adminUpdateUserSchema)", () => {
    const result = userCreateSchema.safeParse({ name: "Alice", role: "student" });
    expect(result.success).toBe(false);
  });

  it("rejects missing role", () => {
    const result = userCreateSchema.safeParse({ name: "Alice", username: "alice_01" });
    expect(result.success).toBe(false);
  });

  it("rejects empty role", () => {
    const result = userCreateSchema.safeParse({ ...validPayload, role: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("invalidRole");
  });

  it("trims whitespace from role", () => {
    const parsed = userCreateSchema.parse({ ...validPayload, role: "  student  " });
    expect(parsed.role).toBe("student");
  });

  it("accepts optional password", () => {
    const result = userCreateSchema.safeParse({ ...validPayload, password: "secret123" });
    expect(result.success).toBe(true);
    expect(result.data?.password).toBe("secret123");
  });

  it("accepts omitted password", () => {
    const result = userCreateSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    expect(result.data?.password).toBeUndefined();
  });

  it("rejects username with invalid characters", () => {
    const result = userCreateSchema.safeParse({ ...validPayload, username: "alice smith" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("usernameInvalidChars");
  });

  it("rejects username shorter than 2 characters", () => {
    const result = userCreateSchema.safeParse({ ...validPayload, username: "a" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("usernameTooShort");
  });

  it("rejects username longer than 50 characters", () => {
    const result = userCreateSchema.safeParse({ ...validPayload, username: "a".repeat(51) });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("usernameTooLong");
  });

  it("inherits email validation from adminUpdateUserSchema", () => {
    const result = userCreateSchema.safeParse({ ...validPayload, email: "bad-email" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("invalidEmail");
  });

  it("inherits className validation from updateProfileSchema", () => {
    const result = userCreateSchema.safeParse({
      ...validPayload,
      className: "a".repeat(101),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("classNameTooLong");
  });
});

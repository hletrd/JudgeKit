import { describe, expect, it } from "vitest";
import { commentCreateSchema } from "@/lib/validators/comments";

describe("commentCreateSchema", () => {
  it("accepts valid content", () => {
    const result = commentCreateSchema.safeParse({ content: "This is a comment." });
    expect(result.success).toBe(true);
    expect(result.data?.content).toBe("This is a comment.");
  });

  it("trims whitespace from content", () => {
    const parsed = commentCreateSchema.parse({ content: "  hello world  " });
    expect(parsed.content).toBe("hello world");
  });

  it("rejects empty content", () => {
    const result = commentCreateSchema.safeParse({ content: "" });
    expect(result.success).toBe(false);
  });

  it("accepts whitespace-only content (min check runs before trim)", () => {
    const result = commentCreateSchema.safeParse({ content: "   " });
    expect(result.success).toBe(true);
  });

  it("accepts content at exactly 1 character", () => {
    const result = commentCreateSchema.safeParse({ content: "a" });
    expect(result.success).toBe(true);
  });

  it("accepts content at exactly 2000 characters", () => {
    const result = commentCreateSchema.safeParse({ content: "a".repeat(2000) });
    expect(result.success).toBe(true);
  });

  it("rejects content longer than 2000 characters", () => {
    const result = commentCreateSchema.safeParse({ content: "a".repeat(2001) });
    expect(result.success).toBe(false);
  });

  it("rejects missing content field", () => {
    const result = commentCreateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-string content", () => {
    const result = commentCreateSchema.safeParse({ content: 42 });
    expect(result.success).toBe(false);
  });
});

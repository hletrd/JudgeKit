import { describe, it, expect } from "vitest";
import { verifyFileMagicBytes } from "@/lib/files/validation";

describe("verifyFileMagicBytes", () => {
  it("rejects unknown MIME types with no defined signature", () => {
    const buffer = Buffer.from("some content");
    expect(verifyFileMagicBytes(buffer, "application/octet-stream")).toBe(false);
    expect(verifyFileMagicBytes(buffer, "application/x-shockwave-flash")).toBe(false);
    expect(verifyFileMagicBytes(buffer, "application/x-executable")).toBe(false);
  });

  it("accepts image MIME types without checking content (verified by sharp)", () => {
    const buffer = Buffer.from("not actually an image");
    expect(verifyFileMagicBytes(buffer, "image/png")).toBe(true);
    expect(verifyFileMagicBytes(buffer, "image/jpeg")).toBe(true);
    expect(verifyFileMagicBytes(buffer, "image/webp")).toBe(true);
    expect(verifyFileMagicBytes(buffer, "image/gif")).toBe(true);
  });

  it("accepts text types with no null bytes", () => {
    const buffer = Buffer.from("hello world");
    expect(verifyFileMagicBytes(buffer, "text/plain")).toBe(true);
    expect(verifyFileMagicBytes(buffer, "text/csv")).toBe(true);
    expect(verifyFileMagicBytes(buffer, "text/markdown")).toBe(true);
  });

  it("rejects text types with null bytes in the first 8KB", () => {
    const buffer = Buffer.concat([Buffer.from("hello"), Buffer.from([0x00]), Buffer.from("world")]);
    expect(verifyFileMagicBytes(buffer, "text/plain")).toBe(false);
  });

  it("accepts PDF files starting with %PDF-", () => {
    const buffer = Buffer.from("%PDF-1.4 some content");
    expect(verifyFileMagicBytes(buffer, "application/pdf")).toBe(true);
  });

  it("rejects PDF files not starting with %PDF-", () => {
    const buffer = Buffer.from("not a pdf");
    expect(verifyFileMagicBytes(buffer, "application/pdf")).toBe(false);
  });

  it("accepts ZIP files starting with PK local file header", () => {
    const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(verifyFileMagicBytes(buffer, "application/zip")).toBe(true);
  });

  it("accepts ZIP files starting with PK empty archive", () => {
    const buffer = Buffer.from([0x50, 0x4b, 0x05, 0x06, 0x00, 0x00]);
    expect(verifyFileMagicBytes(buffer, "application/zip")).toBe(true);
  });

  it("rejects ZIP files not starting with PK signature", () => {
    const buffer = Buffer.from("not a zip");
    expect(verifyFileMagicBytes(buffer, "application/zip")).toBe(false);
  });

  it("treats application/x-zip-compressed same as application/zip", () => {
    const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(verifyFileMagicBytes(buffer, "application/x-zip-compressed")).toBe(true);
  });

  it("rejects text types with null byte in the first 8KB", () => {
    const buffer = Buffer.concat([Buffer.from("hello"), Buffer.from([0x00]), Buffer.from("world")]);
    expect(verifyFileMagicBytes(buffer, "text/plain")).toBe(false);
  });

  it("accepts text types with null byte after the first 8KB", () => {
    // Create a buffer larger than 8KB with a null byte after the 8KB boundary
    const before = Buffer.alloc(8192, 0x41); // 8KB of 'A'
    const after = Buffer.concat([Buffer.from([0x00]), Buffer.from("trailing")]);
    const buffer = Buffer.concat([before, after]);
    expect(verifyFileMagicBytes(buffer, "text/plain")).toBe(true);
  });

  it("accepts empty text files", () => {
    const buffer = Buffer.alloc(0);
    expect(verifyFileMagicBytes(buffer, "text/plain")).toBe(true);
    expect(verifyFileMagicBytes(buffer, "text/csv")).toBe(true);
    expect(verifyFileMagicBytes(buffer, "text/markdown")).toBe(true);
  });
});

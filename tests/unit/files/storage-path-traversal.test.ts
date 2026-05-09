import { describe, expect, it, beforeAll } from "vitest";

// Ensure uploads dir is resolved consistently regardless of the developer's
// actual UPLOADS_DIR env. The resolveStoredPath contract we care about here is
// pure (it only throws on bad input), so we can exercise it without touching
// the filesystem.
beforeAll(() => {
  process.env.UPLOADS_DIR = "/tmp/judgekit-uploads-test";
});

describe("resolveStoredPath path-traversal guard", () => {
  it("accepts a simple single-segment filename", async () => {
    const { resolveStoredPath } = await import("@/lib/files/storage");
    expect(() => resolveStoredPath("abc123.png")).not.toThrow();
  });

  it("rejects filenames containing a forward slash", async () => {
    const { resolveStoredPath } = await import("@/lib/files/storage");
    expect(() => resolveStoredPath("a/b.png")).toThrow();
    expect(() => resolveStoredPath("../abc.png")).toThrow();
    expect(() => resolveStoredPath("subdir/abc.png")).toThrow();
  });

  it("rejects filenames containing a backslash (Windows-style)", async () => {
    const { resolveStoredPath } = await import("@/lib/files/storage");
    expect(() => resolveStoredPath("a\\b.png")).toThrow();
    expect(() => resolveStoredPath("..\\abc.png")).toThrow();
  });

  it("rejects filenames containing parent-dir traversal", async () => {
    const { resolveStoredPath } = await import("@/lib/files/storage");
    expect(() => resolveStoredPath("..")).toThrow();
    expect(() => resolveStoredPath("..hidden")).toThrow();
    expect(() => resolveStoredPath("file..evil")).toThrow();
  });

  it("rejects absolute-path-looking inputs", async () => {
    const { resolveStoredPath } = await import("@/lib/files/storage");
    expect(() => resolveStoredPath("/etc/passwd")).toThrow();
  });

  it("rejects classic path-traversal attack strings", async () => {
    const { resolveStoredPath } = await import("@/lib/files/storage");
    expect(() => resolveStoredPath("../../etc/passwd")).toThrow();
    expect(() => resolveStoredPath("../../../etc/shadow")).toThrow();
    expect(() => resolveStoredPath("../../../../root/.ssh/id_rsa")).toThrow();
    expect(() => resolveStoredPath("..\\..\\windows\\system32\\config\\sam")).toThrow();
  });

  it("rejects mixed traversal techniques", async () => {
    const { resolveStoredPath } = await import("@/lib/files/storage");
    // Double-encoded or alternation tricks still contain ".." or "/"
    expect(() => resolveStoredPath("....//....//etc/passwd")).toThrow();
    expect(() => resolveStoredPath("..%2f..%2fetc/passwd")).toThrow();
    expect(() => resolveStoredPath("foo/../../etc/passwd")).toThrow();
  });

  it("rejects null-byte injection attempts", async () => {
    const { resolveStoredPath } = await import("@/lib/files/storage");
    // Null bytes could truncate the name in some runtimes
    expect(() => resolveStoredPath("file.txt\x00../evil")).toThrow();
  });

  it("rejects names starting with a dot (hidden files)", async () => {
    const { resolveStoredPath } = await import("@/lib/files/storage");
    expect(() => resolveStoredPath(".hidden")).toThrow();
    expect(() => resolveStoredPath(".gitignore")).toThrow();
    expect(() => resolveStoredPath(".env")).toThrow();
  });

  it("rejects control characters", async () => {
    const { resolveStoredPath } = await import("@/lib/files/storage");
    expect(() => resolveStoredPath("file\x01.txt")).toThrow();
    expect(() => resolveStoredPath("file\x1f.txt")).toThrow();
    expect(() => resolveStoredPath("file\x7f.txt")).toThrow();
  });

  it("rejects empty string", async () => {
    const { resolveStoredPath } = await import("@/lib/files/storage");
    expect(() => resolveStoredPath("")).toThrow();
  });

  it("accepts valid nanoid-style names", async () => {
    const { resolveStoredPath } = await import("@/lib/files/storage");
    expect(() => resolveStoredPath("V1StGXR8_Z5jdHi6B-myT")).not.toThrow();
    expect(() => resolveStoredPath("abc123")).not.toThrow();
    expect(() => resolveStoredPath("file_name.txt")).not.toThrow();
  });
});

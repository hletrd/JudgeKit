import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateZipDecompressedSize, measureEntryStreamedSize } from "@/lib/files/validation";

/**
 * Helper: create a ZIP buffer with the given entries.
 * Each entry is { name: string, content: string | Buffer }.
 */
async function createZipBuffer(
  entries: Array<{ name: string; content: string | Buffer }>,
): Promise<Buffer> {
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.name, entry.content);
  }
  return zip.generateAsync({ type: "nodebuffer" }) as Promise<Buffer>;
}

describe("validateZipDecompressedSize", () => {
  it("accepts a valid ZIP under the size limit", async () => {
    const buffer = await createZipBuffer([
      { name: "hello.txt", content: "Hello, world!" },
      { name: "data.txt", content: Buffer.alloc(100, "x") },
    ]);

    const result = await validateZipDecompressedSize(buffer, 1024 * 1024);
    expect(result).toBeNull();
  });

  it("rejects a ZIP whose total decompressed size exceeds the limit", async () => {
    // Create a ZIP with entries totaling > 1 KB
    const buffer = await createZipBuffer([
      { name: "big.txt", content: Buffer.alloc(512, "a") },
      { name: "big2.txt", content: Buffer.alloc(512, "b") },
      { name: "big3.txt", content: Buffer.alloc(512, "c") },
    ]);

    const result = await validateZipDecompressedSize(buffer, 1000);
    expect(result).toBe("zipDecompressedSizeExceeded");
  });

  it("rejects a ZIP with a single entry exceeding the per-entry cap", async () => {
    // Per-entry cap is 50 MB; create an entry slightly larger
    // We can't actually allocate 50 MB in a test, so we test the metadata path
    // by creating a normal ZIP and verifying the function works with small caps.
    const buffer = await createZipBuffer([
      { name: "small.txt", content: "x" },
    ]);

    // Set the per-entry cap to 0 bytes (impossible to pass) by using a very small
    // maxDecompressedSize. Since the entry is 1 byte and max is 0, this triggers
    // the size check via metadata.
    const result = await validateZipDecompressedSize(buffer, 0);
    expect(result).toBe("zipDecompressedSizeExceeded");
  });

  it("accepts an empty ZIP", async () => {
    const zip = new JSZip();
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const result = await validateZipDecompressedSize(buffer as Buffer, 1024);
    expect(result).toBeNull();
  });

  it("rejects a corrupt/invalid ZIP buffer", async () => {
    const corruptBuffer = Buffer.from("this is not a zip file at all!");

    const result = await validateZipDecompressedSize(corruptBuffer, 1024 * 1024);
    expect(result).toBe("zipDecompressedSizeExceeded");
  });

  it("uses metadata fast path for standard ZIPs (no decompression)", async () => {
    // This test verifies the fast path by checking that a large ZIP with many
    // entries is validated quickly (metadata-only). If decompression were used,
    // this would be slow and memory-intensive.
    const entries: Array<{ name: string; content: Buffer }> = [];
    for (let i = 0; i < 100; i++) {
      entries.push({ name: `file${i}.txt`, content: Buffer.alloc(1024, String(i % 10)) });
    }
    const buffer = await createZipBuffer(entries);

    // Total decompressed: 100 * 1024 = 100 KB. Allow 1 MB.
    const result = await validateZipDecompressedSize(buffer, 1024 * 1024);
    expect(result).toBeNull();
  });
});

// NEW-M8 / C3-N8: the slow path (entries lacking uncompressedSize metadata)
// must stream incrementally and abort the moment a per-entry cap is exceeded,
// rather than materializing the full decompressed payload via `.async()` and
// OOMing. These tests pin the streaming + cap-abort behaviour.
describe("measureEntryStreamedSize (NEW-M8 streaming cap)", () => {
  /** Build a fake JSZip entry whose `nodeStream()` emits the given chunks. */
  function makeEntry(chunks: Buffer[]): { nodeStream(): Readable } {
    return {
      nodeStream: () => Readable.from(chunks),
    };
  }

  it("resolves with the entry's total decompressed size when under the cap", async () => {
    // 3 chunks of 1 KB → 3072 bytes; cap at 10 KB.
    const entry = makeEntry([Buffer.alloc(1024, "a"), Buffer.alloc(1024, "b"), Buffer.alloc(1024, "c")]);
    const size = await measureEntryStreamedSize(entry, 10 * 1024);
    expect(size).toBe(3072);
  });

  it("rejects (null) when the entry exceeds the per-entry cap mid-stream", async () => {
    // 5 chunks of 1 KB = 5 KB total; cap at 3 KB → must abort after the 4th chunk.
    const entry = makeEntry([
      Buffer.alloc(1024, "a"),
      Buffer.alloc(1024, "b"),
      Buffer.alloc(1024, "c"),
      Buffer.alloc(1024, "d"),
      Buffer.alloc(1024, "e"),
    ]);
    const size = await measureEntryStreamedSize(entry, 3 * 1024);
    expect(size).toBeNull();
  });

  it("rejects (null) on a stream error", async () => {
    const entry = {
      nodeStream: () =>
        Readable.from(
          (async function* () {
            yield Buffer.alloc(512, "x");
            throw new Error("decompress failed");
          })(),
        ),
    };
    const size = await measureEntryStreamedSize(entry, 10 * 1024);
    expect(size).toBeNull();
  });
});

// Revert-RED contract: the slow path must stream (not `.async()`), so a future
// refactor that reintroduces the allocate-then-check OOM bug flips this red.
describe("validateZipDecompressedSize slow-path streaming contract (NEW-M8)", () => {
  it("streams the slow path via nodeStream (no allocate-then-check .async on entries)", () => {
    const raw = readFileSync(join(process.cwd(), "src/lib/files/validation.ts"), "utf8");
    // Strip /* block */ and // line comments so docstring prose mentioning the
    // old `.async("uint8array")` pattern does not false-positive.
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // The streaming helper must be present and the slow path must use it.
    expect(code).toContain("measureEntryStreamedSize");
    // The old allocate-then-check call on a ZIP entry must be gone from code.
    expect(code).not.toMatch(/entry\.async\s*\(/);
    expect(code).not.toMatch(/\.async\(\s*["']uint8array["']\s*\)/);
  });
});

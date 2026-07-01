import { beforeEach, describe, expect, it, vi } from "vitest";

const writeFileMock = vi.fn();
const mkdirMock = vi.fn();

vi.mock("node:fs/promises", () => ({
  mkdir: mkdirMock,
  writeFile: writeFileMock,
  unlink: vi.fn(),
  readFile: vi.fn(),
  access: vi.fn(),
}));

describe("writeUploadedFile mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    process.env.DATABASE_PATH = "/tmp/judgekit-storage-test";
  });

  it("writes uploaded files with mode 0o600", async () => {
    const { writeUploadedFile } = await import("@/lib/files/storage");

    await writeUploadedFile("abc123.png", Buffer.from("hello"));

    expect(mkdirMock).toHaveBeenCalled();
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [, , options] = writeFileMock.mock.calls[0];
    expect(options).toMatchObject({ mode: 0o600 });
  });
});

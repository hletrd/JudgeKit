import { describe, expect, it } from "vitest";
import { getDummyPasswordHash } from "@/lib/security/dummy-password-hash";
import { verifyPassword } from "@/lib/security/password-hash";

describe("getDummyPasswordHash", () => {
  it("returns an argon2id-formatted hash", async () => {
    const hash = await getDummyPasswordHash();
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it("returns the same hash within a process", async () => {
    const [first, second] = await Promise.all([getDummyPasswordHash(), getDummyPasswordHash()]);
    expect(first).toBe(second);
  });

  it("does not match any real password but still runs timing-safe verification", async () => {
    const hash = await getDummyPasswordHash();
    const result = await verifyPassword("some-password", hash);
    expect(result.valid).toBe(false);
    expect(result.needsRehash).toBe(false);
  });
});

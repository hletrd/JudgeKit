import { randomBytes } from "node:crypto";
import argon2 from "argon2";

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB (OWASP minimum recommendation)
  timeCost: 2,
  parallelism: 1,
};

let cachedHash: string | null = null;

/**
 * Returns a timing-safe Argon2id hash for the "dummy" password used when the
 * requested user does not exist. This prevents user-enumeration attacks via
 * response-time differences.
 *
 * The hash is generated once per process from a random secret (and Argon2's
 * own random salt) so it is not a static, identifiable constant. Verification
 * still runs through argon2.verify, which uses a timing-safe comparison.
 */
export async function getDummyPasswordHash(): Promise<string> {
  if (cachedHash) {
    return cachedHash;
  }

  const secret = randomBytes(32).toString("base64url");
  cachedHash = await argon2.hash(secret, ARGON2_OPTIONS);
  return cachedHash;
}

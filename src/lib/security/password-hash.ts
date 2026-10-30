import argon2 from "argon2";
import { compare as bcryptCompare } from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

const ARGON2_OPTIONS: argon2.HashOptions & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB (OWASP minimum recommendation)
  timeCost: 2,
  parallelism: 1,
};

/** Returns true if the hash is a legacy bcrypt hash. */
function isBcryptHash(hash: string): boolean {
  return hash.startsWith("$2a$") || hash.startsWith("$2b$");
}

/** Hash a password using Argon2id. */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verify a password against a stored hash (bcrypt or argon2).
 * Returns `{ valid, needsRehash }` — caller should rehash and persist
 * the new hash when `needsRehash` is true.
 *
 * `needsRehash` is true when:
 * - The hash is a legacy bcrypt hash (migration to argon2id needed)
 * - The argon2 hash parameters differ from the current ARGON2_OPTIONS
 *   (e.g., memoryCost or timeCost was increased)
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (isBcryptHash(storedHash)) {
    const valid = await bcryptCompare(password, storedHash);
    return { valid, needsRehash: valid };
  }

  const valid = await argon2.verify(storedHash, password);
  // Check if the Argon2 hash parameters match the current policy.
  // If they differ (e.g., memoryCost was increased), the hash should be
  // regenerated with the new parameters on the next successful login.
  const needsRehash = valid && argon2.needsRehash(storedHash, ARGON2_OPTIONS);
  return { valid, needsRehash };
}

/**
 * Verify a password and transparently rehash if needed.
 * Rehashing occurs when:
 * - The hash is a legacy bcrypt hash (migration to argon2id)
 * - The argon2 hash parameters differ from the current ARGON2_OPTIONS
 *   (e.g., memoryCost or timeCost was increased)
 *
 * Includes audit logging for rehash events.
 *
 * Returns `{ valid }` — the rehash is handled internally.
 */
export async function verifyAndRehashPassword(
  password: string,
  userId: string,
  storedHash: string
): Promise<{ valid: boolean }> {
  const { valid, needsRehash } = await verifyPassword(password, storedHash);
  if (valid && needsRehash) {
    try {
      const newHash = await hashPassword(password);
      await db
        .update(users)
        .set({ passwordHash: newHash })
        .where(eq(users.id, userId));
      const reason = isBcryptHash(storedHash) ? "bcrypt to argon2id" : "argon2 parameter update";
      logger.info({ userId, reason }, "[password-rehash] Transparently rehashed password (%s)", reason);
    } catch (err) {
      logger.error({ err, userId }, "[password-rehash] Failed to rehash password");
    }
  }
  return { valid };
}

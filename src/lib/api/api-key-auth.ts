import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys, users } from "@/lib/db/schema";
import { authUserSelect } from "@/lib/db/selects";
import { deriveEncryptionKey, legacyEncryptionKey } from "@/lib/security/derive-key";
import { getRoleLevel } from "@/lib/capabilities/cache";
import { logger } from "@/lib/logger";
import { getDbNowUncached } from "@/lib/db-time";
import { hashToken } from "@/lib/security/token-hash";

export const API_KEY_PREFIX = "jk_";
const KEY_RANDOM_BYTES = 20; // 20 bytes = 40 hex chars → total key = "jk_" + 40 = 43 chars
export const STORED_PREFIX_LEN = 8; // store first 8 chars of full key for display
const MASKED_KEY_SUFFIX = "••••••••••••";
const API_KEY_DOMAIN = "api-key-encryption";

export function buildMaskedApiKeyPreview(keyPrefix: string) {
  return `${keyPrefix}${MASKED_KEY_SUFFIX}`;
}

export function hashApiKey(rawKey: string) {
  return hashToken(rawKey);
}

export function encryptApiKey(rawKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveEncryptionKey(API_KEY_DOMAIN), iv);
  const ciphertext = Buffer.concat([cipher.update(rawKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptApiKey(encrypted: string): string {
  const [ivRaw, tagRaw, ciphertextRaw] = encrypted.split(":");
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error("Malformed encrypted API key");

  // Try HKDF-derived key first, then fall back to legacy key for backward compatibility
  for (const key of [deriveEncryptionKey(API_KEY_DOMAIN), legacyEncryptionKey()]) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64url"));
      decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64url")), decipher.final()]).toString("utf8");
    } catch {
      continue;
    }
  }
  throw new Error("Failed to decrypt API key with any available key");
}

/** Generate a new API key. Returns the one-time reveal token plus stored fields. */
export function generateApiKey(): {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
} {
  const rawKey = API_KEY_PREFIX + randomBytes(KEY_RANDOM_BYTES).toString("hex");
  const keyPrefix = rawKey.slice(0, STORED_PREFIX_LEN);
  return { rawKey, keyPrefix, keyHash: hashApiKey(rawKey) };
}

/**
 * Authenticate a request using a Bearer API key.
 * Returns the user-like object if valid, or null.
 */
export async function authenticateApiKey(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey.startsWith(API_KEY_PREFIX) || rawKey.length < 10) return null;
  const keyHash = hashApiKey(rawKey);

  const [candidate] = await db
    .select({
      id: apiKeys.id,
      role: apiKeys.role,
      createdById: apiKeys.createdById,
      expiresAt: apiKeys.expiresAt,
      isActive: apiKeys.isActive,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)))
    .limit(1);

  if (!candidate) return null;

  // Check expiry using DB server time to avoid clock skew
  const now = await getDbNowUncached();
  if (candidate.expiresAt) {
    if (candidate.expiresAt < now) return null;
  }

  // Fetch the creator user for context
  const user = await db
    .select(authUserSelect)
    .from(users)
    .where(eq(users.id, candidate.createdById))
    .then((rows) => rows[0] ?? null);

  if (!user?.isActive) return null;

  // Update lastUsedAt (fire-and-forget with error logging)
  // Use the DB-server time already fetched above for the expiry check,
  // keeping lastUsedAt consistent with the same authoritative time source.
  void db.update(apiKeys)
    .set({ lastUsedAt: now })
    .where(eq(apiKeys.id, candidate.id))
    .catch((err) => {
      logger.warn({ err, apiKeyId: candidate.id }, "[api-key-auth] Failed to update lastUsedAt");
    });

  // Use the lesser of the API key's declared role and the creator's current
  // role. This must resolve custom-role levels through the capability cache,
  // otherwise custom roles silently collapse to the built-in fallback rank.
  const [keyRoleRank, userRoleRank] = await Promise.all([
    getRoleLevel(candidate.role),
    getRoleLevel(user.role),
  ]);
  const effectiveRole = keyRoleRank <= userRoleRank ? candidate.role : user.role;

  return {
    id: user.id,
    role: effectiveRole,
    username: user.username,
    email: user.email,
    name: user.name,
    className: user.className,
    mustChangePassword: Boolean(user.mustChangePassword),
    _apiKeyAuth: true as const,
  };
}

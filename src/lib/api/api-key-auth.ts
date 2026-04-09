import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys, users } from "@/lib/db/schema";
import { authUserSelect } from "@/lib/db/selects";
import { ROLE_LEVEL } from "@/lib/security/constants";
import type { UserRole } from "@/types";

export const API_KEY_PREFIX = "jk_";
const KEY_RANDOM_BYTES = 20; // 20 bytes = 40 hex chars → total key = "jk_" + 40 = 43 chars
export const STORED_PREFIX_LEN = 8; // store first 8 chars of full key for display
const MASKED_KEY_SUFFIX = "••••••••••••";

export function buildMaskedApiKeyPreview(keyPrefix: string) {
  return `${keyPrefix}${MASKED_KEY_SUFFIX}`;
}

export function hashApiKey(rawKey: string) {
  return createHash("sha256").update(rawKey).digest("hex");
}

function getEncryptionKey() {
  const secret = process.env.PLUGIN_CONFIG_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "PLUGIN_CONFIG_ENCRYPTION_KEY must be set for API key encryption. " +
      "Generate a dedicated key: openssl rand -hex 32"
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptApiKey(rawKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(rawKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptApiKey(encrypted: string): string {
  const [ivRaw, tagRaw, ciphertextRaw] = encrypted.split(":");
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error("Malformed encrypted API key");
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64url")), decipher.final()]).toString("utf8");
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
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)))
    .limit(1);

  if (!candidate) return null;

  // Check expiry
  if (candidate.expiresAt && candidate.expiresAt < new Date()) return null;

  // Fetch the creator user for context
  const user = await db
    .select(authUserSelect)
    .from(users)
    .where(eq(users.id, candidate.createdById))
    .then((rows) => rows[0] ?? null);

  if (!user?.isActive) return null;

  // Update lastUsedAt (fire-and-forget)
  void db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, candidate.id));

  // Use the lesser of the API key's declared role and the creator's current role.
  // This prevents privilege escalation when a user is demoted after creating a key.
  // Uses ROLE_LEVEL from constants which handles custom roles via the capability system.
  const keyRoleRank = ROLE_LEVEL[candidate.role as UserRole] ?? 0;
  const userRoleRank = ROLE_LEVEL[user.role as UserRole] ?? 0;
  const effectiveRole = (keyRoleRank <= userRoleRank ? candidate.role : user.role) as UserRole;

  return {
    id: user.id,
    role: effectiveRole,
    username: user.username,
    email: user.email,
    name: user.name,
    className: user.className,
    mustChangePassword: false,
    _apiKeyAuth: true as const,
  };
}

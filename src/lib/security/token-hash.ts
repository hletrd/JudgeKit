import { createHash } from "crypto";

/**
 * Hash a token with SHA-256 and return the hex digest.
 *
 * Shared between recruiting invitations and judge worker authentication
 * so both modules use the same hash algorithm. If the algorithm changes,
 * it only needs to be updated here.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

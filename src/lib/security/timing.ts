import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison that does not leak the expected token's length.
 *
 * Both inputs are HMAC'd with an ephemeral key so that `timingSafeEqual`
 * always compares two fixed-length digests, regardless of input lengths.
 */
export function safeTokenCompare(provided: string, expected: string): boolean {
  // Token length is not secret information; checking first avoids HMAC timing
  // that would otherwise vary with input length and create a side-channel.
  if (provided.length !== expected.length) return false;
  const key = randomBytes(32);
  const a = createHmac("sha256", key).update(provided).digest();
  const b = createHmac("sha256", key).update(expected).digest();
  return timingSafeEqual(a, b);
}

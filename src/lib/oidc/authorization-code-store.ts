import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db, execTransaction } from "@/lib/db";
import { oidcAuthorizationCodes } from "@/lib/db/schema";

export const OIDC_AUTHORIZATION_CODE_TTL_SECONDS = 300;

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export async function issueAuthorizationCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  nonce: string | null;
  now: Date;
}) {
  const code = randomBytes(32).toString("base64url");
  const expiresAt = new Date(input.now.getTime() + OIDC_AUTHORIZATION_CODE_TTL_SECONDS * 1000);

  await execTransaction(async (tx) => {
    await tx.delete(oidcAuthorizationCodes).where(lt(oidcAuthorizationCodes.expiresAt, input.now));
    await tx.insert(oidcAuthorizationCodes).values({
      codeHash: hashCode(code),
      clientId: input.clientId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      scope: input.scope,
      codeChallenge: input.codeChallenge,
      nonce: input.nonce,
      expiresAt,
      createdAt: input.now,
    });
  });

  return code;
}

export async function findAuthorizationCode(code: string) {
  return db
    .select()
    .from(oidcAuthorizationCodes)
    .where(eq(oidcAuthorizationCodes.codeHash, hashCode(code)))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function consumeAuthorizationCode(id: string, now: Date) {
  return execTransaction(async (tx) => {
    const rows = await tx
      .update(oidcAuthorizationCodes)
      .set({ consumedAt: now })
      .where(
        and(
          eq(oidcAuthorizationCodes.id, id),
          isNull(oidcAuthorizationCodes.consumedAt),
          gt(oidcAuthorizationCodes.expiresAt, now),
        ),
      )
      .returning({ id: oidcAuthorizationCodes.id });
    return rows.length === 1;
  });
}

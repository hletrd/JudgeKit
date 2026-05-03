import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { getValidatedJudgeAuthToken } from "@/lib/security/env";
import { safeTokenCompare } from "@/lib/security/timing";
import { db } from "@/lib/db";
import { judgeWorkers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

function parseBearerToken(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7);
}

/**
 * Hash a token with SHA-256 and return the hex digest.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Validate that the request carries a valid judge Bearer token.
 * Checks the shared JUDGE_AUTH_TOKEN from the environment.
 */
export function isJudgeAuthorized(request: NextRequest) {
  const providedToken = parseBearerToken(request.headers.get("authorization"));

  if (!providedToken) {
    return false;
  }

  const expectedToken = getValidatedJudgeAuthToken();
  return safeTokenCompare(providedToken, expectedToken);
}

/**
 * Validate that the request carries a valid judge Bearer token for a
 * specific worker. The worker MUST exist with a `secretTokenHash`; the
 * provided token is hashed and compared against the stored hash.
 *
 * The previous behaviour fell back to the shared JUDGE_AUTH_TOKEN for any
 * worker not in the DB, which let a leaked shared token submit fabricated
 * results for any worker id (including ones that never existed). The shared
 * token is now only honoured by `isJudgeAuthorized` on the registration
 * path; once a worker is registered it must authenticate with its own
 * per-worker secret.
 *
 * Returns an object with `authorized` boolean and an optional error key
 * that can be returned directly to the client.
 */
export async function isJudgeAuthorizedForWorker(
  request: NextRequest,
  workerId: string,
): Promise<{ authorized: boolean; error?: string }> {
  const providedToken = parseBearerToken(request.headers.get("authorization"));

  if (!providedToken) {
    return { authorized: false, error: "unauthorized" };
  }

  const worker = await db.query.judgeWorkers.findFirst({
    where: eq(judgeWorkers.id, workerId),
    columns: { secretTokenHash: true },
  });

  if (!worker) {
    // Workers must register before claiming work. A request bearing a
    // shared token for a non-existing workerId is suspicious — log the
    // workerId so an operator can correlate with /api/v1/judge/register
    // attempts during incident response.
    logger.warn(
      { workerId },
      "[judge] auth attempted for unknown workerId — registration must precede claim",
    );
    return { authorized: false, error: "workerNotFound" };
  }

  if (worker.secretTokenHash) {
    if (safeTokenCompare(hashToken(providedToken), worker.secretTokenHash)) {
      return { authorized: true };
    }
    return { authorized: false, error: "invalidWorkerToken" };
  }

  // Worker exists but has no secretTokenHash. This is a legacy state from
  // before per-worker tokens were enforced; the operator must re-register
  // the worker so it acquires a hash on the canonical path. Reject and log.
  // The %s placeholder was previously left unsubstituted (pino does not
  // splice format specifiers from the binding object); rely on the structured
  // workerId field instead.
  logger.warn(
    { workerId },
    "[judge] Worker has no secretTokenHash — rejecting auth. Re-register the worker so it acquires a per-worker secret.",
  );
  return { authorized: false, error: "workerSecretNotMigrated" };
}

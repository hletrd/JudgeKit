import type { NextRequest } from "next/server";
import { getValidatedJudgeAuthToken } from "@/lib/security/env";
import { safeTokenCompare } from "@/lib/security/timing";
import { db } from "@/lib/db";
import { judgeWorkers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function parseBearerToken(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7);
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
 * specific worker. When the worker has a `secretToken` stored in the DB,
 * the Bearer token must match that worker-specific secret. Otherwise it
 * falls back to the shared JUDGE_AUTH_TOKEN.
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
    columns: { secretToken: true },
  });

  // If the worker exists and has a per-worker secret, validate against it
  if (worker?.secretToken) {
    if (safeTokenCompare(providedToken, worker.secretToken)) {
      return { authorized: true };
    }
    // Token didn't match worker secret — don't fall through to shared token
    return { authorized: false, error: "invalidWorkerToken" };
  }

  // Worker not found or has no per-worker secret: fall back to shared token
  const expectedToken = getValidatedJudgeAuthToken();
  if (safeTokenCompare(providedToken, expectedToken)) {
    return { authorized: true };
  }

  return { authorized: false, error: "unauthorized" };
}

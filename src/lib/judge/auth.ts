import type { NextRequest } from "next/server";
import { getValidatedJudgeAuthToken } from "@/lib/security/env";
import { safeTokenCompare } from "@/lib/security/timing";

function parseBearerToken(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7);
}

export function isJudgeAuthorized(request: NextRequest) {
  const providedToken = parseBearerToken(request.headers.get("authorization"));

  if (!providedToken) {
    return false;
  }

  const expectedToken = getValidatedJudgeAuthToken();
  return safeTokenCompare(providedToken, expectedToken);
}

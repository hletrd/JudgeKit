import type { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { validateTrustedAuthHost } from "@/lib/auth/trusted-host";

export async function GET(request: NextRequest) {
  const hostValidationResult = await validateTrustedAuthHost(request);

  if (hostValidationResult) {
    return hostValidationResult;
  }

  return handlers.GET(request);
}

export async function POST(request: NextRequest) {
  const hostValidationResult = await validateTrustedAuthHost(request);

  if (hostValidationResult) {
    return hostValidationResult;
  }

  return handlers.POST(request);
}

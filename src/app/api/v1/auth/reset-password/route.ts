import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resetPassword, validatePasswordResetToken } from "@/lib/email";
import { consumeRateLimitAttemptMulti, getRateLimitKey } from "@/lib/security/rate-limit";
import { FIXED_MIN_PASSWORD_LENGTH, getPasswordValidationError } from "@/lib/security/password";
import { validateCsrf } from "@/lib/security/csrf";

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const csrfError = await validateCsrf(req);
  if (csrfError) return csrfError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalidJson" }, { status: 400 });
  }

  const parsed = resetPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalidRequest" }, { status: 400 });
  }

  const { token, password } = parsed.data;

  const rateLimitKey = getRateLimitKey("reset_password", req.headers);
  const tokenRateLimitKey = `reset_password:token:${token.slice(0, 8)}`;
  const blocked = await consumeRateLimitAttemptMulti(rateLimitKey, tokenRateLimitKey);
  if (blocked) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }

  const validation = await validatePasswordResetToken(token);
  if (!validation.valid) {
    return NextResponse.json({ error: "invalidOrExpiredToken" }, { status: 400 });
  }

  if (getPasswordValidationError(password) != null) {
    return NextResponse.json(
      { error: "passwordTooShort", minLength: FIXED_MIN_PASSWORD_LENGTH },
      { status: 400 }
    );
  }

  const result = await resetPassword(token, password, FIXED_MIN_PASSWORD_LENGTH);

  if (!result.success) {
    if (result.error === "invalid_token" || result.error === "already_used") {
      return NextResponse.json({ error: "invalidOrExpiredToken" }, { status: 400 });
    }
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

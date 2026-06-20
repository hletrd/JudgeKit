import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendPasswordResetEmail } from "@/lib/email";
import { consumeRateLimitAttemptMulti, getRateLimitKey } from "@/lib/security/rate-limit";
import { getPublicBaseUrl } from "@/lib/security/env";

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const parsed = forgotPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalidEmail" }, { status: 400 });
  }

  const { email } = parsed.data;
  const rateLimitKey = getRateLimitKey("forgot_password", req.headers);
  const emailRateLimitKey = `forgot_password:email:${email.toLowerCase()}`;

  const blocked = await consumeRateLimitAttemptMulti(rateLimitKey, emailRateLimitKey);

  if (blocked) {
    return NextResponse.json(
      { error: "rateLimited" },
      { status: 429 }
    );
  }

  const baseUrl = getPublicBaseUrl(
    req.headers.get("host"),
    req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(/:$/, "")
  );
  const result = await sendPasswordResetEmail(email, baseUrl);

  if (!result.success) {
    if (result.error === "user_not_found" || result.error === "no_email") {
      return NextResponse.json({ success: true });
    }
    if (result.error === "email_not_configured") {
      return NextResponse.json({ error: "emailNotConfigured" }, { status: 503 });
    }
    return NextResponse.json({ error: "sendFailed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

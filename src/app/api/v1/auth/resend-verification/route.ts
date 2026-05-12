import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendEmailVerification } from "@/lib/email";
import { consumeRateLimitAttemptMulti, getRateLimitKey } from "@/lib/security/rate-limit";

const resendSchema = z.object({
  userId: z.string().min(1),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const parsed = resendSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalidRequest" }, { status: 400 });
  }

  const { userId } = parsed.data;
  const rateLimitKey = getRateLimitKey("resend_verification", req.headers);
  const userRateLimitKey = `resend_verification:user:${userId}`;

  const blocked = await consumeRateLimitAttemptMulti(rateLimitKey, userRateLimitKey);

  if (blocked) {
    return NextResponse.json(
      { error: "rateLimited" },
      { status: 429 }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_AUTH_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const result = await sendEmailVerification(userId, baseUrl);

  if (!result.success) {
    if (result.error === "email_not_configured") {
      return NextResponse.json({ error: "emailNotConfigured" }, { status: 503 });
    }
    if (result.error === "already_verified") {
      return NextResponse.json({ error: "alreadyVerified" }, { status: 400 });
    }
    if (result.error === "user_not_found") {
      return NextResponse.json({ error: "userNotFound" }, { status: 404 });
    }
    if (result.error === "no_email") {
      return NextResponse.json({ error: "noEmail" }, { status: 400 });
    }
    return NextResponse.json({ error: "sendFailed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

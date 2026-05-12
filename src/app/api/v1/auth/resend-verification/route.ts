import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendEmailVerification } from "@/lib/email";
import { consumeRateLimitAttemptMulti, getRateLimitKey } from "@/lib/security/rate-limit";
import { createApiHandler } from "@/lib/api/handler";

const resendSchema = z.object({
  userId: z.string().min(1),
});

export const POST = createApiHandler({
  auth: true,
  rateLimit: "auth:resend-verification",
  schema: resendSchema,
  handler: async (req: NextRequest, { user, body }) => {
    // Users can only request verification emails for their own account.
    // This prevents attackers from triggering emails for arbitrary users.
    if (body.userId !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const rateLimitKey = getRateLimitKey("resend_verification", req.headers);
    const userRateLimitKey = `resend_verification:user:${body.userId}`;

    const blocked = await consumeRateLimitAttemptMulti(rateLimitKey, userRateLimitKey);

    if (blocked) {
      return NextResponse.json(
        { error: "rateLimited" },
        { status: 429 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_AUTH_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    const result = await sendEmailVerification(body.userId, baseUrl);

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
  },
});

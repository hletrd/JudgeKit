import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyEmail } from "@/lib/email";

const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const parsed = verifyEmailSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalidRequest" }, { status: 400 });
  }

  const { token } = parsed.data;
  const result = await verifyEmail(token);

  if (!result.success) {
    if (result.error === "invalid_token" || result.error === "expired") {
      return NextResponse.json({ error: "invalidOrExpiredToken" }, { status: 400 });
    }
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

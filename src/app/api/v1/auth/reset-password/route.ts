import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resetPassword, validatePasswordResetToken } from "@/lib/email";
import { getSystemSettings } from "@/lib/system-settings";

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const parsed = resetPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalidRequest" }, { status: 400 });
  }

  const { token, password } = parsed.data;

  const validation = await validatePasswordResetToken(token);
  if (!validation.valid) {
    return NextResponse.json({ error: "invalidOrExpiredToken" }, { status: 400 });
  }

  const settings = await getSystemSettings();
  const minLength = settings?.minPasswordLength ?? 8;

  if (password.length < minLength) {
    return NextResponse.json(
      { error: "passwordTooShort", minLength },
      { status: 400 }
    );
  }

  const result = await resetPassword(token, password, minLength);

  if (!result.success) {
    if (result.error === "invalid_token" || result.error === "already_used") {
      return NextResponse.json({ error: "invalidOrExpiredToken" }, { status: 400 });
    }
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

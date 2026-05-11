import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { sendEmail, isEmailConfigured } from "@/lib/email/smtp";

const testEmailSchema = z.object({
  to: z.string().email(),
});

export const POST = createApiHandler({
  auth: { capabilities: ["system.settings"] },
  schema: testEmailSchema,
  handler: async (_req: NextRequest, { body }) => {
    const { to } = body;

    if (!(await isEmailConfigured())) {
      return NextResponse.json({ error: "emailNotConfigured" }, { status: 503 });
    }

    const result = await sendEmail({
      to,
      subject: "JudgeKit SMTP Test",
      text: "This is a test email from JudgeKit. If you received this, your SMTP configuration is working correctly.",
      html: "<p>This is a test email from JudgeKit.</p><p>If you received this, your SMTP configuration is working correctly.</p>",
    });

    if (!result.success) {
      return NextResponse.json(
        { error: "sendFailed", detail: result.error },
        { status: 500 }
      );
    }

    return apiSuccess({ sent: true, messageId: result.messageId });
  },
});

import { z } from "zod";
import { normalizeOptionalString } from "@/lib/validators/preprocess";
import { FIXED_MIN_PASSWORD_LENGTH } from "@/lib/security/password";

export const publicSignupSchema = z.object({
  username: z.preprocess(normalizeOptionalString, z.string().min(3, "usernameTooShort").max(50, "usernameTooLong")),
  name: z.preprocess(normalizeOptionalString, z.string().min(1, "nameRequired").max(100, "nameTooLong")),
  email: z.preprocess(
    normalizeOptionalString,
    z.string().email("invalidEmail").max(255, "emailTooLong").optional(),
  ),
  password: z.string().min(FIXED_MIN_PASSWORD_LENGTH, "passwordTooShort").max(256, "passwordTooLong"),
  confirmPassword: z.string().min(1, "confirmPasswordRequired"),
  captchaToken: z.preprocess(normalizeOptionalString, z.string().optional()),
}).superRefine((data, ctx) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmPassword"],
      message: "passwordsDoNotMatch",
    });
  }
});

export type PublicSignupInput = z.infer<typeof publicSignupSchema>;

import { z } from "zod";
import { normalizeOptionalString, trimString } from "@/lib/validators/preprocess";
import { VALID_THEME_IDS } from "@/lib/code/problem-code-themes";

export const updateProfileSchema = z.object({
  name: z.preprocess(
    trimString,
    z.string().min(1, "nameRequired").max(100, "nameTooLong")
  ),
  className: z.preprocess(
    normalizeOptionalString,
    z.string().max(100, "classNameTooLong").optional()
  ),
  preferredLanguage: z.preprocess(
    normalizeOptionalString,
    z.string().max(50).optional()
  ),
  preferredTheme: z.preprocess(
    normalizeOptionalString,
    z.enum(["light", "dark", "system"]).optional()
  ),
  editorTheme: z.preprocess(
    normalizeOptionalString,
    z.enum(VALID_THEME_IDS).optional()
  ),
  editorFontSize: z.string().max(5).optional(),
  editorFontFamily: z.string().max(100).optional(),
});

export const adminUpdateUserSchema = updateProfileSchema.extend({
  email: z.preprocess(
    normalizeOptionalString,
    z.string().email("invalidEmail").max(255, "invalidEmail").optional()
  ),
  username: z.preprocess(
    trimString,
    z
      .string()
      .min(2, "usernameTooShort")
      .max(50, "usernameTooLong")
      .regex(/^[a-zA-Z0-9_-]+$/, "usernameInvalidChars")
      .toLowerCase()
      .optional()
  ),
});

export const userCreateSchema = adminUpdateUserSchema.extend({
  username: z.preprocess(
    trimString,
    z
      .string()
      .min(2, "usernameTooShort")
      .max(50, "usernameTooLong")
      .regex(/^[a-zA-Z0-9_-]+$/, "usernameInvalidChars")
      .toLowerCase()
  ),
  role: z.preprocess(trimString, z.enum(["student", "instructor", "admin", "super_admin"], { message: "invalidRole" })),
  password: z.string().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;

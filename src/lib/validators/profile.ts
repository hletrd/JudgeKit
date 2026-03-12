import { z } from "zod";
import { normalizeOptionalString, trimString } from "@/lib/validators/preprocess";

export const updateProfileSchema = z.object({
  name: z.preprocess(
    trimString,
    z.string().min(1, "nameRequired").max(100, "nameTooLong")
  ),
  className: z.preprocess(
    normalizeOptionalString,
    z.string().max(100, "classNameTooLong").optional()
  ),
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
  ),
  role: z.preprocess(trimString, z.enum(["student", "instructor", "admin", "super_admin"], { message: "invalidRole" })),
  password: z.string().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;

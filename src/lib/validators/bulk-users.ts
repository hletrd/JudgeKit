import { z } from "zod";

const bulkUserItemSchema = z.object({
  username: z.string().min(2).max(50).trim().regex(/^[a-zA-Z0-9_-]+$/, "usernameInvalidChars"),
  name: z.string().min(1).max(100).trim(),
  password: z.string().min(8).max(128).trim(),
  email: z.string().email().optional().or(z.literal("")),
  role: z.enum(["student", "instructor"]).default("student"),
  className: z.string().max(50).trim().optional().or(z.literal("")),
});

export const bulkUserCreateSchema = z.object({
  users: z.array(bulkUserItemSchema).min(1).max(200),
});

export type BulkUserItem = z.infer<typeof bulkUserItemSchema>;
export type BulkUserCreateInput = z.infer<typeof bulkUserCreateSchema>;

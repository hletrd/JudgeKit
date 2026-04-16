import { z } from "zod";

export const contestAnnouncementCreateSchema = z.object({
  title: z.string().trim().min(1, "announcementTitleRequired").max(200, "announcementTitleTooLong"),
  content: z.string().trim().min(1, "announcementContentRequired").max(10000, "announcementContentTooLong"),
  isPinned: z.boolean().optional(),
});

export const contestAnnouncementUpdateSchema = z
  .object({
    title: z.string().trim().min(1, "announcementTitleRequired").max(200, "announcementTitleTooLong").optional(),
    content: z.string().trim().min(1, "announcementContentRequired").max(10000, "announcementContentTooLong").optional(),
    isPinned: z.boolean().optional(),
  })
  .refine((value) => value.title !== undefined || value.content !== undefined || value.isPinned !== undefined, {
    message: "announcementUpdateRequired",
  });

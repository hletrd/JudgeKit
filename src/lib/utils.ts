import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { stripHiddenNotes } from "@/lib/problem-hidden-notes"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Strip markdown syntax and HTML tags for use in meta descriptions. */
export function stripMarkdownForMeta(text: string): string {
  return stripHiddenNotes(text)
    .replace(/<[^>]*>/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/[#*_~\[\]()>|\\]/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

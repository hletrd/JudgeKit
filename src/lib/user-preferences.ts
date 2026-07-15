import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/** Editor / UI preferences stored per user. */
export type UserPreferences = {
  preferredLanguage: string | null;
  preferredTheme: string | null;
  shareAcceptedSolutions: boolean;
  acceptedSolutionsAnonymous: boolean;
  editorTheme: string | null;
  editorFontSize: string | null;
  editorFontFamily: string | null;
  lectureMode: string | null;
  lectureFontScale: string | null;
  lectureColorScheme: string | null;
};

export const PREFERENCE_DEFAULTS: UserPreferences = {
  preferredLanguage: null,
  preferredTheme: null,
  // Opt-in model: accepted solutions are PRIVATE unless the user explicitly
  // enables sharing. (Was opt-out before the privacy fix that also turned
  // sharing off for every existing account.)
  shareAcceptedSolutions: false,
  acceptedSolutionsAnonymous: false,
  editorTheme: null,
  editorFontSize: null,
  editorFontFamily: null,
  lectureMode: null,
  lectureFontScale: null,
  lectureColorScheme: null,
};

/**
 * Read a user's editor/UI preferences from the database, cached per request via
 * React cache(). Preferences used to ride in the JWT/session token; they are
 * now fetched on demand here so the session token stays small and preference
 * changes take effect without a token refresh.
 */
export const getUserPreferences = cache(
  async (userId: string): Promise<UserPreferences> => {
    const row = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        preferredLanguage: true,
        preferredTheme: true,
        shareAcceptedSolutions: true,
        acceptedSolutionsAnonymous: true,
        editorTheme: true,
        editorFontSize: true,
        editorFontFamily: true,
        lectureMode: true,
        lectureFontScale: true,
        lectureColorScheme: true,
      },
    });

    if (!row) return { ...PREFERENCE_DEFAULTS };

    return {
      preferredLanguage: row.preferredLanguage ?? null,
      preferredTheme: row.preferredTheme ?? null,
      shareAcceptedSolutions: row.shareAcceptedSolutions ?? false,
      acceptedSolutionsAnonymous: row.acceptedSolutionsAnonymous ?? false,
      editorTheme: row.editorTheme ?? null,
      editorFontSize: row.editorFontSize ?? null,
      editorFontFamily: row.editorFontFamily ?? null,
      lectureMode: row.lectureMode ?? null,
      lectureFontScale: row.lectureFontScale ?? null,
      lectureColorScheme: row.lectureColorScheme ?? null,
    };
  },
);

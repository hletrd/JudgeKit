/**
 * Shared type for authenticated user data extracted from the database
 * during login/token authorization flows. Used by both config.ts and
 * recruiting-token.ts to ensure consistency.
 */
export type AuthUserRecord = {
  id: string;
  username: string;
  email: string | null;
  name: string;
  className: string | null;
  role: string;
  mustChangePassword: boolean | null;
  preferredLanguage?: string | null;
  preferredTheme?: string | null;
  shareAcceptedSolutions?: boolean;
  acceptedSolutionsAnonymous?: boolean;
  editorTheme?: string | null;
  editorFontSize?: string | null;
  editorFontFamily?: string | null;
  lectureMode?: string | null;
  lectureFontScale?: string | null;
  lectureColorScheme?: string | null;
};

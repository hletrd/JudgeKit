/**
 * Auth-relevant preference field names on the DB `users` table.
 * Central definition shared by config.ts (DB columns, mapUserToAuthFields)
 * and session-security.ts (AUTH_TOKEN_FIELDS derivation).
 * When adding a new preference field, add it HERE and to `AuthUserRecord`
 * — the rest is derived automatically.
 *
 * Security fields (mustChangePassword, isActive, tokenInvalidatedAt) are
 * NOT preference fields and are handled separately in AUTH_CORE_FIELDS.
 */
export const AUTH_PREFERENCE_FIELDS = [
  "preferredLanguage",
  "preferredTheme",
  "shareAcceptedSolutions",
  "acceptedSolutionsAnonymous",
  "editorTheme",
  "editorFontSize",
  "editorFontFamily",
  "lectureMode",
  "lectureFontScale",
  "lectureColorScheme",
] as const;

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
  mustChangePassword: boolean;
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

/**
 * Looser input type accepted by mapUserToAuthFields and syncTokenWithUser.
 * Allows null/undefined on fields where the DB or NextAuth types may differ
 * from AuthUserRecord (e.g., mustChangePassword is boolean|null in the DB
 * but boolean in AuthUserRecord; id is string|undefined in NextAuth User).
 * Defaults are applied inside mapUserToAuthFields.
 */
export type AuthUserInput = {
  id?: string;
  username?: string;
  email?: string | null;
  name?: string | null;
  className?: string | null;
  role?: string;
  mustChangePassword?: boolean | null;
  preferredLanguage?: string | null;
  preferredTheme?: string | null;
  shareAcceptedSolutions?: boolean | null;
  acceptedSolutionsAnonymous?: boolean | null;
  editorTheme?: string | null;
  editorFontSize?: string | null;
  editorFontFamily?: string | null;
  lectureMode?: string | null;
  lectureFontScale?: string | null;
  lectureColorScheme?: string | null;
};

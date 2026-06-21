import { describe, expect, it } from "vitest";
import { AUTH_PREFERENCE_FIELDS } from "@/lib/auth/types";

/**
 * AUTH_PREFERENCE_FIELDS is the canonical list of per-user preference fields,
 * now read on demand via getUserPreferences() rather than carried in the
 * session token. These tests verify the list stays complete and that
 * mapTokenToSession does NOT reintroduce preferences into the session token.
 */
describe("user preference fields", () => {
  it("AUTH_PREFERENCE_FIELDS contains all expected preference fields", () => {
    const expectedFields = [
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
    ];

    for (const field of expectedFields) {
      expect(AUTH_PREFERENCE_FIELDS).toContain(field);
    }
    expect(AUTH_PREFERENCE_FIELDS).toHaveLength(expectedFields.length);
  });

  it("mapTokenToSession does not carry preference fields into the session", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(process.cwd(), "src/lib/auth/config.ts"), "utf8");

    const mapTokenFn = source.match(
      /function mapTokenToSession\([\s\S]*?\n\}/
    );
    expect(mapTokenFn).not.toBeNull();

    // Preferences were moved out of the token (read via getUserPreferences),
    // so the session mapper must not reference the preference list or any
    // individual preference field — guards against accidental reintroduction.
    expect(mapTokenFn![0]).not.toContain("AUTH_PREFERENCE_FIELDS");
    for (const field of AUTH_PREFERENCE_FIELDS) {
      expect(mapTokenFn![0]).not.toContain(field);
    }
  });
});

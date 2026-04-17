import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { DEFAULT_JUDGE_LANGUAGES, serializeJudgeCommand } from "./languages";


async function doSync(): Promise<boolean> {
  const existing = await db
    .select({
      language: languageConfigs.language,
      runCommand: languageConfigs.runCommand,
      compileCommand: languageConfigs.compileCommand,
    })
    .from(languageConfigs);

  const existingMap = new Map(existing.map((r) => [r.language, r]));
  let inserted = 0;
  let updated = 0;

  for (const lang of DEFAULT_JUDGE_LANGUAGES) {
    const record = existingMap.get(lang.language);
    const compileCmd = serializeJudgeCommand(lang.compileCommand);
    const runCmd = serializeJudgeCommand(lang.runCommand) ?? "";

    if (!record) {
      await db.insert(languageConfigs).values({
        id: nanoid(),
        language: lang.language,
        displayName: lang.displayName,
        extension: lang.extension,
        dockerImage: lang.dockerImage,
        compiler: lang.compiler ?? null,
        runCommand: runCmd,
        isEnabled: true,
        updatedAt: new Date(),
        ...(lang.standard ? { standard: lang.standard } : {}),
        ...(compileCmd ? { compileCommand: compileCmd } : {}),
      });
      inserted++;
      continue;
    }

    if (record.runCommand !== runCmd || record.compileCommand !== (compileCmd ?? null)) {
      await db
        .update(languageConfigs)
        .set({
          runCommand: runCmd,
          compileCommand: compileCmd ?? null,
          updatedAt: new Date(),
        })
        .where(eq(languageConfigs.language, lang.language));
      updated++;
    }
  }

  if (inserted > 0) {
    console.log(`[language-sync] inserted ${inserted} new language configs`);
  }
  if (updated > 0) {
    console.log(`[language-sync] back-filled commands for ${updated} existing configs`);
  }
  return true;
}

export async function syncLanguageConfigsOnStartup() {
  const MAX_SYNC_RETRIES = 10;
  const MAX_BACKOFF_MS = 30_000;

  // Single retry loop — no nested setTimeout chains
  for (let attempt = 0; attempt <= MAX_SYNC_RETRIES; attempt++) {
    try {
      await doSync();
      return; // success
    } catch {
      if (attempt >= MAX_SYNC_RETRIES) {
        console.error("[sync] Max retries exceeded, giving up");
        throw new Error("[sync] Failed to sync language configs after max retries");
      }
      // Table may not exist yet (pre-migration). Retry with exponential backoff.
      const delay = Math.min(1000 * Math.pow(2, attempt), MAX_BACKOFF_MS);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

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
  let retryCount = 0;

  try {
    await doSync();
  } catch {
    // Table may not exist yet (pre-migration). Schedule retries with exponential backoff.
    const retry = () => {
      setTimeout(async () => {
        retryCount++;
        if (retryCount >= MAX_SYNC_RETRIES) {
          console.error("[sync] Max retries exceeded, giving up");
          return;
        }
        try {
          await doSync();
        } catch {
          const delay = Math.min(1000 * Math.pow(2, retryCount), MAX_BACKOFF_MS);
          setTimeout(retry, delay);
        }
      }, Math.min(1000 * Math.pow(2, retryCount), MAX_BACKOFF_MS));
    };
    retry();
  }
}

import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { DEFAULT_JUDGE_LANGUAGES, serializeJudgeCommand } from "./languages";
import { logger } from "@/lib/logger";
import { getDbNowUncached } from "@/lib/db-time";


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
  let backfilled = 0;

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
        updatedAt: await getDbNowUncached(),
        ...(lang.standard ? { standard: lang.standard } : {}),
        ...(compileCmd ? { compileCommand: compileCmd } : {}),
      });
      inserted++;
      continue;
    }

    const updates: { runCommand?: string; compileCommand?: string | null } = {};
    if (!record.runCommand && runCmd) {
      updates.runCommand = runCmd;
    }
    if (record.compileCommand == null && compileCmd) {
      updates.compileCommand = compileCmd;
    }

    if (Object.keys(updates).length > 0) {
      await db
        .update(languageConfigs)
        .set({
          ...updates,
          updatedAt: await getDbNowUncached(),
        })
        .where(eq(languageConfigs.language, lang.language));
      backfilled++;
    }
  }

  if (inserted > 0) {
    logger.info({ inserted }, "[language-sync] inserted new language configs");
  }
  if (backfilled > 0) {
    logger.info({ backfilled }, "[language-sync] back-filled missing commands for existing configs");
  }
  return true;
}

export async function syncLanguageConfigsOnStartup() {
  // Explicit opt-out for local dev and sandboxed runtime review lanes
  // (e.g. the RPF loop's designer runtime review). Requires the literal
  // string "1" to avoid accidentally skipping in production where the env
  // loader may coerce other truthy values. Not a production concern:
  // production uses DATABASE_URL pointing at a real DB and should never
  // set this flag. See plans/open/2026-04-23-rpf-cycle-55-review-remediation.md
  // (lane A2) and .context/reviews/designer-runtime-cycle-3.md.
  if (process.env.SKIP_INSTRUMENTATION_SYNC === "1") {
    logger.warn(
      "[sync] SKIP_INSTRUMENTATION_SYNC=1 — skipping language-config startup sync. DO NOT use this in production."
    );
    return;
  }

  const MAX_SYNC_RETRIES = 10;
  const MAX_BACKOFF_MS = 30_000;

  // Single retry loop — no nested setTimeout chains
  for (let attempt = 0; attempt <= MAX_SYNC_RETRIES; attempt++) {
    try {
      await doSync();
      return; // success
    } catch (err) {
      if (attempt >= MAX_SYNC_RETRIES) {
        logger.error({ err }, "[sync] Max retries exceeded, giving up");
        throw new Error("[sync] Failed to sync language configs after max retries");
      }
      // Table may not exist yet (pre-migration). Retry with exponential backoff.
      const delay = Math.min(1000 * Math.pow(2, attempt), MAX_BACKOFF_MS);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

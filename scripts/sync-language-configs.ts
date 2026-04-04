import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as schema from "../src/lib/db/schema.pg";
import { DEFAULT_JUDGE_LANGUAGES, serializeJudgeCommand } from "../src/lib/judge/languages";

type ExistingLanguageConfigRow = {
  language: string;
  displayName: string;
  standard: string | null;
  extension: string;
  dockerImage: string;
  compiler: string | null;
  compileCommand: string | null;
  runCommand: string;
};

function hasManagedMetadataChanges(
  existing: ExistingLanguageConfigRow,
  expected: Omit<ExistingLanguageConfigRow, "language">
) {
  return (
    existing.displayName !== expected.displayName ||
    existing.standard !== expected.standard ||
    existing.extension !== expected.extension ||
    existing.dockerImage !== expected.dockerImage ||
    existing.compiler !== expected.compiler ||
    existing.compileCommand !== expected.compileCommand ||
    existing.runCommand !== expected.runCommand
  );
}

async function syncLanguageConfigs() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  const existingLanguages = new Map(
    (await db
      .select({
        language: schema.languageConfigs.language,
        displayName: schema.languageConfigs.displayName,
        standard: schema.languageConfigs.standard,
        extension: schema.languageConfigs.extension,
        dockerImage: schema.languageConfigs.dockerImage,
        compiler: schema.languageConfigs.compiler,
        compileCommand: schema.languageConfigs.compileCommand,
        runCommand: schema.languageConfigs.runCommand,
      })
      .from(schema.languageConfigs))
      .map((row) => [row.language, row] as const)
  );
  const insertedLanguages: string[] = [];
  const updatedLanguages: string[] = [];

  for (const language of DEFAULT_JUDGE_LANGUAGES) {
    const compileCommand = serializeJudgeCommand(language.compileCommand);
    const existing = existingLanguages.get(language.language);
    const expectedValues = {
      displayName: language.displayName,
      standard: language.standard ?? null,
      extension: language.extension,
      dockerImage: language.dockerImage,
      compiler: language.compiler ?? null,
      compileCommand: compileCommand ?? null,
      runCommand: language.runCommand.join(" "),
    };

    if (!existing) {
      await db.insert(schema.languageConfigs)
        .values({
          id: nanoid(),
          language: language.language,
          displayName: expectedValues.displayName,
          extension: expectedValues.extension,
          dockerImage: expectedValues.dockerImage,
          compiler: expectedValues.compiler,
          runCommand: expectedValues.runCommand,
          isEnabled: true,
          updatedAt: new Date(),
          ...(expectedValues.standard ? { standard: expectedValues.standard } : {}),
          ...(expectedValues.compileCommand ? { compileCommand: expectedValues.compileCommand } : {}),
        });

      insertedLanguages.push(language.language);
      continue;
    }

    if (!hasManagedMetadataChanges(existing, expectedValues)) {
      continue;
    }

    await db.update(schema.languageConfigs)
      .set({
        displayName: expectedValues.displayName,
        standard: expectedValues.standard,
        extension: expectedValues.extension,
        dockerImage: expectedValues.dockerImage,
        compiler: expectedValues.compiler,
        compileCommand: expectedValues.compileCommand,
        runCommand: expectedValues.runCommand,
        updatedAt: new Date(),
      })
      .where(eq(schema.languageConfigs.language, language.language));

    updatedLanguages.push(language.language);
  }

  await pool.end();

  if (insertedLanguages.length === 0 && updatedLanguages.length === 0) {
    console.log("Language configs already synchronized.");
    return;
  }

  if (insertedLanguages.length > 0) {
    console.log(`Inserted language configs: ${insertedLanguages.join(", ")}`);
  }

  if (updatedLanguages.length > 0) {
    console.log(`Updated language configs: ${updatedLanguages.join(", ")}`);
  }
}

syncLanguageConfigs().catch((error) => {
  console.error("Failed to synchronize language configs:", error);
  process.exit(1);
});

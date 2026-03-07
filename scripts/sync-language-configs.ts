import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import path from "path";
import fs from "fs";
import * as schema from "../src/lib/db/schema";
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
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, "judge.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  const existingLanguages = new Map(
    db
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
      .from(schema.languageConfigs)
      .all()
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
      db.insert(schema.languageConfigs)
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
        })
        .run();

      insertedLanguages.push(language.language);
      continue;
    }

    if (!hasManagedMetadataChanges(existing, expectedValues)) {
      continue;
    }

    db.update(schema.languageConfigs)
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
      .where(eq(schema.languageConfigs.language, language.language))
      .run();

    updatedLanguages.push(language.language);
  }

  sqlite.close();

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

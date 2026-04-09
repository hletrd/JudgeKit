#!/usr/bin/env tsx
/**
 * Legacy migration helper for importing a portable JSON export into the
 * current PostgreSQL-backed JudgeKit runtime.
 *
 * NOTE:
 * - The live JudgeKit runtime is PostgreSQL-only.
 * - The historical SQLite export path previously documented here is no longer
 *   supported by the current runtime stack.
 */

import fs from "fs";
import path from "path";

const command = process.argv[2] ?? "export";
const outputPath = process.argv[3] ?? path.join(process.cwd(), "data", "export.json");

async function doExport() {
  if (!process.env.DATABASE_URL) {
    console.error("Export mode now requires a live PostgreSQL DATABASE_URL.");
    console.error("The legacy SQLite export flow is no longer supported by the current runtime.");
    console.error("Use the admin streamed export routes or run this script against a PostgreSQL-backed environment.");
    process.exit(1);
  }

  console.log(`Exporting from PostgreSQL database`);

  const { streamDatabaseExport } = await import("../src/lib/db/export");

  // Ensure output directory exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const stream = streamDatabaseExport();
  const reader = stream.getReader();
  const fileHandle = fs.createWriteStream(outputPath, { encoding: "utf8" });
  let bytesWritten = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      bytesWritten += chunk.length;
      await new Promise<void>((resolve, reject) => {
        fileHandle.write(chunk, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      fileHandle.end((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    reader.releaseLock();
  }

  console.log(`\nExport complete:`);
  console.log(`  File: ${outputPath}`);
  console.log(`  Size: ${(bytesWritten / 1024 / 1024).toFixed(2)} MB`);
  console.log("  Export written via streaming JSON serializer (row counts omitted to avoid re-loading the file)");

  console.log(`\nNext steps:`);
  console.log(`  1. Start the PostgreSQL stack:`);
  console.log(`     docker compose -f docker-compose.production.yml up -d`);
  console.log(`  2. Push schema to PostgreSQL:`);
  console.log(`     DATABASE_URL=postgres://... npx drizzle-kit push`);
  console.log(`  3. Import data (option A — via API):`);
  console.log(`     curl -X POST http://localhost:3100/api/v1/admin/migrate/import \\`);
  console.log(`       -H "Content-Type: application/json" \\`);
  console.log(`       -H "Cookie: <admin-session-cookie>" \\`);
  console.log(`       -d @${outputPath}`);
  console.log(`  4. Or import directly (option B — via script):`);
  console.log(`     DB_DIALECT=postgresql DATABASE_URL=postgres://... tsx scripts/migrate-sqlite-to-pg.ts import`);
}

async function doImport() {
  if (!fs.existsSync(outputPath)) {
    console.error(`Export file not found at: ${outputPath}`);
    console.error(`Run the export step first: tsx scripts/migrate-sqlite-to-pg.ts export`);
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error(`DATABASE_URL is required for PostgreSQL import`);
    process.exit(1);
  }

  console.log(`Loading export from: ${outputPath}`);
  const data = JSON.parse(fs.readFileSync(outputPath, "utf-8"));

  console.log(`Importing into PostgreSQL at: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);

  const { importDatabase } = await import("../src/lib/db/import");
  const result = await importDatabase(data);

  if (result.success) {
    console.log(`\nImport successful:`);
    console.log(`  Tables imported: ${result.tablesImported}`);
    console.log(`  Total rows imported: ${result.totalRowsImported}`);
    for (const [name, stats] of Object.entries(result.tableResults)) {
      if (stats.imported > 0 || stats.skipped > 0) {
        console.log(`    ${name}: ${stats.imported} imported, ${stats.skipped} skipped`);
      }
    }
  } else {
    console.error(`\nImport failed:`);
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  if (result.errors.length > 0) {
    console.warn(`\nWarnings:`);
    for (const err of result.errors) {
      console.warn(`  - ${err}`);
    }
  }
}

async function main() {
  switch (command) {
    case "export":
      await doExport();
      break;
    case "import":
      await doImport();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error(`Usage: tsx scripts/migrate-sqlite-to-pg.ts [export|import] [path]`);
      process.exit(1);
  }
}

void main();

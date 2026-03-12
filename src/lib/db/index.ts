import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import * as relations from "./relations";
import path from "path";
import fs from "fs";

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(process.cwd(), "data", "judge.db");

const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
}
const sqlite = new Database(dbPath);
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema: { ...schema, ...relations } });
export { sqlite };
export type DbType = typeof db;

try {
  for (const ext of ["", "-wal", "-shm"]) {
    const p = dbPath + ext;
    if (fs.existsSync(p)) {
      fs.chmodSync(p, 0o600);
    }
  }
} catch {
  // non-fatal
}

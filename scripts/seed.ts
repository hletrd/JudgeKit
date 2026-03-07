import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { nanoid } from "nanoid";
import * as schema from "../src/lib/db/schema";
import path from "path";
import fs from "fs";

async function seed() {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, "judge.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  // Seed super admin
  const existingAdmin = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.role, "super_admin"))
    .get();

  if (existingAdmin) {
    console.log("Super admin already exists, skipping user seed.");
  } else {
    const passwordHash = await hash("admin123", 12);

    db.insert(schema.users)
      .values({
        id: nanoid(),
        email: "admin@example.com",
        name: "Super Admin",
        passwordHash,
        role: "super_admin",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();

    console.log("Seeded super admin user:");
    console.log("  Email: admin@example.com");
    console.log("  Password: admin123");
    console.log("  Role: super_admin");
  }

  // Seed default language configs
  const existingLangs = db
    .select()
    .from(schema.languageConfigs)
    .all();

  if (existingLangs.length === 0) {
    const languages = [
      {
        id: nanoid(),
        language: "c",
        displayName: "C",
        extension: ".c",
        dockerImage: "judge-cpp:latest",
        compileCommand: "gcc -O2 -std=c11 -o /workspace/solution /workspace/solution.c -lm",
        runCommand: "/workspace/solution",
        isEnabled: true,
        updatedAt: new Date(),
      },
      {
        id: nanoid(),
        language: "cpp",
        displayName: "C++",
        extension: ".cpp",
        dockerImage: "judge-cpp:latest",
        compileCommand: "g++ -O2 -std=c++17 -o /workspace/solution /workspace/solution.cpp",
        runCommand: "/workspace/solution",
        isEnabled: true,
        updatedAt: new Date(),
      },
      {
        id: nanoid(),
        language: "python",
        displayName: "Python",
        extension: ".py",
        dockerImage: "judge-python:latest",
        compileCommand: null,
        runCommand: "python3 /workspace/solution.py",
        isEnabled: true,
        updatedAt: new Date(),
      },
    ];

    for (const lang of languages) {
      db.insert(schema.languageConfigs).values(lang).run();
    }

    console.log("Seeded default language configs: C, C++, Python");
  } else {
    console.log("Language configs already exist, skipping.");
  }

  sqlite.close();
}

seed().catch(console.error);

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
        username: "admin", email: "admin@example.com",
        name: "Super Admin",
        passwordHash,
        role: "super_admin",
        isActive: true,
        mustChangePassword: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();

    console.log("Seeded super admin user:");
    console.log("  Username: admin");
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
        language: "c17",
        displayName: "C",
        standard: "C17",
        extension: ".c",
        dockerImage: "judge-cpp:latest",
        compiler: "GCC (gcc)",
        compileCommand: "gcc -O2 -std=c17 -o /workspace/solution /workspace/solution.c -lm",
        runCommand: "/workspace/solution",
        isEnabled: true,
        updatedAt: new Date(),
      },
      {
        id: nanoid(),
        language: "c23",
        displayName: "C",
        standard: "C23",
        extension: ".c",
        dockerImage: "judge-cpp:latest",
        compiler: "GCC (gcc)",
        compileCommand: "gcc -O2 -std=c23 -o /workspace/solution /workspace/solution.c -lm",
        runCommand: "/workspace/solution",
        isEnabled: true,
        updatedAt: new Date(),
      },
      {
        id: nanoid(),
        language: "cpp20",
        displayName: "C++20",
        standard: "C++20",
        extension: ".cpp",
        dockerImage: "judge-cpp:latest",
        compiler: "GCC (g++)",
        compileCommand: "g++ -O2 -std=c++20 -o /workspace/solution /workspace/solution.cpp",
        runCommand: "/workspace/solution",
        isEnabled: true,
        updatedAt: new Date(),
      },
      {
        id: nanoid(),
        language: "cpp23",
        displayName: "C++23",
        standard: "C++23",
        extension: ".cpp",
        dockerImage: "judge-cpp:latest",
        compiler: "GCC (g++)",
        compileCommand: "g++ -O2 -std=c++23 -o /workspace/solution /workspace/solution.cpp",
        runCommand: "/workspace/solution",
        isEnabled: true,
        updatedAt: new Date(),
      },
      {
        id: nanoid(),
        language: "python",
        displayName: "Python 3",
        standard: null,
        extension: ".py",
        dockerImage: "judge-python:latest",
        compiler: "CPython",
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

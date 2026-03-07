import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { nanoid } from "nanoid";
import * as schema from "../src/lib/db/schema";
import { DEFAULT_JUDGE_LANGUAGES, serializeJudgeCommand } from "../src/lib/judge/languages";
import path from "path";
import fs from "fs";

type SeededProblem = {
  title: string;
  description: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  visibility: "public" | "private" | "hidden";
  tests: Array<{
    input: string;
    expectedOutput: string;
    isVisible: boolean;
  }>;
};

const sampleProblems: SeededProblem[] = [
  {
    title: "A+B",
    description: `
      <h3>Problem</h3>
      <p>Given two integers <strong>A</strong> and <strong>B</strong>, print their sum.</p>
      <h3>Input</h3>
      <p>A single line containing two integers separated by a space.</p>
      <h3>Output</h3>
      <p>Print <code>A + B</code>.</p>
      <h3>Example</h3>
      <pre>Input
1 2

Output
3</pre>
    `.trim(),
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    visibility: "public",
    tests: [
      { input: "1 2\n", expectedOutput: "3\n", isVisible: true },
      { input: "10 20\n", expectedOutput: "30\n", isVisible: true },
      { input: "123 456\n", expectedOutput: "579\n", isVisible: false },
    ],
  },
  {
    title: "A-B",
    description: `
      <h3>Problem</h3>
      <p>Given two integers <strong>A</strong> and <strong>B</strong>, print <code>A - B</code>.</p>
      <h3>Input</h3>
      <p>A single line containing two integers separated by a space.</p>
      <h3>Output</h3>
      <p>Print the difference between the two numbers.</p>
      <h3>Example</h3>
      <pre>Input
7 5

Output
2</pre>
    `.trim(),
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    visibility: "public",
    tests: [
      { input: "7 5\n", expectedOutput: "2\n", isVisible: true },
      { input: "100 7\n", expectedOutput: "93\n", isVisible: true },
      { input: "0 9\n", expectedOutput: "-9\n", isVisible: false },
    ],
  },
  {
    title: "A*B",
    description: `
      <h3>Problem</h3>
      <p>Given two integers <strong>A</strong> and <strong>B</strong>, print their product.</p>
      <h3>Input</h3>
      <p>A single line containing two integers separated by a space.</p>
      <h3>Output</h3>
      <p>Print <code>A × B</code>.</p>
      <h3>Example</h3>
      <pre>Input
3 4

Output
12</pre>
    `.trim(),
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    visibility: "public",
    tests: [
      { input: "3 4\n", expectedOutput: "12\n", isVisible: true },
      { input: "12 11\n", expectedOutput: "132\n", isVisible: true },
      { input: "25 40\n", expectedOutput: "1000\n", isVisible: false },
    ],
  },
  {
    title: "Fibonacci",
    description: `
      <h3>Problem</h3>
      <p>Given a non-negative integer <strong>N</strong>, print the <strong>N</strong>th Fibonacci number.</p>
      <p>Use the definition <code>F(0) = 0</code>, <code>F(1) = 1</code>, and <code>F(n) = F(n-1) + F(n-2)</code> for <code>n ≥ 2</code>.</p>
      <h3>Input</h3>
      <p>A single integer <code>N</code> where <code>0 ≤ N ≤ 40</code>.</p>
      <h3>Output</h3>
      <p>Print the <strong>N</strong>th Fibonacci number.</p>
      <h3>Example</h3>
      <pre>Input
10

Output
55</pre>
    `.trim(),
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    visibility: "public",
    tests: [
      { input: "0\n", expectedOutput: "0\n", isVisible: true },
      { input: "10\n", expectedOutput: "55\n", isVisible: true },
      { input: "20\n", expectedOutput: "6765\n", isVisible: false },
    ],
  },
  {
    title: "Factorial",
    description: `
      <h3>Problem</h3>
      <p>Given a non-negative integer <strong>N</strong>, print <code>N!</code>.</p>
      <h3>Input</h3>
      <p>A single integer <code>N</code> where <code>0 ≤ N ≤ 12</code>.</p>
      <h3>Output</h3>
      <p>Print the factorial of <strong>N</strong>.</p>
      <h3>Example</h3>
      <pre>Input
5

Output
120</pre>
    `.trim(),
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    visibility: "public",
    tests: [
      { input: "0\n", expectedOutput: "1\n", isVisible: true },
      { input: "5\n", expectedOutput: "120\n", isVisible: true },
      { input: "10\n", expectedOutput: "3628800\n", isVisible: false },
    ],
  },
];

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

  let adminUserId = existingAdmin?.id;

  if (existingAdmin) {
    console.log("Super admin already exists, skipping user seed.");
  } else {
    const passwordHash = await hash("admin123", 12);
    adminUserId = nanoid();

    db.insert(schema.users)
      .values({
        id: adminUserId,
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
  const existingLanguageKeys = new Set(
    db.select({ language: schema.languageConfigs.language }).from(schema.languageConfigs).all()
      .map((row) => row.language)
  );
  const insertedLanguages: string[] = [];

  for (const language of DEFAULT_JUDGE_LANGUAGES) {
    if (existingLanguageKeys.has(language.language)) {
      continue;
    }

    const compileCommand = serializeJudgeCommand(language.compileCommand);

    db.insert(schema.languageConfigs)
      .values({
        id: nanoid(),
        language: language.language,
        displayName: language.displayName,
        extension: language.extension,
        dockerImage: language.dockerImage,
        compiler: language.compiler,
        runCommand: language.runCommand.join(" "),
        isEnabled: true,
        updatedAt: new Date(),
        ...(language.standard ? { standard: language.standard } : {}),
        ...(compileCommand ? { compileCommand } : {}),
      })
      .run();

    insertedLanguages.push(language.language);
  }

  if (insertedLanguages.length > 0) {
    console.log(`Seeded missing language configs: ${insertedLanguages.join(", ")}`);
  } else {
    console.log("Language configs already synchronized.");
  }

  if (adminUserId) {
    const seededProblemTitles: string[] = [];

    for (const problem of sampleProblems) {
      const existingProblem = db
        .select({ id: schema.problems.id })
        .from(schema.problems)
        .where(eq(schema.problems.title, problem.title))
        .get();

      if (existingProblem) {
        continue;
      }

      const problemId = nanoid();

      db.insert(schema.problems)
        .values({
          id: problemId,
          title: problem.title,
          description: problem.description,
          timeLimitMs: problem.timeLimitMs,
          memoryLimitMb: problem.memoryLimitMb,
          visibility: problem.visibility,
          authorId: adminUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();

      problem.tests.forEach((testCase, index) => {
        db.insert(schema.testCases)
          .values({
            id: nanoid(),
            problemId,
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
            isVisible: testCase.isVisible,
            sortOrder: index,
          })
          .run();
      });

      seededProblemTitles.push(problem.title);
    }

    if (seededProblemTitles.length > 0) {
      console.log(`Seeded sample problems: ${seededProblemTitles.join(", ")}`);
    } else {
      console.log("Sample problems already exist, skipping.");
    }
  }

  sqlite.close();
}

seed().catch(console.error);

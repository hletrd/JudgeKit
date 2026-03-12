import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { problems, submissions } from "@/lib/db/schema";
import { expect, test } from "./fixtures";

const EDITOR_PLACEHOLDER = "Write your code here...";

const LANGUAGE_SOLUTIONS: Record<string, string> = {
  c17: '#include <stdio.h>\nint main(void) {\n  int a = 0;\n  int b = 0;\n  if (scanf("%d %d", &a, &b) != 2) {\n    return 0;\n  }\n  printf("%d\\n", a + b);\n  return 0;\n}\n',
  c23: '#include <stdio.h>\nint main(void) {\n  int a = 0;\n  int b = 0;\n  if (scanf("%d %d", &a, &b) != 2) {\n    return 0;\n  }\n  printf("%d\\n", a + b);\n  return 0;\n}\n',
  cpp20: '#include <iostream>\nusing namespace std;\n\nint main() {\n  int a = 0;\n  int b = 0;\n  if (!(cin >> a >> b)) {\n    return 0;\n  }\n  cout << a + b << "\\n";\n  return 0;\n}\n',
  cpp23: '#include <iostream>\nusing namespace std;\n\nint main() {\n  int a = 0;\n  int b = 0;\n  if (!(cin >> a >> b)) {\n    return 0;\n  }\n  cout << a + b << "\\n";\n  return 0;\n}\n',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n  var a int\n  var b int\n  if _, err := fmt.Scan(&a, &b); err != nil {\n    return\n  }\n  fmt.Println(a + b)\n}\n',
  javascript:
    'const fs = require("node:fs");\nconst values = fs.readFileSync(0, "utf8").trim().split(/\\s+/).map(Number);\nif (values.length >= 2) {\n  console.log(values[0] + values[1]);\n}\n',
  python: 'a, b = map(int, input().split())\nprint(a + b)\n',
  rust: 'use std::io::{self, Read};\n\nfn main() {\n  let mut input = String::new();\n  io::stdin().read_to_string(&mut input).unwrap();\n  let values: Vec<i32> = input.split_whitespace().filter_map(|part| part.parse().ok()).collect();\n  if values.len() >= 2 {\n    println!("{}", values[0] + values[1]);\n  }\n}\n',
  swift:
    'import Foundation\n\nlet data = FileHandle.standardInput.readDataToEndOfFile()\nlet text = String(data: data, encoding: .utf8) ?? ""\nlet values = text.split(whereSeparator: { $0 == " " || $0 == "\\n" || $0 == "\\t" }).compactMap { Int($0) }\nif values.count >= 2 {\n  print(values[0] + values[1])\n}\n',
  typescript:
    'const fs = require("node:fs");\nconst values = fs.readFileSync(0, "utf8").trim().split(/\\s+/).map(Number);\nif (values.length >= 2) {\n  console.log(values[0] + values[1]);\n}\n',
};

type SubmissionLanguage = {
  displayName: string;
  language: string;
  standard: string | null;
};

async function createProblem(page: Page, title: string) {
  const response = await page.evaluate(async (problemTitle) => {
    const request = await fetch("/api/v1/problems", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        description: "Task 7 unsaved-changes browser history verification.",
        testCases: [
          {
            expectedOutput: "3\n",
            input: "1 2\n",
            isVisible: false,
          },
        ],
        title: problemTitle,
        visibility: "private",
      }),
    });

    return {
      body: await request.json(),
      status: request.status,
    };
  }, title);

  expect(response.status).toBe(201);
  expect(response.body.data?.id).toBeTruthy();

  return response.body.data.id as string;
}

async function resolveSupportedLanguage(page: Page) {
  const response = await page.evaluate(async () => {
    const request = await fetch("/api/v1/languages");
    return (await request.json()).data as SubmissionLanguage[];
  });

  const selected = response.find(({ language }) => language in LANGUAGE_SOLUTIONS);

  expect(selected, "expected at least one supported submission language").toBeTruthy();

  return {
    label: selected!.standard ? `${selected!.displayName} (${selected!.standard})` : selected!.displayName,
    language: selected!.language,
  };
}

async function chooseLanguage(page: Page, languageLabel: string) {
  await page.locator("#language").click();
  await page.getByRole("option", { name: languageLabel, exact: true }).click();
}

async function readEditorText(page: Page) {
  return page.locator("#sourceCode").evaluate((element) => element.textContent ?? "");
}

function normalizeSourceText(source: string) {
  return source.replace(EDITOR_PLACEHOLDER, "").replace(/\s+/g, "").trim();
}

async function expectBackDialog(page: Page, accept: boolean) {
  const dialogPromise = page.waitForEvent("dialog");
  await page.evaluate(() => {
    window.history.back();
  });
  const dialog = await dialogPromise;

  expect(["beforeunload", "confirm"]).toContain(dialog.type());

  if (dialog.type() === "confirm") {
    expect(dialog.message()).toBe("You have unsaved code changes. Leave this page?");
  }

  if (accept) {
    await dialog.accept();
  } else {
    await dialog.dismiss();
  }

  await page.waitForTimeout(250);
}

async function expectNoDialogDuring(page: Page, action: () => Promise<unknown>) {
  let sawDialog = false;

  const dialogListener = async (dialog: import("@playwright/test").Dialog) => {
    sawDialog = true;
    await dialog.dismiss();
  };

  page.on("dialog", dialogListener);

  try {
    await action();
    await page.waitForTimeout(250);
  } finally {
    page.off("dialog", dialogListener);
  }

  expect(sawDialog).toBe(false);
}

test("task 7 guards browser back navigation while dirty and stays clean after submit", async ({
  runtimeAdminPage: page,
  runtimeSuffix,
}) => {
  test.slow();

  const problemTitle = `Task 7 History Guard ${runtimeSuffix.slice(-10)}`;
  const problemId = await createProblem(page, problemTitle);
  const { label, language } = await resolveSupportedLanguage(page);
  const solution = LANGUAGE_SOLUTIONS[language];
  const solutionPreview = normalizeSourceText(solution.trim().split("\n")[0] ?? solution);
  const normalizedSolution = normalizeSourceText(solution);

  try {
    await page.goto("/dashboard/problems", { waitUntil: "networkidle" });
    await page.getByRole("link", { name: problemTitle, exact: true }).click();
    await page.waitForURL(`/dashboard/problems/${problemId}`, { timeout: 15_000 });
    await chooseLanguage(page, label);
    await page.locator("#sourceCode").fill(solution);
    await page.waitForTimeout(700);

    await test.step("browser back stays on the page when the dirty-history dialog is dismissed", async () => {
      await expectBackDialog(page, false);
      await expect(page).toHaveURL(new RegExp(`/dashboard/problems/${problemId}$`));
      await expect.poll(async () => normalizeSourceText(await readEditorText(page))).toContain(solutionPreview);
    });

    await test.step("browser back leaves after the dialog is accepted and the draft restores on return", async () => {
      await expectBackDialog(page, true);
      await expect(page).toHaveURL(/\/dashboard\/problems$/);

      await page.goForward();
      await page.waitForURL(`/dashboard/problems/${problemId}`, { timeout: 15_000 });
      await chooseLanguage(page, label);
      await expect.poll(async () => normalizeSourceText(await readEditorText(page))).toBe(normalizedSolution);
    });

    await test.step("successful submit clears the draft so later back navigation has no warning", async () => {
      await page.getByRole("button", { name: "Submit" }).click();
      await page.getByRole("button", { name: "Send to Judge" }).click();
      await page.waitForURL(/\/dashboard\/submissions\/[^/]+$/, { timeout: 15_000 });

      await expectNoDialogDuring(page, async () => {
        await page.evaluate(() => {
          window.history.back();
        });
        await expect(page).toHaveURL(new RegExp(`/dashboard/problems/${problemId}$`));
      });

      await expect.poll(async () => normalizeSourceText(await readEditorText(page))).toBe("");

      await expectNoDialogDuring(page, async () => {
        await page.evaluate(() => {
          window.history.back();
        });
        await expect(page).toHaveURL(/\/dashboard\/problems$/);
      });
    });
  } finally {
    db.delete(submissions).where(eq(submissions.problemId, problemId)).run();
    db.delete(problems).where(eq(problems.id, problemId)).run();
  }
});

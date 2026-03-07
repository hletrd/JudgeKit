import { captureEvidence } from "./support/evidence";
import { test, expect } from "./fixtures";
import { getPlaywrightBaseUrl } from "./support/runtime-admin";

test("@smoke preserves remediation login, problem, submission, and group flows", async ({
  browser,
  runtimeAdminPage: page,
  runtimeSuffix,
}, testInfo) => {
  test.slow();

  await test.step("land on the dashboard after login", async () => {
    await expect(page).toHaveURL(/\/dashboard$/);
    await captureEvidence(page, testInfo, "dashboard-after-login");
  });

  const suffix = runtimeSuffix.slice(-10);
  const problemTitle = `Playwright Problem ${suffix}`;

  await test.step("create a problem with managed test cases", async () => {
    await page.goto("/dashboard/problems/create", { waitUntil: "networkidle" });
    await page.locator("#title").fill(problemTitle);
    await page.locator("#description").fill("Verify create and edit flows with managed test cases.");
    await page.locator("#visibility").click();
    await page.getByRole("option", { name: "Public" }).click();
    await page.getByRole("button", { name: "Add Test Case" }).click();
    await page.locator("#test-case-input-0").fill("1 2\n");
    await page.locator("#test-case-output-0").fill("3\n");
    await page.getByRole("button", { name: "Add Test Case" }).click();
    await page.locator("#test-case-input-1").fill("5 8\n");
    await page.locator("#test-case-output-1").fill("13\n");
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard\/problems\/[^/]+$/, { timeout: 15_000 });
    await expect(page.getByText(problemTitle, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    await captureEvidence(page, testInfo, "problem-created");
  });

  const problemId = page.url().split("/").pop();
  if (!problemId) {
    throw new Error("Problem id missing after create redirect");
  }

  await test.step("edit the problem and persist test case changes", async () => {
    await page.getByRole("button", { name: "Edit" }).click();
    await page.waitForURL(`**/dashboard/problems/${problemId}/edit`, { timeout: 15_000 });
    await page.locator("#test-case-output-0").fill("4\n");
    await page.getByRole("button", { name: "Remove" }).nth(1).click();
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(`**/dashboard/problems/${problemId}`, { timeout: 15_000 });
    await page.getByRole("button", { name: "Edit" }).click();
    await page.waitForURL(`**/dashboard/problems/${problemId}/edit`, { timeout: 15_000 });
    await expect(page.locator("#test-case-output-0")).toHaveValue("4\n");
    await expect(page.locator("#test-case-output-1")).toHaveCount(0);
  });

  await test.step("keep problem API access locked to authenticated users", async () => {
    const guestContext = await browser.newContext({ baseURL: getPlaywrightBaseUrl() });
    const guestPage = await guestContext.newPage();

    await guestPage.goto("/login", { waitUntil: "networkidle" });
    const guestProblemRead = await guestPage.evaluate(async (id) => {
      const response = await fetch(`/api/v1/problems/${id}`);
      const body = await response.json();
      return { status: response.status, body };
    }, problemId);

    expect(guestProblemRead.status).toBe(401);
    await guestContext.close();
  });

  await test.step("submit a solution and verify test cases lock afterwards", async () => {
    await page.goto(`/dashboard/problems/${problemId}`, { waitUntil: "networkidle" });
    await page.locator("#sourceCode").fill("a, b = map(int, input().split())\nprint(a + b)\n");
    await page.getByRole("button", { name: "Submit" }).click();
    await page.waitForURL(/\/dashboard\/submissions\/[^/]+$/, { timeout: 15_000 });

    await page.goto(`/dashboard/problems/${problemId}/edit`, { waitUntil: "networkidle" });
    await expect(
      page.getByText("Test cases are locked because this problem already has submissions.")
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Test Case" })).toBeDisabled();

    const lockedPatch = await page.evaluate(async (id) => {
      const response = await fetch(`/api/v1/problems/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testCases: [{ input: "1\n", expectedOutput: "1\n", isVisible: false }],
        }),
      });

      return {
        status: response.status,
        body: await response.json(),
      };
    }, problemId);

    expect(lockedPatch.status).toBe(409);
    expect(lockedPatch.body.error).toBe("testCasesLocked");
    await captureEvidence(page, testInfo, "problem-locked-after-submission");
  });

  await test.step("create a group through the dashboard dialog", async () => {
    const groupName = `Playwright Group ${suffix}`;

    await page.goto("/dashboard/groups", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Create Group" }).click();

    const groupDialog = page.getByRole("dialog", { name: "Create Group" });
    await groupDialog.locator("#group-name").fill(groupName);
    await groupDialog.locator("#group-description").fill(
      "Created by the Playwright remediation smoke suite."
    );
    await groupDialog.locator('button[type="submit"]').click();
    await page.waitForURL(/\/dashboard\/groups\/[^/]+$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: groupName })).toBeVisible();
    await captureEvidence(page, testInfo, "group-created");
  });
});

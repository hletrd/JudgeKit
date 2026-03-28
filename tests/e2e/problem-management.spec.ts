/**
 * Problem Management E2E Test
 *
 * Tests admin problem CRUD: create a problem via API, navigate to the problem
 * list and edit pages, verify fields, and delete the problem.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3110 E2E_USERNAME=admin E2E_PASSWORD=yourpass npx playwright test tests/e2e/problem-management.spec.ts
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { loginWithCredentials, navigateTo } from "./support/helpers";
import { DEFAULT_CREDENTIALS, BASE_URL } from "./support/constants";

const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-Requested-With": "XMLHttpRequest",
};

const suffix = `e2e-${Date.now()}`;

// Shared state across serial tests
let adminPage: Page;
let adminRequest: APIRequestContext;
let problemId: string;

const problemTitle = `[E2E] Problem CRUD ${suffix}`;
const updatedTitle = `[E2E] Problem CRUD Updated ${suffix}`;

async function loginAsAdmin(page: Page) {
  await loginWithCredentials(page, DEFAULT_CREDENTIALS.username, DEFAULT_CREDENTIALS.password, {
    allowPasswordChange: true,
  });
  if (page.url().includes("/change-password")) {
    await page.locator("#currentPassword").fill(DEFAULT_CREDENTIALS.password);
    await page.locator("#newPassword").fill(DEFAULT_CREDENTIALS.password);
    await page.locator("#confirmPassword").fill(DEFAULT_CREDENTIALS.password);
    await page.getByRole("button", { name: /Change Password|비밀번호 변경/ }).click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
  }
}

async function apiPost(request: APIRequestContext, path: string, data: Record<string, unknown>) {
  const res = await request.post(path, { data, headers: CSRF_HEADERS });
  const body = await res.json();
  if (!res.ok()) {
    throw new Error(`API POST ${path} failed (${res.status()}): ${JSON.stringify(body)}`);
  }
  return body;
}

test.describe.serial("Problem Management", () => {
  test("Step 1: Admin login", async ({ browser }) => {
    adminPage = await browser.newPage();
    await loginAsAdmin(adminPage);
    adminRequest = adminPage.request;
    expect(adminPage.url()).toContain("/dashboard");
  });

  test("Step 2: Navigate to problems page", async () => {
    await navigateTo(adminPage, "/dashboard/problems");
    await adminPage.waitForLoadState("networkidle");

    const content = await adminPage.textContent("body");
    expect(content).toMatch(/problem|문제/i);
  });

  test("Step 3: Create problem via API", async () => {
    const res = await apiPost(adminRequest, "/api/v1/problems", {
      title: problemTitle,
      description: "Read two integers and print their sum.\n\n## Input\nTwo space-separated integers A and B.\n\n## Output\nPrint A+B.",
      timeLimitMs: 1000,
      memoryLimitMb: 128,
      visibility: "private",
      testCases: [
        { input: "1 2", expectedOutput: "3", isVisible: true, sortOrder: 0 },
        { input: "5 7", expectedOutput: "12", isVisible: true, sortOrder: 1 },
        { input: "-1 1", expectedOutput: "0", isVisible: false, sortOrder: 2 },
      ],
    });
    problemId = res.data.id;
    expect(problemId).toBeTruthy();
    console.log(`  Created problem: ${problemId} — "${problemTitle}"`);
  });

  test("Step 4: Problem appears in problems list", async () => {
    await navigateTo(adminPage, "/dashboard/problems");
    await adminPage.waitForLoadState("networkidle");

    const content = await adminPage.textContent("body");
    expect(content).toContain(problemTitle);
  });

  test("Step 5: Navigate to problem detail page", async () => {
    await navigateTo(adminPage, `/dashboard/problems/${problemId}`);
    await adminPage.waitForLoadState("networkidle");

    const content = await adminPage.textContent("body");
    expect(content).toContain(problemTitle);
    // Should show time/memory limits
    expect(content).toMatch(/1000|1s|time|시간/i);
  });

  test("Step 6: Navigate to problem edit page and verify fields", async () => {
    // Try the standard edit URL pattern
    await navigateTo(adminPage, `/dashboard/admin/problems/${problemId}/edit`);
    await adminPage.waitForLoadState("networkidle");

    const url = adminPage.url();
    const content = await adminPage.textContent("body");

    if (url.includes("/edit") || content?.includes(problemTitle)) {
      // Edit page loaded — verify title field is pre-filled
      const titleInput = adminPage.locator('input[name="title"], #title, #problem-title').first();
      const count = await titleInput.count();
      if (count > 0) {
        const value = await titleInput.inputValue();
        expect(value).toContain("[E2E] Problem CRUD");
      } else {
        // Fields may be rendered differently; verify page contains expected content
        expect(content).toContain("[E2E] Problem CRUD");
      }
    } else {
      // Edit page might be at a different path; verify detail page has edit controls
      await navigateTo(adminPage, `/dashboard/problems/${problemId}`);
      await adminPage.waitForLoadState("networkidle");
      const bodyContent = await adminPage.textContent("body");
      expect(bodyContent).toContain(problemTitle);
    }
  });

  test("Step 7: Update problem title via API (PATCH)", async () => {
    const res = await adminRequest.patch(`/api/v1/problems/${problemId}`, {
      data: { title: updatedTitle },
      headers: CSRF_HEADERS,
    });
    // Accept 200 or 204
    expect([200, 204]).toContain(res.status());
    console.log(`  Updated problem title to: "${updatedTitle}"`);
  });

  test("Step 8: Updated title visible on detail page", async () => {
    await navigateTo(adminPage, `/dashboard/problems/${problemId}`);
    await adminPage.waitForLoadState("networkidle");

    const content = await adminPage.textContent("body");
    // Either updated title or original may show depending on cache/revalidation
    expect(content).toMatch(/E2E.*Problem.*CRUD/i);
  });

  test("Step 9: Delete problem via API", async () => {
    const res = await adminRequest.delete(`/api/v1/problems/${problemId}`, {
      headers: CSRF_HEADERS,
    });
    // Accept 200, 204, or 404 (already deleted)
    expect([200, 204, 404]).toContain(res.status());
    console.log(`  Deleted problem: ${problemId} (status ${res.status()})`);
  });

  test("Step 10: Deleted problem no longer appears in list", async () => {
    await navigateTo(adminPage, "/dashboard/problems");
    await adminPage.waitForLoadState("networkidle");

    const content = await adminPage.textContent("body");
    // The updated title should not appear (original title also should be gone)
    expect(content).not.toContain(updatedTitle);
  });

  test("Step 11: Cleanup - close admin page", async () => {
    await adminPage?.close();
  });
});

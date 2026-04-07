/**
 * Problem Difficulty & Tags E2E Test
 *
 * Tests difficulty field and tag management: create problems with difficulty
 * and tags via API, verify they appear correctly in the list and detail pages,
 * update difficulty, and verify display formatting.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://oj-internal.maum.ai E2E_USERNAME=admin E2E_PASSWORD='mcl1234~' \
 *     npx playwright test tests/e2e/problem-difficulty-tags.spec.ts
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { loginWithCredentials, navigateTo, waitForToast } from "./support/helpers";
import { DEFAULT_CREDENTIALS, BASE_URL } from "./support/constants";

const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-Requested-With": "XMLHttpRequest",
};

const suffix = `e2e-${Date.now()}`;

let adminPage: Page;
let adminRequest: APIRequestContext;
let problemWithDifficultyId: string;
let problemWithTagsId: string;
let problemNoDifficultyId: string;

const titleWithDifficulty = `[E2E] Difficulty Test ${suffix}`;
const titleWithTags = `[E2E] Tags Test ${suffix}`;
const titleNoDifficulty = `[E2E] No Difficulty ${suffix}`;

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

async function apiPatch(request: APIRequestContext, path: string, data: Record<string, unknown>) {
  const res = await request.patch(path, { data, headers: CSRF_HEADERS });
  const body = await res.json();
  if (!res.ok()) {
    throw new Error(`API PATCH ${path} failed (${res.status()}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function apiDelete(request: APIRequestContext, path: string) {
  const res = await request.delete(path, { headers: CSRF_HEADERS });
  return res;
}

test.describe.serial("Problem Difficulty & Tags", () => {
  test("Step 1: Admin login", async ({ browser }) => {
    adminPage = await browser.newPage();
    await loginAsAdmin(adminPage);
    adminRequest = adminPage.request;
    expect(adminPage.url()).toContain("/dashboard");
  });

  // ── Difficulty via API ──

  test("Step 2: Create problem with difficulty via API", async () => {
    const res = await apiPost(adminRequest, "/api/v1/problems", {
      title: titleWithDifficulty,
      description: "Test problem with difficulty 3.14",
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      visibility: "public",
      difficulty: 3.14,
      testCases: [
        { input: "1\n", expectedOutput: "1", isVisible: true },
      ],
    });
    problemWithDifficultyId = res.data.id;
    expect(problemWithDifficultyId).toBeTruthy();
    expect(res.data.difficulty).toBeCloseTo(3.14, 2);
    console.log(`  Created problem with difficulty: ${problemWithDifficultyId}`);
  });

  test("Step 3: Create problem without difficulty via API", async () => {
    const res = await apiPost(adminRequest, "/api/v1/problems", {
      title: titleNoDifficulty,
      description: "Test problem without difficulty",
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      visibility: "public",
      difficulty: null,
      testCases: [
        { input: "1\n", expectedOutput: "1", isVisible: true },
      ],
    });
    problemNoDifficultyId = res.data.id;
    expect(problemNoDifficultyId).toBeTruthy();
    expect(res.data.difficulty).toBeNull();
    console.log(`  Created problem without difficulty: ${problemNoDifficultyId}`);
  });

  test("Step 4: Difficulty badge visible on detail page", async () => {
    await navigateTo(adminPage, `/dashboard/problems/${problemWithDifficultyId}`);
    await adminPage.waitForLoadState("networkidle");

    const content = await adminPage.textContent("body");
    // Should display difficulty (3.14 / 10 or similar format)
    expect(content).toMatch(/3\.14/);
  });

  test("Step 5: No difficulty badge when null", async () => {
    await navigateTo(adminPage, `/dashboard/problems/${problemNoDifficultyId}`);
    await adminPage.waitForLoadState("networkidle");

    // The detail page should NOT show a difficulty badge
    const badges = adminPage.locator("text=/\\d+(\\.\\d+)?\\s*\\/\\s*10/");
    await expect(badges).toHaveCount(0);
  });

  test("Step 6: Difficulty visible in problems list", async () => {
    await navigateTo(adminPage, "/dashboard/problems?search=" + encodeURIComponent("[E2E]"));
    await adminPage.waitForLoadState("networkidle");

    const content = await adminPage.textContent("body");
    expect(content).toContain(titleWithDifficulty);
    // Difficulty value should appear in the row
    expect(content).toMatch(/3\.14/);
  });

  test("Step 7: Update difficulty via PATCH", async () => {
    const res = await apiPatch(adminRequest, `/api/v1/problems/${problemWithDifficultyId}`, {
      difficulty: 7.5,
    });
    expect(res.data.difficulty).toBeCloseTo(7.5, 1);
    console.log(`  Updated difficulty to 7.5`);
  });

  test("Step 8: Updated difficulty reflected on detail page", async () => {
    await navigateTo(adminPage, `/dashboard/problems/${problemWithDifficultyId}`);
    await adminPage.waitForLoadState("networkidle");

    const content = await adminPage.textContent("body");
    expect(content).toMatch(/7\.5/);
  });

  test("Step 9: Clear difficulty via PATCH (set null)", async () => {
    const res = await apiPatch(adminRequest, `/api/v1/problems/${problemWithDifficultyId}`, {
      difficulty: null,
    });
    expect(res.data.difficulty).toBeNull();
    console.log(`  Cleared difficulty`);
  });

  test("Step 10: Cleared difficulty - no badge on detail page", async () => {
    await navigateTo(adminPage, `/dashboard/problems/${problemWithDifficultyId}`);
    await adminPage.waitForLoadState("networkidle");

    const badges = adminPage.locator("text=/\\d+(\\.\\d+)?\\s*\\/\\s*10/");
    await expect(badges).toHaveCount(0);
  });

  // ── Difficulty validation ──

  test("Step 11: Reject difficulty > 10", async () => {
    const res = await adminRequest.post("/api/v1/problems", {
      data: {
        title: `[E2E] Invalid Difficulty ${suffix}`,
        description: "Should fail",
        timeLimitMs: 2000,
        memoryLimitMb: 256,
        visibility: "public",
        difficulty: 11,
        testCases: [{ input: "1\n", expectedOutput: "1", isVisible: true }],
      },
      headers: CSRF_HEADERS,
    });
    expect(res.status()).toBe(400);
  });

  test("Step 12: Reject difficulty < 0", async () => {
    const res = await adminRequest.post("/api/v1/problems", {
      data: {
        title: `[E2E] Negative Difficulty ${suffix}`,
        description: "Should fail",
        timeLimitMs: 2000,
        memoryLimitMb: 256,
        visibility: "public",
        difficulty: -1,
        testCases: [{ input: "1\n", expectedOutput: "1", isVisible: true }],
      },
      headers: CSRF_HEADERS,
    });
    expect(res.status()).toBe(400);
  });

  // ── Tags ──

  test("Step 13: Create problem with tags via API", async () => {
    const res = await apiPost(adminRequest, "/api/v1/problems", {
      title: titleWithTags,
      description: "Test problem with tags",
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      visibility: "public",
      difficulty: 5,
      tags: [`e2e-tag-${suffix}`, `e2e-cat-${suffix}`],
      testCases: [
        { input: "1\n", expectedOutput: "1", isVisible: true },
      ],
    });
    problemWithTagsId = res.data.id;
    expect(problemWithTagsId).toBeTruthy();
    console.log(`  Created problem with tags: ${problemWithTagsId}`);
  });

  test("Step 14: Tags visible in problems list", async () => {
    await navigateTo(adminPage, "/dashboard/problems?search=" + encodeURIComponent("[E2E] Tags Test"));
    await adminPage.waitForLoadState("networkidle");

    const content = await adminPage.textContent("body");
    expect(content).toContain(`e2e-tag-${suffix}`);
    expect(content).toContain(`e2e-cat-${suffix}`);
  });

  test("Step 15: Filter by tag works", async () => {
    await navigateTo(adminPage, `/dashboard/problems?tag=e2e-tag-${suffix}`);
    await adminPage.waitForLoadState("networkidle");

    const content = await adminPage.textContent("body");
    expect(content).toContain(titleWithTags);
  });

  // ── UI Form: Create with difficulty ──

  test("Step 16: Create problem with difficulty via form UI", async () => {
    await navigateTo(adminPage, "/dashboard/problems/create");
    await adminPage.waitForLoadState("networkidle");

    await adminPage.locator("#title").fill(`[E2E] UI Difficulty ${suffix}`);
    await adminPage.locator("#difficulty").fill("6.28");

    // Add a test case (required for submission)
    await adminPage.getByRole("button", { name: /Add Test Case|테스트 케이스 추가/i }).click();
    // Fill the test case textareas (input and expected output)
    const testCaseTextareas = adminPage.locator('[id^="test-case-"]');
    await testCaseTextareas.first().fill("1 2");
    await testCaseTextareas.nth(1).fill("3");

    // Submit the form - use the submit button at the bottom
    const createUrl = adminPage.url();
    await adminPage.locator('form button[type="submit"]').click();

    // Wait for navigation away from the create page
    await adminPage.waitForURL((url) => url.toString() !== createUrl, { timeout: 15_000 });
    await expect(adminPage.getByText(/6\.28\s*\/\s*10/)).toBeVisible();
  });

  // ── Edit difficulty via form UI ──

  test("Step 17: Edit difficulty via form UI", async () => {
    await navigateTo(adminPage, `/dashboard/problems/${problemWithTagsId}/edit`);
    await adminPage.waitForLoadState("networkidle");

    const difficultyInput = adminPage.locator("#difficulty");
    await difficultyInput.clear();
    await difficultyInput.fill("8.5");

    const editUrl = adminPage.url();
    await adminPage.locator('form button[type="submit"]').click();
    await adminPage.waitForURL((url) => url.toString() !== editUrl, { timeout: 15_000 });

    await expect(adminPage.getByText(/8\.5\s*\/\s*10/)).toBeVisible();
  });

  // ── Cleanup ──

  test("Step 18: Cleanup - delete test problems", async () => {
    const ids = [problemWithDifficultyId, problemNoDifficultyId, problemWithTagsId].filter(Boolean);

    // Find and delete the UI-created problem too
    const searchRes = await adminRequest.get(`/api/v1/problems?search=${encodeURIComponent(`[E2E] UI Difficulty ${suffix}`)}`);
    if (searchRes.ok()) {
      const json = await searchRes.json();
      const uiProblem = (json.data ?? []).find((p: { title: string }) => p.title.includes(`UI Difficulty ${suffix}`));
      if (uiProblem) ids.push(uiProblem.id);
    }

    for (const id of ids) {
      await apiDelete(adminRequest, `/api/v1/problems/${id}`);
      console.log(`  Deleted: ${id}`);
    }
  });

  test("Step 19: Cleanup - close admin page", async () => {
    await adminPage?.close();
  });
});

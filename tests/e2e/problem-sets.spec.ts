/**
 * Problem Sets E2E Test
 *
 * Tests problem set (group) management: create a problem set via API,
 * navigate to the problem sets page, verify it appears in the list,
 * and delete it.
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3110 E2E_USERNAME=admin E2E_PASSWORD=yourpass npx playwright test tests/e2e/problem-sets.spec.ts
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
let groupId: string;

const groupName = `[E2E] Problem Set ${suffix}`;
const groupDescription = `E2E test problem set created at ${suffix}`;

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

test.describe.serial("Problem Sets (Groups)", () => {
  test("Step 1: Admin login", async ({ browser }) => {
    adminPage = await browser.newPage();
    await loginAsAdmin(adminPage);
    adminRequest = adminPage.request;
    expect(adminPage.url()).toContain("/dashboard");
  });

  test("Step 2: Navigate to groups/problem-sets page", async () => {
    await navigateTo(adminPage, "/dashboard/groups");
    await adminPage.waitForLoadState("networkidle");

    const content = await adminPage.textContent("body");
    expect(content).toMatch(/group|problem set|그룹/i);
  });

  test("Step 3: Create problem set (group) via API", async () => {
    const res = await apiPost(adminRequest, "/api/v1/groups", {
      name: groupName,
      description: groupDescription,
    });
    groupId = res.data.id;
    expect(groupId).toBeTruthy();
    console.log(`  Created group: ${groupId} — "${groupName}"`);
  });

  test("Step 4: Problem set appears in groups list", async () => {
    await navigateTo(adminPage, "/dashboard/groups");
    await adminPage.waitForLoadState("networkidle");

    const content = await adminPage.textContent("body");
    expect(content).toContain(groupName);
  });

  test("Step 5: Navigate to problem set detail page", async () => {
    await navigateTo(adminPage, `/dashboard/groups/${groupId}`);
    await adminPage.waitForLoadState("networkidle");

    const url = adminPage.url();
    expect(url).toContain(groupId);

    const content = await adminPage.textContent("body");
    expect(content).toContain(groupName);
    console.log(`  Group detail page loaded: ${url}`);
  });

  test("Step 6: Problem set detail shows description", async () => {
    await navigateTo(adminPage, `/dashboard/groups/${groupId}`);
    await adminPage.waitForLoadState("networkidle");

    const content = await adminPage.textContent("body");
    // Description or group metadata should be present
    expect(content).toMatch(/E2E test problem set|member|assignment|그룹/i);
  });

  test("Step 7: Problem set API returns correct data", async () => {
    const res = await adminRequest.get(`/api/v1/groups/${groupId}`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.data.id).toBe(groupId);
    expect(body.data.name).toBe(groupName);
    console.log(`  Group API verified: name="${body.data.name}"`);
  });

  test("Step 8: Delete problem set via API", async () => {
    const res = await adminRequest.delete(`/api/v1/groups/${groupId}`, {
      headers: CSRF_HEADERS,
    });
    // Accept 200 or 204 as successful deletion
    expect([200, 204]).toContain(res.status());
    console.log(`  Deleted group: ${groupId} (status ${res.status()})`);
  });

  test("Step 9: Deleted problem set no longer appears in list", async () => {
    await navigateTo(adminPage, "/dashboard/groups");
    await adminPage.waitForLoadState("networkidle");

    const content = await adminPage.textContent("body");
    expect(content).not.toContain(groupName);
  });

  test("Step 10: Deleted problem set API returns 404", async () => {
    const res = await adminRequest.get(`/api/v1/groups/${groupId}`);
    expect(res.status()).toBe(404);
  });

  test("Step 11: Cleanup - close admin page", async () => {
    await adminPage?.close();
  });
});

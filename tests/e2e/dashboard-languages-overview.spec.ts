import { test, expect, type Page } from "@playwright/test";
import { loginWithCredentials } from "./support/helpers";
import { DEFAULT_CREDENTIALS } from "./support/constants";

const NEW_PASSWORD = process.env.E2E_NEW_PASSWORD || DEFAULT_CREDENTIALS.password;

async function loginAsAdmin(page: Page) {
  await loginWithCredentials(page, DEFAULT_CREDENTIALS.username, DEFAULT_CREDENTIALS.password, {
    allowPasswordChange: true,
  });

  if (page.url().includes("/change-password")) {
    await page.locator("#currentPassword").fill(DEFAULT_CREDENTIALS.password);
    await page.locator("#newPassword").fill(NEW_PASSWORD);
    await page.locator("#confirmPassword").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: /Change Password|비밀번호 변경/ }).click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
  }
}

test("dashboard root exposes judge status tabs and full languages catalog", async ({ page }) => {
  await loginAsAdmin(page);
  await expect(page).toHaveURL(/\/dashboard/);

  const mainContent = page.locator("#main-content");
  await expect(mainContent).toBeVisible();

  await expect(
    mainContent.getByRole("tab", { name: /Judge runtime overview|채점 시스템 현황/i })
  ).toBeVisible();
  await expect(mainContent.getByText(/Online workers|온라인 워커/i)).toBeVisible();

  await mainContent.getByRole("tab", { name: /Supported languages|지원 언어/i }).click();
  await expect(
    mainContent.getByRole("link", { name: /View all languages|전체 지원 언어 보기/i })
  ).toBeVisible();

  await mainContent.getByRole("link", { name: /View all languages|전체 지원 언어 보기/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/languages/);
  await expect(
    page.getByRole("heading", { name: /Supported languages|지원 언어/i })
  ).toBeVisible();
  await expect(page.locator("#main-content table")).toBeVisible();
});

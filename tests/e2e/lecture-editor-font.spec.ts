import { expect, test, type Locator } from "@playwright/test";
import { createProblemViaApi, loginWithCredentials, makeProblemDescription } from "./support/helpers";
import { DEFAULT_CREDENTIALS } from "./support/constants";

const CSRF_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
};

async function fontSize(locator: Locator) {
  return locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
}

test("lecture mode matches the problem editor font size to the problem body", async ({ page }) => {
  await loginWithCredentials(page, DEFAULT_CREDENTIALS.username, DEFAULT_CREDENTIALS.password);

  const problem = await createProblemViaApi(page.request, {
    title: `[E2E] Lecture editor font ${Date.now()}`,
    description: makeProblemDescription("Make the editor text match this problem body."),
    visibility: "private",
  });

  try {
    await page.goto(`/practice/problems/${problem.id}`, { waitUntil: "networkidle" });

    const problemBody = page.locator(".problem-description p").first();
    const editorContent = page.locator("#sourceCode");
    await expect(problemBody).toBeVisible();
    await expect(editorContent).toBeVisible();

    await page.evaluate(() => {
      const html = document.documentElement;
      html.classList.remove("lecture-mode", "lecture-theme-dark");
      html.style.removeProperty("--lecture-font-scale");
    });
    const normalEditorSize = await fontSize(editorContent);

    await page.evaluate(() => {
      const html = document.documentElement;
      html.classList.add("lecture-mode", "lecture-theme-dark");
      html.style.setProperty("--lecture-font-scale", "1.5");
    });
    await expect.poll(() => fontSize(editorContent)).toBeGreaterThan(normalEditorSize);
    expect(await fontSize(editorContent)).toBeCloseTo(await fontSize(problemBody), 3);

    await page.evaluate(() => {
      document.documentElement.style.setProperty("--lecture-font-scale", "2.0");
    });
    expect(await fontSize(editorContent)).toBeCloseTo(await fontSize(problemBody), 3);
  } finally {
    const response = await page.request.delete(`/api/v1/problems/${problem.id}`, {
      headers: CSRF_HEADERS,
    });
    expect([200, 204, 404]).toContain(response.status());
  }
});

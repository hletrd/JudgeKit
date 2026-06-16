/**
 * Function-Judging Responsive Rendering E2E
 *
 * Drives the `function` problem-type UI surfaces at mobile (375), tablet (768)
 * and desktop (1280) viewport widths and asserts correct, non-overflowing,
 * usable rendering. A judge worker is NOT required — these are pure rendering
 * checks of the authoring + student-submit surfaces.
 *
 * Surfaces covered:
 *   - Authoring: problems/[id]/edit with problemType=function — the
 *     problem-type selector, FunctionSignatureBuilder (name, param rows with
 *     type selects, return-type select, enabled-languages multiselect),
 *     FunctionTestCaseEditor (typed per-param inputs + expected-return,
 *     add/remove, visible toggle) and FunctionReferenceSolution (language
 *     picker, code editor, compute button, stub-preview pane).
 *   - Authoring (create): problems/create with problemType switched to
 *     function.
 *   - Student submit: practice/problems/[id] — the stub-preloaded editor, the
 *     gated language dropdown.
 *
 * Run (local):
 *   npx playwright test function-judging-responsive
 */
import { test, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { loginWithCredentials } from "./support/helpers";
import { DEFAULT_CREDENTIALS } from "./support/constants";

const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-Requested-With": "XMLHttpRequest",
} as const;

/**
 * Live admin password for this run. Starts as the seeded value
 * (E2E_USERNAME/E2E_PASSWORD). If the server forces a first-login change we set
 * a DISTINCT strong password and remember it here, so every later loginAsAdmin
 * in the run authenticates with the new value.
 */
let adminPassword = DEFAULT_CREDENTIALS.password;

/**
 * Log in as the seeded admin (E2E_USERNAME/E2E_PASSWORD), transparently
 * completing the first-login forced password change if the server requires it.
 * Avoids the DB-backed runtime-admin fixture (its dynamic `src/lib/db` import
 * is not loadable under the Playwright runner) so the spec works against any
 * server where the admin credentials are valid.
 */
async function loginAsAdmin(page: Page): Promise<void> {
  await loginWithCredentials(
    page,
    DEFAULT_CREDENTIALS.username,
    adminPassword,
    { allowPasswordChange: true },
  );
  if (page.url().includes("/change-password")) {
    // Forced first-login change. Set a DISTINCT new password: a same-as-current
    // change makes the form's automatic re-sign-in race the just-invalidated
    // session token, and under the Playwright runner's tight timing that race
    // can drop the change entirely (the account stays mustChangePassword=true).
    // A distinct password commits reliably; we record it so the rest of the run
    // logs in with it. It must satisfy the 12-char policy
    // (src/lib/system-settings-config.ts) and stay >= the seeded password's
    // strength.
    const nextPassword = `${DEFAULT_CREDENTIALS.password}-e2e1`;
    await page.locator("#currentPassword").fill(adminPassword);
    await page.locator("#newPassword").fill(nextPassword);
    await page.locator("#confirmPassword").fill(nextPassword);
    await page.getByRole("button", { name: /change password|비밀번호 변경/i }).click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    adminPassword = nextPassword;
  }
}

const VIEWPORTS = {
  mobile: { width: 375, height: 812, name: "Mobile (375)" },
  tablet: { width: 768, height: 1024, name: "Tablet (768)" },
  desktop: { width: 1280, height: 900, name: "Desktop (1280)" },
} as const;

type ViewportKey = keyof typeof VIEWPORTS;

const FUNCTION_SPEC = {
  functionName: "twoSum",
  params: [
    { name: "nums", type: "int[]" },
    { name: "target", type: "int" },
  ],
  returnType: "int[]",
  // Enable many languages so the multiselect/dropdown are stressed at narrow
  // widths (every function-judging language).
  enabledLanguages: ["python", "cpp23", "javascript", "typescript", "java", "go", "csharp"],
} as const;

const REFERENCE_SOLUTION = {
  language: "python",
  source: "class Solution:\n    def twoSum(self, nums, target):\n        return []\n",
} as const;

let problemId: string;
let problemTitle: string;

/** Assert the document does not overflow the viewport horizontally. */
async function expectNoHorizontalOverflow(page: Page, context: string) {
  const dims = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: Math.ceil(window.visualViewport?.width ?? window.innerWidth),
  }));
  expect(
    dims.documentWidth,
    `${context}: horizontal overflow — doc ${dims.documentWidth}px > viewport ${dims.viewportWidth}px`,
  ).toBeLessThanOrEqual(dims.viewportWidth + 1);
}

/** Assert a specific element does not bleed past the right viewport edge. */
async function expectElementWithinViewport(locator: Locator, page: Page, label: string) {
  const box = await locator.boundingBox();
  if (!box) return;
  const viewportWidth = await page.evaluate(
    () => Math.ceil(window.visualViewport?.width ?? window.innerWidth),
  );
  expect(
    Math.ceil(box.x + box.width),
    `${label}: right edge ${Math.ceil(box.x + box.width)}px exceeds viewport ${viewportWidth}px`,
  ).toBeLessThanOrEqual(viewportWidth + 1);
}

async function createFunctionProblem(request: APIRequestContext): Promise<string> {
  problemTitle = `[E2E] fn-responsive ${Date.now()}`;
  const res = await request.post("/api/v1/problems", {
    headers: CSRF_HEADERS,
    data: {
      title: problemTitle,
      description: "Responsive rendering fixture for the function problem type.",
      problemType: "function",
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      visibility: "public",
      comparisonMode: "exact",
      functionSpec: FUNCTION_SPEC,
      referenceSolution: REFERENCE_SOLUTION,
      testCases: [
        { input: "[[2,7,11,15],9]", expectedOutput: "[0,1]", isVisible: true, sortOrder: 0 },
        { input: "[[3,2,4],6]", expectedOutput: "[1,2]", isVisible: false, sortOrder: 1 },
      ],
    },
  });
  if (!res.ok()) {
    throw new Error(`create function problem failed (${res.status()}): ${await res.text()}`);
  }
  const json = await res.json();
  return json.data.id as string;
}

test.describe.serial("Function-judging responsive rendering", () => {
  test.beforeAll(async ({ browser }) => {
    // Use a fresh authenticated context purely to mint the problem via API.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAsAdmin(page);
    problemId = await createFunctionProblem(page.request);
    await ctx.close();
    expect(problemId).toBeTruthy();
  });

  test.afterAll(async ({ browser }) => {
    if (!problemId) return;
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAsAdmin(page);
    await page.request.delete(`/api/v1/problems/${problemId}?force=true`, { headers: CSRF_HEADERS });
    await ctx.close();
  });

  for (const key of Object.keys(VIEWPORTS) as ViewportKey[]) {
    const vp = VIEWPORTS[key];

    test(`${vp.name}: authoring edit page renders the function sections without overflow`, async ({
      page,
    }) => {
      await loginAsAdmin(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/problems/${problemId}/edit`, { waitUntil: "networkidle" });

      // The three function sections must be present.
      await expect(page.getByRole("heading", { name: /Function signature|함수 시그니처/i })).toBeVisible();
      await expect(page.getByRole("heading", { name: /Test cases|테스트 케이스/i }).first()).toBeVisible();
      await expect(page.getByRole("heading", { name: /Reference solution|참조 (솔루션|풀이)/i })).toBeVisible();

      await expectNoHorizontalOverflow(page, `${vp.name} edit page`);
    });

    test(`${vp.name}: signature builder param rows + selects fit the viewport`, async ({
      page,
    }) => {
      await loginAsAdmin(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/problems/${problemId}/edit`, { waitUntil: "networkidle" });

      // Function-name input.
      const fnName = page.locator("#fn-name");
      await expect(fnName).toBeVisible();
      await expectElementWithinViewport(fnName, page, `${vp.name} fn-name`);

      // Param type selects (one per param) must stay within the viewport.
      const typeSelects = page.locator("select[aria-label*='type' i], #fn-return-type");
      const count = await typeSelects.count();
      expect(count, "expected at least the return-type select").toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        await expectElementWithinViewport(typeSelects.nth(i), page, `${vp.name} type-select #${i}`);
      }

      await expectNoHorizontalOverflow(page, `${vp.name} signature builder`);
    });

    test(`${vp.name}: enabled-languages multiselect wraps without overflow`, async ({
      page,
    }) => {
      await loginAsAdmin(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/problems/${problemId}/edit`, { waitUntil: "networkidle" });

      // Each language checkbox label must remain within the viewport.
      const langLabels = page.locator("label", { hasText: /Python|C\+\+|JavaScript|TypeScript|Java|Go|C#/ });
      const n = await langLabels.count();
      expect(n, "expected enabled-language options to render").toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        await expectElementWithinViewport(langLabels.nth(i), page, `${vp.name} lang-label #${i}`);
      }
      await expectNoHorizontalOverflow(page, `${vp.name} languages multiselect`);
    });

    test(`${vp.name}: stub preview + code editor stay contained`, async ({
      page,
    }) => {
      await loginAsAdmin(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/problems/${problemId}/edit`, { waitUntil: "networkidle" });

      // The stub preview <pre> uses overflow-auto: it may scroll internally but
      // must not push the document wider than the viewport.
      const stub = page.locator("pre[aria-label*='stub' i], pre[aria-label*='Stub' i]").first();
      if (await stub.count()) {
        await expectElementWithinViewport(stub, page, `${vp.name} stub preview`);
      }
      await expectNoHorizontalOverflow(page, `${vp.name} reference solution`);
    });

    test(`${vp.name}: student submit page (stub editor + gated languages) has no overflow`, async ({
      page,
    }) => {
      await loginAsAdmin(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/practice/problems/${problemId}`, { waitUntil: "networkidle" });
      // Allow the editor + stub preload to settle.
      await page.waitForTimeout(1500);
      await expectNoHorizontalOverflow(page, `${vp.name} student submit`);

      // Regression for DSG-1 (cycle 2): the problem tab bar uses
      // overflow-x-auto + max-w-full. The active/first tab must NOT be clipped to
      // the left of the list's content box (which happens under justify-center
      // when the bar overflows, because scrollLeft is already at its left limit).
      const tabState = await page.evaluate(() => {
        const list = document.querySelector("[role=tablist]");
        if (!list) return null;
        const active =
          list.querySelector("[role=tab][data-state=active]") ??
          list.querySelector("[role=tab][aria-selected=true]") ??
          list.querySelector("[role=tab]");
        if (!active) return null;
        const lr = list.getBoundingClientRect();
        const ar = active.getBoundingClientRect();
        return {
          // active tab must start at or after the list's left edge (not clipped left)
          notClippedLeft: ar.left >= lr.left - 1,
          // and must end at or before the list's right edge (fully visible)
          fullyVisible: ar.left >= lr.left - 1 && ar.right <= lr.right + 1,
          activeLeft: Math.round(ar.left),
          listLeft: Math.round(lr.left),
        };
      });
      if (tabState) {
        expect(
          tabState.notClippedLeft,
          `${vp.name} active tab clipped left: tab.left ${tabState.activeLeft}px < list.left ${tabState.listLeft}px`,
        ).toBe(true);
        expect(
          tabState.fullyVisible,
          `${vp.name} active tab not fully visible within the scrollable tab bar`,
        ).toBe(true);
      }
    });
  }

  test("Mobile: create page function sections render after switching type", async ({
    page,
  }) => {
    const vp = VIEWPORTS.mobile;
    await loginAsAdmin(page);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/problems/create", { waitUntil: "networkidle" });

    // Switch the problem-type selector to "function".
    const typeTrigger = page.locator("#problemType");
    await expect(typeTrigger).toBeVisible();
    await typeTrigger.click();
    await page.getByRole("option", { name: /Function|함수/i }).click();

    await expect(
      page.getByRole("heading", { name: /Function signature|함수 시그니처/i }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page, "Mobile create function sections");
  });
});

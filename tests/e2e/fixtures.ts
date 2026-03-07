import type { Page } from "@playwright/test";
import { expect, test as base } from "@playwright/test";
import { ensureRuntimeAdminUser, loginAsRuntimeAdmin } from "./support/runtime-admin";

type E2EFixtures = {
  runtimeAdminPage: Page;
  runtimeSuffix: string;
};

export const test = base.extend<E2EFixtures>({
  runtimeSuffix: async ({}, use, testInfo) => {
    await use(`${Date.now()}-${testInfo.workerIndex}`);
  },
  runtimeAdminPage: async ({ page }, use) => {
    await ensureRuntimeAdminUser();
    await loginAsRuntimeAdmin(page);
    await use(page);
  },
});

export { expect };

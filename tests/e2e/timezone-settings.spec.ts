import { eq } from "drizzle-orm";
import { formatDateInTimeZone, formatDateTimeInTimeZone } from "@/lib/datetime";
import { db } from "@/lib/db";
import { systemSettings, users } from "@/lib/db/schema";
import { GLOBAL_SETTINGS_ID } from "@/lib/system-settings";
import { expect, test } from "./fixtures";
import { RUNTIME_ADMIN_USERNAME } from "./support/runtime-admin";

test("@smoke applies the configured timezone to admin timestamps", async ({
  runtimeAdminPage: page,
}) => {
  const targetTimeZone = "America/New_York";
  const originalSettings = await db.query.systemSettings.findFirst({
    where: eq(systemSettings.id, GLOBAL_SETTINGS_ID),
  });

  try {
    await page.goto("/dashboard/admin/settings", { waitUntil: "networkidle" });
    await page.locator("#time-zone").fill(targetTimeZone);
    await page.locator('form button[type="submit"]').click();

    await expect(page.locator("#time-zone")).toHaveValue(targetTimeZone);

    const runtimeAdmin = await db.query.users.findFirst({
      where: eq(users.username, RUNTIME_ADMIN_USERNAME),
    });

    if (!runtimeAdmin?.createdAt) {
      throw new Error("Runtime admin user is missing a createdAt timestamp");
    }

    const expectedJoinedAt = formatDateTimeInTimeZone(runtimeAdmin.createdAt, "en", targetTimeZone);
    const expectedJoinedDate = formatDateInTimeZone(runtimeAdmin.createdAt, "en", targetTimeZone);

    await page.goto("/dashboard/admin/users", { waitUntil: "networkidle" });
    await expect(page.locator(`tr:has-text("${RUNTIME_ADMIN_USERNAME}")`).first()).toContainText(
      expectedJoinedDate
    );

    await page.goto(`/dashboard/admin/users/${runtimeAdmin.id}`, { waitUntil: "networkidle" });
    await expect(page.getByText(expectedJoinedAt, { exact: true })).toBeVisible();
  } finally {
    await db
      .insert(systemSettings)
      .values({
        id: GLOBAL_SETTINGS_ID,
        siteTitle: originalSettings?.siteTitle ?? null,
        siteDescription: originalSettings?.siteDescription ?? null,
        timeZone: originalSettings?.timeZone ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemSettings.id,
        set: {
          siteTitle: originalSettings?.siteTitle ?? null,
          siteDescription: originalSettings?.siteDescription ?? null,
          timeZone: originalSettings?.timeZone ?? null,
          updatedAt: new Date(),
        },
      });
  }
});

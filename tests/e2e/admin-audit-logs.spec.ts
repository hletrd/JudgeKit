import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditEvents, groups, systemSettings, users } from "@/lib/db/schema";
import { captureEvidence } from "./support/evidence";
import { expect, test } from "./fixtures";
import {
  RUNTIME_ADMIN_INITIAL_PASSWORD,
  RUNTIME_ADMIN_USERNAME,
} from "./support/runtime-admin";
import { loginWithCredentials } from "./support/helpers";

const AUDIT_LOGS_PATH = "/dashboard/admin/audit-logs";
const GLOBAL_SETTINGS_ID = "global";

async function deleteAuditLogFixtures(prefix: string) {
  await db.delete(auditEvents)
    .where(sql`
      lower(coalesce(${auditEvents.resourceLabel}, '')) like ${`%${prefix.toLowerCase()}%`}
      or lower(coalesce(${auditEvents.summary}, '')) like ${`%${prefix.toLowerCase()}%`}
      or lower(coalesce(${auditEvents.details}, '')) like ${`%${prefix.toLowerCase()}%`}
    `);
}

test("admin audit logs render server-action and route mutation events", async ({
  runtimeAdminPage: page,
  runtimeSuffix,
}, testInfo) => {
  test.slow();

  const prefix = `audit-${runtimeSuffix}`.toLowerCase();
  const runtimeAdmin = await db.query.users.findFirst({
    where: eq(users.username, RUNTIME_ADMIN_USERNAME),
  });

  if (!runtimeAdmin) {
    throw new Error("Runtime admin user is unavailable for audit-log verification");
  }

  const originalSettings = await db.query.systemSettings.findFirst({
    where: eq(systemSettings.id, GLOBAL_SETTINGS_ID),
  });
  const auditTitle = `Audit Title ${prefix}`;
  const groupName = `Audit Group ${prefix}`;
  const groupDescription = `Audit Group Description ${prefix}`;
  const profileClassName = `Audit Class ${prefix}`;
  const rotatedPassword = `AuditPass-${runtimeSuffix.replace(/[^a-zA-Z0-9]/g, "")}!`;
  const verificationStart = new Date();
  let createdGroupId: string | null = null;

  await deleteAuditLogFixtures(prefix);

  try {
    await test.step("create an audit event from a server action", async () => {
      await page.goto("/dashboard/admin/settings", { waitUntil: "networkidle" });
      await page.locator("#site-title").fill(auditTitle);
      await page.locator("#system-settings-current-password").fill(RUNTIME_ADMIN_INITIAL_PASSWORD);
      await page.getByRole("button", { name: "Save" }).click();

      await expect(page.getByText("System settings updated")).toBeVisible();
      await expect.poll(async () => {
        const event = await db.query.auditEvents.findFirst({
          where: and(
            eq(auditEvents.action, "system_settings.updated"),
            eq(auditEvents.actorId, runtimeAdmin.id),
            gt(auditEvents.createdAt, verificationStart)
          ),
        });

        return event?.details?.includes(auditTitle) ?? false;
      }).toBe(true);
    });

    await test.step("create an audit event from a route handler", async () => {
      await page.goto("/groups", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Create Group" }).click();
      await page.locator("#group-name").fill(groupName);
      await page.locator("#group-description").fill(groupDescription);
      await page.getByRole("button", { name: "Create" }).click();

      await expect(page).toHaveURL(/\/groups\//);
      await expect(page.getByRole("heading", { name: groupName })).toBeVisible();
      createdGroupId = page.url().split("/").pop() ?? null;
    });

    await test.step("record profile and password audit events", async () => {
      await page.goto("/profile", { waitUntil: "networkidle" });
      await page.getByPlaceholder("e.g. Affiliation 1-2").fill(profileClassName);
      await page.locator("form").getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Profile updated")).toBeVisible();

      await page.goto("/change-password", { waitUntil: "networkidle" });
      await page.locator("#currentPassword").fill(RUNTIME_ADMIN_INITIAL_PASSWORD);
      await page.locator("#newPassword").fill(rotatedPassword);
      await page.locator("#confirmPassword").fill(rotatedPassword);
      await page.getByRole("button", { name: "Change Password" }).click();

      await expect.poll(async () => {
        const profileUpdatedAudit = await db.query.auditEvents.findFirst({
          where: and(
            eq(auditEvents.action, "user.profile_updated"),
            eq(auditEvents.actorId, runtimeAdmin.id),
            gt(auditEvents.createdAt, verificationStart)
          ),
        });

        return profileUpdatedAudit?.details?.includes("classNameSet") ?? false;
      }).toBe(true);

      await expect.poll(async () => {
        const passwordChangedAudit = await db.query.auditEvents.findFirst({
          where: and(
            eq(auditEvents.action, "user.password_changed"),
            eq(auditEvents.actorId, runtimeAdmin.id),
            gt(auditEvents.createdAt, verificationStart)
          ),
        });

        return Boolean(passwordChangedAudit);
      }).toBe(true);

      await page.context().clearCookies();
      await loginWithCredentials(page, RUNTIME_ADMIN_USERNAME, rotatedPassword);
      await page.waitForURL("**/dashboard", { timeout: 15_000 });
    });

    await test.step("search and filter the audit-log page", async () => {
      const auditLogsTable = page.locator("#main-content table:visible").first();

      await page.goto(AUDIT_LOGS_PATH, { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: "Audit Logs" })).toBeVisible();

      await page.locator("#audit-log-search").fill(prefix);
      await page.getByRole("button", { name: "Apply Filters" }).click();

      await expect(auditLogsTable).toContainText("system_settings.updated");
      await expect(auditLogsTable).toContainText("group.created");
      await expect(auditLogsTable).toContainText(groupName);
      await expect(auditLogsTable).toContainText(`@${runtimeAdmin.username}`);

      const systemSettingsRow = auditLogsTable.getByRole("row", {
        name: /system_settings\.updated/,
      });
      await systemSettingsRow.getByRole("button", { name: "View details" }).click();
      await expect(systemSettingsRow).toContainText("SERVER_ACTION");
      await expect(systemSettingsRow).toContainText("/dashboard/admin/settings");

      if (!createdGroupId) {
        throw new Error("Expected created group id to be captured for audit-log verification");
      }

      await page.locator("#audit-log-search").fill(createdGroupId);
      await page.getByRole("button", { name: "Apply Filters" }).click();

      await expect(auditLogsTable).toContainText(groupName);
      await expect(auditLogsTable).toContainText(`ID: ${createdGroupId}`);
      await expect(auditLogsTable).not.toContainText("system_settings.updated");

      await page.goto(
        `${AUDIT_LOGS_PATH}?search=${encodeURIComponent(createdGroupId)}&resource=group`,
        { waitUntil: "networkidle" }
      );

      await expect(auditLogsTable).toContainText("group.created");
      await expect(auditLogsTable).toContainText(groupName);
      await expect(auditLogsTable).not.toContainText("system_settings.updated");
      await captureEvidence(page, testInfo, "audit-logs-filtered");
    });
  } finally {
    const createdGroup = await db.query.groups.findFirst({
      where: eq(groups.name, groupName),
    });

    if (createdGroup) {
      await db.delete(groups).where(eq(groups.id, createdGroup.id));
    }

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

    await deleteAuditLogFixtures(prefix);
    db.delete(auditEvents)
      .where(sql`
        ${auditEvents.actorId} = ${runtimeAdmin.id}
        and ${auditEvents.action} in ('user.profile_updated', 'user.password_changed')
        and ${auditEvents.createdAt} > ${verificationStart.valueOf()}
      `);
  }
});

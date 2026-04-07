import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./fixtures";

const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-Requested-With": "XMLHttpRequest",
};

async function apiPost(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown>
) {
  const res = await request.post(path, { data, headers: CSRF_HEADERS });
  const body = await res.json().catch(() => ({}));
  if (!res.ok()) {
    throw new Error(`API POST ${path} failed (${res.status()}): ${JSON.stringify(body)}`);
  }
  return body;
}

test("contest detail page lets admins delete a contest and returns to the contests list", async ({
  runtimeAdminPage,
  runtimeSuffix,
}) => {
  const adminRequest = runtimeAdminPage.request;
  const suffix = `contest-delete-${runtimeSuffix}`;

  const groupRes = await apiPost(adminRequest, "/api/v1/groups", {
    name: `[E2E] Contest Delete Group ${suffix}`,
    description: "Contest delete UI test",
  });
  const groupId = groupRes.data.id as string;

  const problemRes = await apiPost(adminRequest, "/api/v1/problems", {
    title: `[E2E] Contest Delete Problem ${suffix}`,
    description: "Contest delete UI test problem",
    visibility: "private",
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    testCases: [{ input: "1 2", expectedOutput: "3", isVisible: true, sortOrder: 0 }],
  });
  const problemId = problemRes.data.id as string;

  const now = Date.now();
  const contestRes = await apiPost(adminRequest, `/api/v1/groups/${groupId}/assignments`, {
    title: `[E2E] Contest Delete ${suffix}`,
    description: "Contest delete UI flow",
    examMode: "scheduled",
    scoringModel: "ioi",
    startsAt: now - 60_000,
    deadline: now + 3_600_000,
    enableAntiCheat: false,
    problems: [{ problemId, points: 100 }],
  });
  const assignmentId = contestRes.data.id as string;

  await runtimeAdminPage.goto(`/dashboard/contests/${assignmentId}`, {
    waitUntil: "networkidle",
  });
  await expect(
    runtimeAdminPage.getByRole("heading", {
      name: `[E2E] Contest Delete ${suffix}`,
    }).first()
  ).toBeVisible();

  await runtimeAdminPage.getByTestId(`assignment-delete-${assignmentId}`).click();
  await runtimeAdminPage.getByTestId(`assignment-delete-confirm-${assignmentId}`).click();

  await runtimeAdminPage.waitForURL(/\/dashboard\/contests$/, { timeout: 15_000 });
  await expect(runtimeAdminPage).toHaveURL(/\/dashboard\/contests$/);
  await expect(runtimeAdminPage.getByText(`[E2E] Contest Delete ${suffix}`)).toHaveCount(0);
});

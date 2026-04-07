import { type APIRequestContext } from "@playwright/test";
import { test, expect } from "./fixtures";
import { BASE_URL } from "./support/constants";

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

test("recruiting invitation candidates are scoped to their contest only", async ({
  browser,
  runtimeAdminPage,
  runtimeSuffix,
}) => {
  const adminRequest = runtimeAdminPage.request;
  const suffix = `recruit-${runtimeSuffix}`;

  const groupRes = await apiPost(adminRequest, "/api/v1/groups", {
    name: `[E2E] Recruiting Group ${suffix}`,
    description: "Recruiting invitation scope test",
  });
  const groupId = groupRes.data.id as string;

  const allowedProblemRes = await apiPost(adminRequest, "/api/v1/problems", {
    title: `[E2E] Recruit Allowed ${suffix}`,
    description: "Visible to invited candidate",
    visibility: "private",
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    testCases: [{ input: "1 2", expectedOutput: "3", isVisible: true, sortOrder: 0 }],
  });
  const allowedProblemId = allowedProblemRes.data.id as string;

  const blockedProblemRes = await apiPost(adminRequest, "/api/v1/problems", {
    title: `[E2E] Recruit Blocked ${suffix}`,
    description: "Must stay hidden from invited candidate",
    visibility: "public",
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    testCases: [{ input: "2 3", expectedOutput: "5", isVisible: true, sortOrder: 0 }],
  });
  const blockedProblemId = blockedProblemRes.data.id as string;

  const now = Date.now();
  const assignmentRes = await apiPost(adminRequest, `/api/v1/groups/${groupId}/assignments`, {
    title: `[E2E] Recruiting Contest ${suffix}`,
    description: "Invitation-only contest",
    examMode: "scheduled",
    scoringModel: "ioi",
    startsAt: now - 60_000,
    deadline: now + 3_600_000,
    enableAntiCheat: false,
    problems: [{ problemId: allowedProblemId, points: 100 }],
  });
  const assignmentId = assignmentRes.data.id as string;

  const invitationRes = await apiPost(
    adminRequest,
    `/api/v1/contests/${assignmentId}/recruiting-invitations`,
    {
      candidateName: `Candidate ${suffix}`,
      candidateEmail: `${suffix}@example.com`,
    }
  );
  const token = invitationRes.data.token as string;

  const candidateContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const candidatePage = await candidateContext.newPage();

  await candidatePage.goto(`${BASE_URL}/recruit/${token}`, { waitUntil: "networkidle" });
  await expect(candidatePage.getByRole("button", { name: /start|continue|시작|계속/i })).toBeVisible();

  await candidatePage.getByRole("button", { name: /start|continue|시작|계속/i }).click();
  await candidatePage.waitForURL(new RegExp(`/dashboard/contests/${assignmentId}$`), {
    timeout: 15_000,
  });

  await expect(candidatePage.locator('a[href="/dashboard/groups"]')).toHaveCount(0);

  await candidatePage.goto(`${BASE_URL}/dashboard/contests`, { waitUntil: "networkidle" });
  await expect(candidatePage).toHaveURL(/\/dashboard\/contests$/);
  await expect(candidatePage.getByText(`[E2E] Recruiting Contest ${suffix}`)).toBeVisible();

  await candidatePage.goto(`${BASE_URL}/dashboard/problems`, { waitUntil: "networkidle" });
  await expect(candidatePage).toHaveURL(/\/dashboard\/problems$/);
  await expect(candidatePage.getByText(`[E2E] Recruit Allowed ${suffix}`)).toBeVisible();
  await expect(candidatePage.getByText(`[E2E] Recruit Blocked ${suffix}`)).toHaveCount(0);

  await candidatePage.goto(`${BASE_URL}/dashboard/problems/${blockedProblemId}`, {
    waitUntil: "networkidle",
  });
  await expect(candidatePage).toHaveURL(/\/dashboard\/contests(?:$|\/)/);

  await candidatePage.goto(`${BASE_URL}/dashboard/contests/join`, { waitUntil: "networkidle" });
  await expect(candidatePage).toHaveURL(/\/dashboard\/contests$/);

  await candidatePage.goto(`${BASE_URL}/dashboard/groups`, { waitUntil: "networkidle" });
  await expect(candidatePage).toHaveURL(/\/dashboard$/);

  await candidateContext.close();
});

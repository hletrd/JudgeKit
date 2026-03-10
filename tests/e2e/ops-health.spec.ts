import { expect, test } from "@playwright/test";

test("health endpoint reports database readiness", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);

  const payload = await response.json();

  expect(payload).toMatchObject({
    checks: {
      auditEvents: "ok",
      database: "ok",
    },
    status: "ok",
  });
  expect(payload.timestamp).toEqual(expect.any(String));
});

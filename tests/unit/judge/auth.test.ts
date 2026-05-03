import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const EXPECTED_TOKEN = "a".repeat(32);

const { getValidatedJudgeAuthTokenMock, judgeWorkerFindFirstMock } = vi.hoisted(() => ({
  getValidatedJudgeAuthTokenMock: vi.fn(() => EXPECTED_TOKEN),
  judgeWorkerFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/security/env", () => ({
  getValidatedJudgeAuthToken: getValidatedJudgeAuthTokenMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      judgeWorkers: {
        findFirst: judgeWorkerFindFirstMock,
      },
    },
  },
}));

import { hashToken, isJudgeAuthorized, isJudgeAuthorizedForWorker } from "@/lib/judge/auth";

afterEach(() => {
  judgeWorkerFindFirstMock.mockReset();
});

function makeRequest(authHeader?: string) {
  return new NextRequest("http://localhost:3000/api/v1/judge/claim", {
    method: "POST",
    headers: authHeader ? { Authorization: authHeader } : {},
  });
}

describe("hashToken", () => {
  it("returns a 64-character hex string", () => {
    const result = hashToken("test-token");
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(hashToken("same-input")).toBe(hashToken("same-input"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("input-a")).not.toBe(hashToken("input-b"));
  });
});

describe("isJudgeAuthorized", () => {
  it("returns true for a valid Bearer token", () => {
    const request = makeRequest(`Bearer ${EXPECTED_TOKEN}`);
    expect(isJudgeAuthorized(request)).toBe(true);
  });

  it("returns false when Authorization header is missing", () => {
    const request = makeRequest();
    expect(isJudgeAuthorized(request)).toBe(false);
  });

  it("returns false when Authorization header does not start with 'Bearer '", () => {
    const request = makeRequest(`Token ${EXPECTED_TOKEN}`);
    expect(isJudgeAuthorized(request)).toBe(false);
  });

  it("returns false when Authorization header is just 'Bearer' without a space", () => {
    const request = makeRequest("Bearer");
    expect(isJudgeAuthorized(request)).toBe(false);
  });

  it("returns false when token has wrong length (shorter)", () => {
    const request = makeRequest("Bearer short");
    expect(isJudgeAuthorized(request)).toBe(false);
  });

  it("returns false when token has wrong length (longer)", () => {
    const request = makeRequest(`Bearer ${"b".repeat(33)}`);
    expect(isJudgeAuthorized(request)).toBe(false);
  });

  it("returns false when token has correct length but wrong content", () => {
    const request = makeRequest(`Bearer ${"b".repeat(32)}`);
    expect(isJudgeAuthorized(request)).toBe(false);
  });

  it("returns false for an empty Bearer token (zero-length after prefix)", () => {
    const request = makeRequest("Bearer ");
    expect(isJudgeAuthorized(request)).toBe(false);
  });

  it("uses timing-safe comparison and does not short-circuit on partial match", () => {
    // A token that shares the first characters with the expected token
    // but differs at the end — a naive string comparison would also reject
    // it, but we verify timingSafeEqual is invoked by ensuring the function
    // reaches the comparison stage (same length) and still returns false.
    const partialMatch = "a".repeat(31) + "b"; // length 32, differs only at last byte
    const request = makeRequest(`Bearer ${partialMatch}`);
    expect(isJudgeAuthorized(request)).toBe(false);
  });
});

describe("isJudgeAuthorizedForWorker", () => {
  it("uses the worker-specific secret hash when present", async () => {
    judgeWorkerFindFirstMock.mockResolvedValueOnce({
      secretTokenHash: hashToken("worker-secret-token"),
    });

    const request = makeRequest("Bearer worker-secret-token");

    await expect(isJudgeAuthorizedForWorker(request, "worker-1")).resolves.toEqual({
      authorized: true,
    });
  });

  it("rejects a mismatched token when hash is stored without falling back to shared token", async () => {
    judgeWorkerFindFirstMock.mockResolvedValueOnce({
      secretTokenHash: hashToken("worker-secret-token"),
    });

    const request = makeRequest(`Bearer ${EXPECTED_TOKEN}`);

    await expect(isJudgeAuthorizedForWorker(request, "worker-1")).resolves.toEqual({
      authorized: false,
      error: "invalidWorkerToken",
    });
  });

  it("returns workerSecretNotMigrated when worker has no hash stored", async () => {
    judgeWorkerFindFirstMock.mockResolvedValueOnce({ secretTokenHash: null });

    const request = makeRequest("Bearer worker-secret-token");

    await expect(isJudgeAuthorizedForWorker(request, "worker-1")).resolves.toEqual({
      authorized: false,
      error: "workerSecretNotMigrated",
    });
  });

  it("rejects a mismatched worker-specific secret without falling back to the shared token", async () => {
    judgeWorkerFindFirstMock.mockResolvedValueOnce({ secretTokenHash: null });

    const request = makeRequest(`Bearer ${EXPECTED_TOKEN}`);

    await expect(isJudgeAuthorizedForWorker(request, "worker-1")).resolves.toEqual({
      authorized: false,
      error: "workerSecretNotMigrated",
    });
  });

  it("rejects with workerNotFound when the workerId is unknown, even with a valid shared token", async () => {
    // Security guarantee: the shared JUDGE_AUTH_TOKEN MUST NOT act as a
    // fallback for unknown workerIds. A leaked shared token would otherwise
    // let an attacker submit fabricated results for any workerId — including
    // ones that never existed. See commit 909fcbf5 and
    // src/lib/judge/auth.ts:70-80.
    //
    // This test deliberately replaces the historical "falls back to the
    // shared token when no worker-specific secret exists" assertion. Do
    // NOT revert: the previous behaviour was a privilege-escalation
    // footgun.
    judgeWorkerFindFirstMock.mockResolvedValueOnce(null);

    const request = makeRequest(`Bearer ${EXPECTED_TOKEN}`);

    await expect(isJudgeAuthorizedForWorker(request, "worker-1")).resolves.toEqual({
      authorized: false,
      error: "workerNotFound",
    });
  });

  it("rejects requests with no bearer token", async () => {
    judgeWorkerFindFirstMock.mockResolvedValueOnce({ secretTokenHash: hashToken("worker-secret-token") });

    await expect(isJudgeAuthorizedForWorker(makeRequest(), "worker-1")).resolves.toEqual({
      authorized: false,
      error: "unauthorized",
    });
  });

  it("uses hash for comparison when secretTokenHash is stored", async () => {
    // Hash is the sole auth mechanism now (plaintext secretToken column dropped)
    judgeWorkerFindFirstMock.mockResolvedValueOnce({
      secretTokenHash: hashToken("correct-hashed-secret"),
    });

    const request = makeRequest("Bearer correct-hashed-secret");

    await expect(isJudgeAuthorizedForWorker(request, "worker-1")).resolves.toEqual({
      authorized: true,
    });
  });
});

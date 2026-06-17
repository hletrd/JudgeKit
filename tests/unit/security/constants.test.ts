import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertUserRole,
  canManageRoleAsync,
  getBuiltinRoleLevel,
  getMinPasswordLength,
  isUserRole,
  isSubmissionStatus,
  ROLE_LEVEL,
  SUBMISSION_STATUSES,
  USER_ROLES,
} from "@/lib/security/constants";

beforeEach(() => {
  vi.resetModules();
});

vi.mock("@/lib/system-settings-config", () => ({
  getConfiguredSettings: () => ({
    minPasswordLength: 8,
    maxSourceCodeSizeBytes: 262144,
    submissionRateLimitMaxPerMinute: 30,
    submissionMaxPending: 5,
    submissionGlobalQueueLimit: 100,
  }),
}));

vi.mock("@/lib/capabilities/cache", () => ({
  getRoleLevel: vi.fn(async (role: string) => {
    const levels: Record<string, number> = {
      student: 0,
      assistant: 1,
      instructor: 2,
      admin: 3,
      super_admin: 4,
    };
    return levels[role] ?? -1;
  }),
  isSuperAdminRole: vi.fn(async (role: string) => {
    const levels: Record<string, number> = {
      student: 0,
      assistant: 1,
      instructor: 2,
      admin: 3,
      super_admin: 4,
    };
    return (levels[role] ?? -1) >= 4;
  }),
  SUPER_ADMIN_LEVEL: 4,
}));

describe("security constants", () => {
  describe("getter functions", () => {
    it("returns min password length from settings", () => {
      expect(getMinPasswordLength()).toBe(8);
    });
  });

  describe("isUserRole", () => {
    it("returns true for valid built-in roles", () => {
      expect(isUserRole("student")).toBe(true);
      expect(isUserRole("assistant")).toBe(true);
      expect(isUserRole("instructor")).toBe(true);
      expect(isUserRole("admin")).toBe(true);
      expect(isUserRole("super_admin")).toBe(true);
    });

    it("returns false for invalid roles", () => {
      expect(isUserRole("invalid_role")).toBe(false);
      expect(isUserRole("")).toBe(false);
      expect(isUserRole("superuser")).toBe(false);
    });
  });

  describe("isSubmissionStatus", () => {
    it("returns true for valid submission statuses", () => {
      expect(isSubmissionStatus("pending")).toBe(true);
      expect(isSubmissionStatus("accepted")).toBe(true);
      expect(isSubmissionStatus("wrong_answer")).toBe(true);
      expect(isSubmissionStatus("time_limit_exceeded")).toBe(true);
      expect(isSubmissionStatus("memory_limit_exceeded")).toBe(true);
      expect(isSubmissionStatus("runtime_error")).toBe(true);
      expect(isSubmissionStatus("compile_error")).toBe(true);
      expect(isSubmissionStatus("output_limit_exceeded")).toBe(true);
      expect(isSubmissionStatus("internal_error")).toBe(true);
      expect(isSubmissionStatus("cancelled")).toBe(true);
    });

    it("returns false for invalid statuses", () => {
      expect(isSubmissionStatus("invalid")).toBe(false);
      expect(isSubmissionStatus("")).toBe(false);
      expect(isSubmissionStatus("custom_status")).toBe(false);
    });
  });

  describe("canManageRoleAsync", () => {
    it("allows higher-level roles to manage lower-level roles asynchronously", async () => {
      await expect(canManageRoleAsync("admin", "instructor")).resolves.toBe(true);
      await expect(canManageRoleAsync("instructor", "student")).resolves.toBe(true);
    });

    it("rejects lower-level roles managing higher-level roles asynchronously", async () => {
      await expect(canManageRoleAsync("student", "instructor")).resolves.toBe(false);
      await expect(canManageRoleAsync("instructor", "admin")).resolves.toBe(false);
    });

    it("only allows super_admin to manage super_admin role asynchronously", async () => {
      await expect(canManageRoleAsync("super_admin", "super_admin")).resolves.toBe(true);
      await expect(canManageRoleAsync("admin", "super_admin")).resolves.toBe(false);
    });
  });

  describe("getBuiltinRoleLevel", () => {
    it("returns correct level for built-in roles", () => {
      expect(getBuiltinRoleLevel("student")).toBe(0);
      expect(getBuiltinRoleLevel("assistant")).toBe(1);
      expect(getBuiltinRoleLevel("instructor")).toBe(2);
      expect(getBuiltinRoleLevel("admin")).toBe(3);
      expect(getBuiltinRoleLevel("super_admin")).toBe(4);
    });

    it("returns -1 for unknown roles", () => {
      expect(getBuiltinRoleLevel("unknown_role")).toBe(-1);
      expect(getBuiltinRoleLevel("custom_role")).toBe(-1);
    });
  });

  describe("assertUserRole", () => {
    it("returns valid roles", () => {
      expect(assertUserRole("student")).toBe("student");
      expect(assertUserRole("admin")).toBe("admin");
    });

    it("throws error for invalid roles", () => {
      expect(() => assertUserRole("invalid")).toThrow("Invalid user role: invalid");
      expect(() => assertUserRole("")).toThrow("Invalid user role: ");
    });
  });

  describe("role constants", () => {
    it("has correct role hierarchy", () => {
      expect(ROLE_LEVEL).toEqual({
        student: 0,
        assistant: 1,
        instructor: 2,
        admin: 3,
        super_admin: 4,
      });
    });

    it("has all built-in user roles", () => {
      expect(USER_ROLES).toEqual(["student", "assistant", "instructor", "admin", "super_admin"]);
    });
  });

  describe("submission statuses", () => {
    it("has all submission statuses", () => {
      expect(SUBMISSION_STATUSES).toEqual([
        "pending",
        "queued",
        "judging",
        "accepted",
        "wrong_answer",
        "compile_error",
        "runtime_error",
        "time_limit_exceeded",
        "memory_limit_exceeded",
        "output_limit_exceeded",
        "internal_error",
        "cancelled",
      ]);
    });
  });
});

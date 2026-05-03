import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_CAPABILITIES, DEFAULT_ROLE_LEVELS } from "@/lib/capabilities/defaults";
import { ALL_CAPABILITIES, BUILTIN_ROLE_NAMES, isBuiltinRole, isCapability } from "@/lib/capabilities/types";

describe("DEFAULT_ROLE_CAPABILITIES", () => {
  it("defines capabilities for all 5 built-in roles", () => {
    expect(Object.keys(DEFAULT_ROLE_CAPABILITIES)).toHaveLength(5);
    for (const role of BUILTIN_ROLE_NAMES) {
      expect(DEFAULT_ROLE_CAPABILITIES[role]).toBeDefined();
      expect(Array.isArray(DEFAULT_ROLE_CAPABILITIES[role])).toBe(true);
    }
  });

  it("student has content capabilities", () => {
    const studentCaps = DEFAULT_ROLE_CAPABILITIES.student;
    expect(studentCaps).toContain("content.submit_solutions");
    expect(studentCaps).toContain("content.view_own_submissions");
  });

  it("student does not have admin capabilities", () => {
    const studentCaps = DEFAULT_ROLE_CAPABILITIES.student;
    expect(studentCaps).not.toContain("users.view");
    expect(studentCaps).not.toContain("system.settings");
    expect(studentCaps).not.toContain("problems.create");
  });

  it("assistant extends student capabilities without full instructor access", () => {
    const assistantCaps = DEFAULT_ROLE_CAPABILITIES.assistant;
    // Assistants intentionally do NOT have submissions.view_all — the
    // group-scope filter at src/lib/assignments/submissions.ts:165-179
    // (getSubmissionReviewGroupIds) restricts assistants to their assigned
    // teaching groups when assignments.view_status is granted. Granting
    // submissions.view_all would short-circuit that scope filter and let
    // assistants see submissions for any group. See commit 246822fa.
    expect(assistantCaps).not.toContain("submissions.view_all");
    expect(assistantCaps).toContain("submissions.view_source");
    expect(assistantCaps).toContain("submissions.comment");
    expect(assistantCaps).toContain("submissions.rejudge");
    expect(assistantCaps).toContain("assignments.view_status");
    expect(assistantCaps).toContain("problems.view_all");
    expect(assistantCaps).not.toContain("users.view");
    expect(assistantCaps).not.toContain("problems.create");
    expect(assistantCaps).not.toContain("users.delete");
  });

  it("instructor has problem and submission capabilities", () => {
    const instructorCaps = DEFAULT_ROLE_CAPABILITIES.instructor;
    expect(instructorCaps).toContain("problems.create");
    expect(instructorCaps).toContain("problems.edit");
    expect(instructorCaps).toContain("submissions.view_all");
    expect(instructorCaps).toContain("users.view");
  });

  it("instructor does not have system capabilities", () => {
    const instructorCaps = DEFAULT_ROLE_CAPABILITIES.instructor;
    expect(instructorCaps).not.toContain("system.settings");
    expect(instructorCaps).not.toContain("system.backup");
    expect(instructorCaps).not.toContain("users.delete");
  });

  it("admin has system capabilities", () => {
    const adminCaps = DEFAULT_ROLE_CAPABILITIES.admin;
    expect(adminCaps).toContain("system.settings");
    expect(adminCaps).toContain("system.backup");
    expect(adminCaps).toContain("users.create");
    expect(adminCaps).toContain("users.edit");
    expect(adminCaps).toContain("users.delete");
  });

  it("super_admin has ALL capabilities", () => {
    const superAdminCaps = DEFAULT_ROLE_CAPABILITIES.super_admin;
    for (const cap of ALL_CAPABILITIES) {
      expect(superAdminCaps).toContain(cap);
    }
  });

  it("each role's capabilities are a subset of the next level", () => {
    const studentSet = new Set(DEFAULT_ROLE_CAPABILITIES.student);
    const assistantSet = new Set(DEFAULT_ROLE_CAPABILITIES.assistant);
    const instructorSet = new Set(DEFAULT_ROLE_CAPABILITIES.instructor);
    const adminSet = new Set(DEFAULT_ROLE_CAPABILITIES.admin);
    const superAdminSet = new Set(DEFAULT_ROLE_CAPABILITIES.super_admin);

    // Every student cap should be in assistant
    for (const cap of studentSet) {
      expect(assistantSet.has(cap)).toBe(true);
    }
    // Every assistant cap should be in instructor
    for (const cap of assistantSet) {
      expect(instructorSet.has(cap)).toBe(true);
    }
    // Every instructor cap should be in admin
    for (const cap of instructorSet) {
      expect(adminSet.has(cap)).toBe(true);
    }
    // Every admin cap should be in super_admin
    for (const cap of adminSet) {
      expect(superAdminSet.has(cap)).toBe(true);
    }
  });

  it("all capabilities in defaults are valid", () => {
    for (const role of BUILTIN_ROLE_NAMES) {
      for (const cap of DEFAULT_ROLE_CAPABILITIES[role]) {
        expect(isCapability(cap)).toBe(true);
      }
    }
  });
});

describe("DEFAULT_ROLE_LEVELS", () => {
  it("defines levels for all 5 built-in roles", () => {
    expect(Object.keys(DEFAULT_ROLE_LEVELS)).toHaveLength(5);
  });

  it("maintains hierarchy: student < assistant < instructor < admin < super_admin", () => {
    expect(DEFAULT_ROLE_LEVELS.student).toBeLessThan(DEFAULT_ROLE_LEVELS.assistant);
    expect(DEFAULT_ROLE_LEVELS.assistant).toBeLessThan(DEFAULT_ROLE_LEVELS.instructor);
    expect(DEFAULT_ROLE_LEVELS.instructor).toBeLessThan(DEFAULT_ROLE_LEVELS.admin);
    expect(DEFAULT_ROLE_LEVELS.admin).toBeLessThan(DEFAULT_ROLE_LEVELS.super_admin);
  });
});

describe("isBuiltinRole", () => {
  it("returns true for built-in roles", () => {
    expect(isBuiltinRole("student")).toBe(true);
    expect(isBuiltinRole("assistant")).toBe(true);
    expect(isBuiltinRole("instructor")).toBe(true);
    expect(isBuiltinRole("admin")).toBe(true);
    expect(isBuiltinRole("super_admin")).toBe(true);
  });

  it("returns false for custom roles", () => {
    expect(isBuiltinRole("ta")).toBe(false);
    expect(isBuiltinRole("contest_manager")).toBe(false);
    expect(isBuiltinRole("")).toBe(false);
  });
});

describe("isCapability", () => {
  it("returns true for valid capabilities", () => {
    expect(isCapability("users.view")).toBe(true);
    expect(isCapability("system.settings")).toBe(true);
    expect(isCapability("content.submit_solutions")).toBe(true);
  });

  it("returns false for invalid capabilities", () => {
    expect(isCapability("users.fly")).toBe(false);
    expect(isCapability("invalid")).toBe(false);
    expect(isCapability("")).toBe(false);
  });
});

describe("ALL_CAPABILITIES", () => {
  it("has no duplicates", () => {
    const set = new Set(ALL_CAPABILITIES);
    expect(set.size).toBe(ALL_CAPABILITIES.length);
  });

  it("has at least 35 capabilities", () => {
    expect(ALL_CAPABILITIES.length).toBeGreaterThanOrEqual(35);
  });
});

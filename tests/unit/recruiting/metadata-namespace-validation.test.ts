/**
 * Unit tests for _sys. namespace validation in recruiting invitations.
 *
 * The _sys. prefix is reserved for internal system keys (e.g.,
 * _sys.failedRedeemAttempts, _sys.accountPasswordResetRequired). User-supplied
 * metadata must not contain keys with this prefix to prevent collision with
 * internal flags and brute-force counter manipulation.
 *
 * These tests validate the rejection logic in createRecruitingInvitation,
 * bulkCreateRecruitingInvitations, updateRecruitingInvitation, AND at the
 * Zod schema level (createRecruitingInvitationSchema,
 * updateRecruitingInvitationSchema).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB module before importing the functions under test
vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "test-id" }]) }) }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({ rowCount: 1 }) }) }),
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) }),
  },
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: vi.fn().mockResolvedValue(new Date()),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  createRecruitingInvitation,
  bulkCreateRecruitingInvitations,
  updateRecruitingInvitation,
} from "@/lib/assignments/recruiting-invitations";

import {
  createRecruitingInvitationSchema,
  updateRecruitingInvitationSchema,
} from "@/lib/validators/recruiting-invitations";

describe("recruiting invitations _sys. namespace validation", () => {
  const baseParams = {
    assignmentId: "assignment-1",
    candidateName: "Test Candidate",
    createdBy: "admin-1",
  };

  describe("createRecruitingInvitation", () => {
    it("should reject metadata with _sys. prefix key", async () => {
      await expect(
        createRecruitingInvitation({
          ...baseParams,
          metadata: { "_sys.failedRedeemAttempts": "5" },
        })
      ).rejects.toThrow("reserved prefix");
    });

    it("should reject metadata with any _sys. prefix key", async () => {
      await expect(
        createRecruitingInvitation({
          ...baseParams,
          metadata: { "_sys.customFlag": "true" },
        })
      ).rejects.toThrow("reserved prefix");
    });

    it("should accept metadata without _sys. prefix", async () => {
      // This should NOT throw — the DB mock will handle the insert
      const result = await createRecruitingInvitation({
        ...baseParams,
        metadata: { department: "Engineering", source: "referral" },
      });
      expect(result).toBeDefined();
    });

    it("should accept empty metadata", async () => {
      const result = await createRecruitingInvitation({
        ...baseParams,
        metadata: {},
      });
      expect(result).toBeDefined();
    });
  });

  describe("bulkCreateRecruitingInvitations", () => {
    it("should reject bulk invitation with _sys. prefix key", async () => {
      await expect(
        bulkCreateRecruitingInvitations({
          assignmentId: baseParams.assignmentId,
          createdBy: baseParams.createdBy,
          invitations: [
            { candidateName: "Candidate 1", metadata: { "_sys.test": "x" } },
          ],
        })
      ).rejects.toThrow("reserved prefix");
    });

    it("should reject if any invitation in bulk has _sys. prefix key", async () => {
      await expect(
        bulkCreateRecruitingInvitations({
          assignmentId: baseParams.assignmentId,
          createdBy: baseParams.createdBy,
          invitations: [
            { candidateName: "Candidate 1", metadata: { department: "Eng" } },
            { candidateName: "Candidate 2", metadata: { "_sys.override": "1" } },
          ],
        })
      ).rejects.toThrow("reserved prefix");
    });

    it("should accept bulk invitations without _sys. prefix keys", async () => {
      const result = await bulkCreateRecruitingInvitations({
        assignmentId: baseParams.assignmentId,
        createdBy: baseParams.createdBy,
        invitations: [
          { candidateName: "Candidate 1", metadata: { department: "Eng" } },
          { candidateName: "Candidate 2" },
        ],
      });
      expect(result).toBeDefined();
    });
  });

  describe("updateRecruitingInvitation", () => {
    it("should reject metadata with _sys. prefix key on update", async () => {
      await expect(
        updateRecruitingInvitation("inv-1", {
          metadata: { "_sys.failedRedeemAttempts": "0" },
        })
      ).rejects.toThrow("reserved prefix");
    });

    it("should reject metadata with _sys.accountPasswordResetRequired on update", async () => {
      await expect(
        updateRecruitingInvitation("inv-1", {
          metadata: { "_sys.accountPasswordResetRequired": "true" },
        })
      ).rejects.toThrow("reserved prefix");
    });

    it("should accept metadata without _sys. prefix on update", async () => {
      // Should NOT throw — the DB mock handles the update
      await expect(
        updateRecruitingInvitation("inv-1", {
          metadata: { department: "Engineering" },
        })
      ).resolves.toBeUndefined();
    });

    it("should accept update without metadata", async () => {
      await expect(
        updateRecruitingInvitation("inv-1", {
          expiresAt: null,
        })
      ).resolves.toBeUndefined();
    });
  });
});

describe("recruiting invitation Zod schemas _sys. namespace rejection", () => {
  describe("createRecruitingInvitationSchema", () => {
    it("should reject metadata with _sys. prefix key at schema level", () => {
      const result = createRecruitingInvitationSchema.safeParse({
        candidateName: "Test",
        candidateEmail: "test@example.com",
        metadata: { "_sys.failedRedeemAttempts": "5" },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = result.error.issues.map((i) => i.message).join("; ");
        expect(msg).toContain("_sys.");
      }
    });

    it("should accept metadata without _sys. prefix at schema level", () => {
      const result = createRecruitingInvitationSchema.safeParse({
        candidateName: "Test",
        candidateEmail: "test@example.com",
        metadata: { department: "Engineering" },
      });
      expect(result.success).toBe(true);
    });

    it("should accept empty metadata at schema level", () => {
      const result = createRecruitingInvitationSchema.safeParse({
        candidateName: "Test",
        candidateEmail: "test@example.com",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("updateRecruitingInvitationSchema", () => {
    it("should reject metadata with _sys. prefix key at schema level", () => {
      const result = updateRecruitingInvitationSchema.safeParse({
        metadata: { "_sys.accountPasswordResetRequired": "true" },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = result.error.issues.map((i) => i.message).join("; ");
        expect(msg).toContain("_sys.");
      }
    });

    it("should accept metadata without _sys. prefix at schema level", () => {
      const result = updateRecruitingInvitationSchema.safeParse({
        metadata: { department: "Engineering" },
      });
      expect(result.success).toBe(true);
    });

    it("should accept update without metadata at schema level", () => {
      const result = updateRecruitingInvitationSchema.safeParse({
        status: "revoked",
      });
      expect(result.success).toBe(true);
    });
  });
});

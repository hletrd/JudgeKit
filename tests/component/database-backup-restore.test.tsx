import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseBackupRestore } from "@/app/(dashboard)/dashboard/admin/settings/database-backup-restore";

const {
  apiFetchMock,
  toastSuccessMock,
  toastErrorMock,
  createObjectURLMock,
  revokeObjectURLMock,
  anchorClickMock,
} = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  createObjectURLMock: vi.fn(() => "blob:judgekit"),
  revokeObjectURLMock: vi.fn(),
  anchorClickMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations:
    (namespace: string) =>
    (key: string) =>
      (
        {
          "admin.settings": {
            portableExportTitle: "Portable Sanitized Export",
            portableExportDescription: "Portable export description",
            downloadPortableExport: "Download Portable Export",
            portableExportSuccess: "Portable export downloaded.",
            portableExportFailed: "Portable export failed.",
            fullBackupTitle: "Full Disaster-Recovery Backup",
            fullBackupDescription: "Full backup description",
            downloadBackup: "Download Full Backup",
            backupSuccess: "Backup downloaded.",
            backupFailed: "Backup failed.",
            passwordRequired: "Password is required.",
            enterPassword: "Enter your password",
            restoreTitle: "Restore Database",
            restoreWarning: "Restore warning",
            restoreDatabase: "Restore from File...",
            confirmRestore: "Confirm Restore",
            restoreSuccess: "Restore success",
            restoreFailed: "Restore failed",
            noFileSelected: "Select a file",
          },
          common: {
            loading: "Loading...",
            confirm: "Confirm",
            cancel: "Cancel",
          },
        }[namespace as "admin.settings" | "common"] as Record<string, string>
      )[key] ?? key,
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

describe("DatabaseBackupRestore", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["backup"]),
    });
    vi.stubGlobal("URL", {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(anchorClickMock);
  });

  it("offers a portable export flow that hits the sanitized export endpoint", async () => {
    const user = userEvent.setup();
    render(<DatabaseBackupRestore isSuperAdmin />);

    expect(screen.getByText("Portable Sanitized Export")).toBeInTheDocument();
    expect(screen.getByText("Full Disaster-Recovery Backup")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Download Portable Export" }));
    await user.type(screen.getByPlaceholderText("Enter your password"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/v1/admin/migrate/export",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ password: "secret-password" }),
        })
      );
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Portable export downloaded.");
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(anchorClickMock).toHaveBeenCalled();
  });

  it("keeps the full backup flow on the ZIP backup endpoint", async () => {
    const user = userEvent.setup();
    render(<DatabaseBackupRestore isSuperAdmin />);

    await user.click(screen.getByRole("button", { name: "Download Full Backup" }));
    await user.type(screen.getByPlaceholderText("Enter your password"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/v1/admin/backup?includeFiles=true",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ password: "secret-password" }),
        })
      );
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Backup downloaded.");
  });
});

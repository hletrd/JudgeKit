import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import EditGroupDialog from "@/app/(public)/groups/edit-group-dialog";

const {
  apiFetchMock,
  refreshMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  refreshMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations:
    (namespace: string) =>
    (key: string) =>
      (
        {
          groups: {
            editDialogTitle: "Edit Group",
            editDialogDescription: "Update the group name and description.",
            nameLabel: "Group Name",
            descriptionLabel: "Description",
            instructorLabelSimple: "Primary instructor",
            selectInstructor: "Select an instructor",
            updateSuccess: "Group updated",
            updateError: "Failed to update group",
            nameRequired: "Group name is required",
            nameTooLong: "Group name must be 100 characters or less",
            descriptionTooLong: "Description must be 500 characters or less",
          },
          common: {
            edit: "Edit",
            cancel: "Cancel",
            save: "Save",
            loading: "Loading...",
            error: "Error",
          },
        }[namespace as "groups" | "common"] as Record<string, string>
      )[key] ?? key,
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  SelectValue: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

describe("EditGroupDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "group-1" } }),
    });
  });

  it("submits updated group data to the patch route", async () => {
    const user = userEvent.setup();
    render(
      <EditGroupDialog
        group={{
          id: "group-1",
          name: "Original",
          description: "Old description",
          instructorId: "instructor-1",
          availableInstructors: [
            { id: "instructor-1", name: "Instructor One", username: "inst1" },
            { id: "instructor-2", name: "Instructor Two", username: "inst2" },
          ],
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Primary instructor")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Group Name"));
    await user.type(screen.getByLabelText("Group Name"), "Updated Group");
    await user.clear(screen.getByLabelText("Description"));
    await user.type(screen.getByLabelText("Description"), "New description");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/api/v1/groups/group-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Updated Group",
          description: "New description",
          instructorId: "instructor-1",
        }),
      });
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Group updated");
    expect(refreshMock).toHaveBeenCalled();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GroupMembersManager } from "@/app/(public)/groups/[id]/group-members-manager";

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations:
    (namespace: string) =>
    (key: string, values?: Record<string, string | number>) =>
      (
        {
          groups: {
            membersTitle: "Members",
            memberCount: `${values?.count ?? 0} members`,
            availableStudentsLabel: "Available users",
            availableStudentsPlaceholder: "Select a user",
            availableStudentsEmpty: "All active users are already enrolled in this group.",
            availableStudentsSearchPlaceholder: "Filter available users...",
            availableStudentsSearchEmpty: "No available users match the current filter.",
            addMember: "Add member",
            selectStudents: "Select users to enroll",
            bulkAdd: "Bulk Add",
            removeMember: "Remove",
            removeMemberDialogTitle: "Remove this member from the group?",
            removeMemberDialogDescription: `${values?.name ?? ""} will lose access.`,
          },
          common: {
            error: "Error",
            cancel: "Cancel",
            done: "Done",
            loading: "Loading...",
            class: "Class",
            action: "Action",
            notSet: "Not set",
          },
        }[namespace as "groups" | "common"] as Record<string, string>
      )[key] ?? key,
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/components/destructive-action-dialog", () => ({
  DestructiveActionDialog: () => null,
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
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("GroupMembersManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters the available-student bulk list by the search query", async () => {
    const user = userEvent.setup();

    render(
      <GroupMembersManager
        groupId="group-1"
        canManage
        members={[]}
        availableStudents={[
          { id: "student-1", name: "Alice", username: "alice", className: "CS101" },
          { id: "student-2", name: "Bob", username: "bob", className: "CS102" },
        ]}
      />
    );

    expect(screen.getAllByText("Alice (@alice)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bob (@bob)").length).toBeGreaterThan(0);

    await user.type(
      screen.getByPlaceholderText("Filter available users..."),
      "alice"
    );

    expect(screen.getAllByText("Alice (@alice)").length).toBeGreaterThan(0);
    expect(screen.queryByText("Bob (@bob)")).not.toBeInTheDocument();
  });
});

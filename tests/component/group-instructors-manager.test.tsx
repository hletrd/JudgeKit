import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GroupInstructorsManager } from "@/app/(public)/groups/[id]/group-instructors-manager";

vi.mock("next-intl", () => ({
  useTranslations:
    (_namespace: string) =>
    (key: string) =>
      (
        {
          groupInstructors: "Co-Instructors & TAs",
          selectUser: "Select a user",
          availableInstructorSearchPlaceholder: "Filter staff users...",
          availableInstructorSearchEmpty: "No staff users match the current filter.",
          addInstructor: "Add",
          noGroupInstructors: "No co-instructors or TAs assigned to this group yet.",
          coInstructor: "Co-Instructor",
          teachingAssistant: "TA",
          name: "Name",
          role: "Role",
        } as Record<string, string>
      )[key] ?? key,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  SelectValue: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("GroupInstructorsManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters available staff users by the search query", async () => {
    const user = userEvent.setup();

    render(
      <GroupInstructorsManager
        groupId="group-1"
        canManage
        instructors={[]}
        availableUsers={[
          { id: "user-1", name: "Alice", username: "alice" },
          { id: "user-2", name: "Bob", username: "bob" },
        ]}
      />
    );

    expect(screen.getAllByText("Alice (alice)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bob (bob)").length).toBeGreaterThan(0);

    await user.type(screen.getByPlaceholderText("Filter staff users..."), "alice");

    expect(screen.getAllByText("Alice (alice)").length).toBeGreaterThan(0);
    expect(screen.queryByText("Bob (bob)")).not.toBeInTheDocument();
  });
});

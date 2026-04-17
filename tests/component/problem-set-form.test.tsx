import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProblemSetForm from "@/app/(dashboard)/dashboard/problem-sets/_components/problem-set-form";

const { pushMock, refreshMock, apiFetchMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  apiFetchMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      createTitle: "Create Problem Set",
      createDescription: "Create a new set of problems.",
      nameLabel: "Name",
      descriptionLabel: "Description",
      publicLabel: "Public",
      publicDescription: "Visible publicly",
      problemsTitle: "Problems",
      problemsDescription: "Select problems to include in this set.",
      groupsTitle: "Assigned Groups",
      groupsDescription: "Groups that have access to the problems in this set.",
      selectProblem: "Select a problem",
      removeProblem: "Remove",
      moveProblemUp: "Move problem up",
      moveProblemDown: "Move problem down",
      noProblems: "No problems in this set.",
      assignGroups: "Assign Groups",
      createSuccess: "Problem set created",
      createFailed: "Failed to create problem set",
      cancel: "Cancel",
      create: "Create",
      loading: "Loading",
      save: "Save",
      delete: "Delete",
      unknown: "Unknown",
    };
    return messages[key] ?? key;
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const SelectContext = React.createContext<{ onValueChange?: (value: string) => void }>({});

  function Select({ children, onValueChange }: { children: React.ReactNode; onValueChange?: (value: string) => void }) {
    return <SelectContext.Provider value={{ onValueChange }}>{children}</SelectContext.Provider>;
  }

  function SelectTrigger({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  }

  function SelectValue({ children, placeholder }: { children?: React.ReactNode; placeholder?: string }) {
    return <span>{children ?? placeholder}</span>;
  }

  function SelectContent({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  }

  function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
    const { onValueChange } = React.useContext(SelectContext);
    return (
      <button type="button" onClick={() => onValueChange?.(value)}>
        {children}
      </button>
    );
  }

  return {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
  };
});

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ render }: { render: React.ReactNode }) => <>{render}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("ProblemSetForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "ps-1" } }),
    });
  });

  it("creates a problem set and preserves add/remove/reorder problem order in the payload", async () => {
    render(
      <ProblemSetForm
        availableProblems={[
          { id: "p-1", title: "A + B" },
          { id: "p-2", title: "Prefix Sum" },
          { id: "p-3", title: "Graph Paths" },
        ]}
        availableGroups={[]}
        canEditMetadata
      />
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Warmup Set" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Starter problems" } });

    fireEvent.click(screen.getByRole("button", { name: "A + B" }));
    fireEvent.click(screen.getByRole("button", { name: "Prefix Sum" }));
    fireEvent.click(screen.getByRole("button", { name: "Graph Paths" }));

    expect(screen.getByText("1. A + B")).toBeInTheDocument();
    expect(screen.getByText("2. Prefix Sum")).toBeInTheDocument();
    expect(screen.getByText("3. Graph Paths")).toBeInTheDocument();

    const prefixRow = screen.getByText("2. Prefix Sum").closest("div");
    if (!prefixRow) throw new Error("Expected Prefix Sum row");
    fireEvent.click(within(prefixRow).getByRole("button", { name: "Move problem up" }));

    expect(screen.getByText("1. Prefix Sum")).toBeInTheDocument();
    expect(screen.getByText("2. A + B")).toBeInTheDocument();

    const graphRow = screen.getByText("3. Graph Paths").closest("div");
    if (!graphRow) throw new Error("Expected Graph Paths row");
    fireEvent.click(within(graphRow).getByRole("button", { name: "Remove" }));

    expect(screen.queryByText("3. Graph Paths")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/v1/problem-sets",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            name: "Warmup Set",
            description: "Starter problems",
            isPublic: false,
            problemIds: ["p-2", "p-1"],
          }),
        })
      );
    });

    expect(toastSuccessMock).toHaveBeenCalledWith("Problem set created");
    expect(pushMock).toHaveBeenCalledWith("/dashboard/problem-sets/ps-1");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("renders edit screens read-only when metadata and group management capabilities are disabled", () => {
    render(
      <ProblemSetForm
        problemSet={{
          id: "ps-1",
          name: "Locked Set",
          description: "Read only",
          isPublic: false,
          problemIds: ["p-1"],
          groupIds: ["g-1"],
          assignedGroups: [{ id: "g-1", name: "CS101" }],
        }}
        availableProblems={[{ id: "p-1", title: "A + B" }]}
        availableGroups={[{ id: "g-1", name: "CS101" }, { id: "g-2", name: "CS102" }]}
        canEditMetadata={false}
        canDelete={false}
        canAssignGroups={false}
      />
    );

    expect(screen.getByDisplayValue("Locked Set")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByText("CS101")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assign Groups" })).not.toBeInTheDocument();
  });
});

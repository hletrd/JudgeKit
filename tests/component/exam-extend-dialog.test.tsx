import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExamExtendDialog } from "@/app/(public)/groups/[id]/assignments/[assignmentId]/exam-extend-dialog";

const { apiFetchMock, refreshMock, toastSuccessMock, toastErrorMock, toastInfoMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  refreshMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastInfoMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, _values?: Record<string, unknown>) =>
    `${namespace}.${key}`,
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
    info: toastInfoMock,
  },
}));

function renderDialog() {
  return render(
    <ExamExtendDialog
      groupId="group-1"
      assignmentId="assignment-1"
      userId="student-1"
      studentName="Student One"
      personalDeadline="2026-01-01T01:00:00.000Z"
    />
  );
}

async function openDialog() {
  await userEvent.click(
    screen.getByRole("button", { name: "groups.assignmentDetail.examExtend.title" })
  );
  await screen.findByLabelText("groups.assignmentDetail.examExtend.minutesLabel");
}

describe("ExamExtendDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
  });

  it("uses a numeric mobile keyboard for the minutes input (AGG2-6)", async () => {
    renderDialog();
    await openDialog();

    const input = screen.getByLabelText("groups.assignmentDetail.examExtend.minutesLabel");
    expect(input.getAttribute("inputmode")).toBe("numeric");
  });

  it("submits on Enter from the minutes input", async () => {
    renderDialog();
    await openDialog();

    const input = screen.getByLabelText("groups.assignmentDetail.examExtend.minutesLabel");
    await userEvent.clear(input);
    await userEvent.type(input, "30{Enter}");

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/v1/groups/group-1/assignments/assignment-1/exam-sessions/student-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ extendMinutes: 30 }),
        })
      );
    });
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(refreshMock).toHaveBeenCalled();
  });

  it("Cancel closes the dialog without sending a PATCH", async () => {
    renderDialog();
    await openDialog();

    await userEvent.click(screen.getByRole("button", { name: "common.cancel" }));

    await waitFor(() => {
      expect(
        screen.queryByLabelText("groups.assignmentDetail.examExtend.minutesLabel")
      ).toBeNull();
    });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("rejects out-of-range minutes client-side (no request)", async () => {
    renderDialog();
    await openDialog();

    const input = screen.getByLabelText("groups.assignmentDetail.examExtend.minutesLabel");
    await userEvent.clear(input);
    await userEvent.type(input, "9999{Enter}");

    expect(toastErrorMock).toHaveBeenCalledWith(
      "groups.assignmentDetail.examExtend.invalidMinutes"
    );
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

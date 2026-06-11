import { describe, expect, it } from "vitest";
import { getEffectiveExamCloseAt } from "@/lib/assignments/exam-close";

const T1000 = new Date(1000);
const T2000 = new Date(2000);

describe("getEffectiveExamCloseAt (RPF cycle-3 AGG3-1)", () => {
  it("windowed: returns the personal deadline when it is LATER than the assignment close (staff extension)", () => {
    expect(
      getEffectiveExamCloseAt({ examMode: "windowed", deadline: T1000 }, T2000)
    ).toEqual(T2000);
  });

  it("windowed: keeps the assignment close when the personal deadline is earlier (never shrinks)", () => {
    expect(
      getEffectiveExamCloseAt({ examMode: "windowed", deadline: T2000 }, T1000)
    ).toEqual(T2000);
  });

  it("windowed: equal personal deadline and close → the close (boundary, no behavior change)", () => {
    expect(
      getEffectiveExamCloseAt({ examMode: "windowed", deadline: T1000 }, new Date(1000))
    ).toEqual(T1000);
  });

  it("windowed: no session (null personal deadline) → the assignment close", () => {
    expect(
      getEffectiveExamCloseAt({ examMode: "windowed", deadline: T1000 }, null)
    ).toEqual(T1000);
  });

  it("windowed: personal deadline with NO assignment close → the personal deadline", () => {
    expect(
      getEffectiveExamCloseAt({ examMode: "windowed", deadline: null }, T2000)
    ).toEqual(T2000);
  });

  it("scheduled: personal deadline is ignored (extensions are windowed-only)", () => {
    expect(
      getEffectiveExamCloseAt({ examMode: "scheduled", deadline: T1000 }, T2000)
    ).toEqual(T1000);
  });

  it("none: assignment close passes through", () => {
    expect(getEffectiveExamCloseAt({ examMode: "none", deadline: T1000 }, null)).toEqual(T1000);
  });

  it("no deadlines anywhere → null (no close configured)", () => {
    expect(getEffectiveExamCloseAt({ examMode: "windowed", deadline: null }, null)).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

describe("useKeyboardShortcuts", () => {
  let handlerMock: Mock<() => void>;

  beforeEach(() => {
    handlerMock = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup any remaining listeners
    document.removeEventListener("keydown", () => {});
  });

  function dispatchKeyDown(options: {
    key: string;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    metaKey?: boolean;
    target?: EventTarget;
  }) {
    const event = new KeyboardEvent("keydown", {
      key: options.key,
      ctrlKey: options.ctrlKey ?? false,
      altKey: options.altKey ?? false,
      shiftKey: options.shiftKey ?? false,
      metaKey: options.metaKey ?? false,
      bubbles: true,
      cancelable: true,
    });
    if (options.target) {
      Object.defineProperty(event, "target", { value: options.target });
    }
    document.dispatchEvent(event);
    return event;
  }

  it("calls handler on plain key press", () => {
    renderHook(() => useKeyboardShortcuts({ s: handlerMock }));

    dispatchKeyDown({ key: "s" });

    expect(handlerMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT call handler when modifier keys are pressed", () => {
    renderHook(() => useKeyboardShortcuts({ s: handlerMock }));

    dispatchKeyDown({ key: "s", ctrlKey: true });
    dispatchKeyDown({ key: "s", altKey: true });
    dispatchKeyDown({ key: "s", shiftKey: true });
    dispatchKeyDown({ key: "s", metaKey: true });

    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("calls handler for modifier+key combinations when registered", () => {
    renderHook(() => useKeyboardShortcuts({ "Ctrl+s": handlerMock }));

    dispatchKeyDown({ key: "s", ctrlKey: true });

    expect(handlerMock).toHaveBeenCalledTimes(1);
  });

  it("supports multiple modifier keys", () => {
    renderHook(() => useKeyboardShortcuts({ "Ctrl+Shift+s": handlerMock }));

    dispatchKeyDown({ key: "s", ctrlKey: true, shiftKey: true });

    expect(handlerMock).toHaveBeenCalledTimes(1);
  });

  it("does not call handler for plain key when only modifier combo is registered", () => {
    renderHook(() => useKeyboardShortcuts({ "Ctrl+s": handlerMock }));

    dispatchKeyDown({ key: "s" });

    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("ignores key presses when an input element has focus", () => {
    renderHook(() => useKeyboardShortcuts({ s: handlerMock }));

    const input = document.createElement("input");
    document.body.appendChild(input);
    dispatchKeyDown({ key: "s", target: input });
    document.body.removeChild(input);

    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("ignores key presses when a textarea has focus", () => {
    renderHook(() => useKeyboardShortcuts({ s: handlerMock }));

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    dispatchKeyDown({ key: "s", target: textarea });
    document.body.removeChild(textarea);

    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("ignores key presses when a select has focus", () => {
    renderHook(() => useKeyboardShortcuts({ s: handlerMock }));

    const select = document.createElement("select");
    document.body.appendChild(select);
    dispatchKeyDown({ key: "s", target: select });
    document.body.removeChild(select);

    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("ignores modifier key presses by themselves", () => {
    const ctrlHandler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ Control: ctrlHandler }));

    dispatchKeyDown({ key: "Control", ctrlKey: true });

    // The handler for "Control" itself should NOT fire when Ctrl is pressed
    // because we treat modifier keys specially
    expect(ctrlHandler).not.toHaveBeenCalled();
  });
});

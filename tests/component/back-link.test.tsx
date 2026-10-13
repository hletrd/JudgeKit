import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackLink } from "@/components/back-link";

const backMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: backMock, push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    className,
  }: {
    href: string;
    children: ReactNode;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
    className?: string;
  }) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

function setHistoryLength(length: number) {
  Object.defineProperty(window.history, "length", { configurable: true, get: () => length });
}

describe("BackLink", () => {
  beforeEach(() => {
    backMock.mockClear();
  });

  afterEach(() => {
    // Drop the instance override so jsdom's own getter is visible again.
    Reflect.deleteProperty(window.history, "length");
  });

  it("goes back through real history instead of following the fallback href", () => {
    setHistoryLength(3);
    render(<BackLink fallbackHref="/contests">Back</BackLink>);

    const link = screen.getByRole("link", { name: "Back" });
    expect(link).toHaveAttribute("href", "/contests");

    const notPrevented = fireEvent.click(link);

    expect(backMock).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
  });

  it("follows the fallback href when there is no history (direct link / new tab)", () => {
    setHistoryLength(1);
    render(<BackLink fallbackHref="/contests">Back</BackLink>);

    const notPrevented = fireEvent.click(screen.getByRole("link", { name: "Back" }));

    expect(backMock).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });

  it("leaves modifier clicks to the browser so the fallback can open in a new tab", () => {
    setHistoryLength(3);
    render(<BackLink fallbackHref="/contests">Back</BackLink>);

    fireEvent.click(screen.getByRole("link", { name: "Back" }), { metaKey: true });
    fireEvent.click(screen.getByRole("link", { name: "Back" }), { ctrlKey: true });

    expect(backMock).not.toHaveBeenCalled();
  });

  it("handles clicks on a button nested inside the link", () => {
    setHistoryLength(3);
    render(
      <BackLink fallbackHref="/groups/group-1">
        <button type="button">Back</button>
      </BackLink>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(backMock).toHaveBeenCalledTimes(1);
  });
});

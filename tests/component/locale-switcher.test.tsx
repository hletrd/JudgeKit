import type { ButtonHTMLAttributes, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";

const { forceNavigateMock } = vi.hoisted(() => ({
  forceNavigateMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      language: "Language",
      english: "English",
      korean: "Korean",
    })[key] ?? key,
  useLocale: () => "en",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useSearchParams: () => ({
    toString: () => "page=2",
  }),
}));

vi.mock("@/lib/navigation/client", () => ({
  forceNavigate: forceNavigateMock,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/dropdown-menu", () => {
  let onValueChange: ((value: string) => void) | undefined;

  return {
    DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DropdownMenuTrigger: ({ render }: { render: ReactNode }) => <div>{render}</div>,
    DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DropdownMenuRadioGroup: ({
      children,
      onValueChange: handleValueChange,
      value,
    }: {
      children: ReactNode;
      onValueChange?: (value: string) => void;
      value?: string;
    }) => {
      onValueChange = handleValueChange;
      return <div data-testid="locale-radio-group" data-value={value}>{children}</div>;
    },
    DropdownMenuRadioItem: ({
      children,
      value,
    }: {
      children: ReactNode;
      value: string;
    }) => (
      <button type="button" onClick={() => onValueChange?.(value)}>
        {children}
      </button>
    ),
  };
});

vi.mock("lucide-react", () => ({
  Languages: ({ className }: { className?: string }) => (
    <svg data-testid="languages-icon" className={className} aria-hidden="true" />
  ),
}));

describe("LocaleSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.cookie = "locale=; Max-Age=0; Path=/";
  });

  it("forces a full navigation after switching locale so public pages re-render", async () => {
    const user = userEvent.setup();

    render(<LocaleSwitcher />);

    await user.click(screen.getByRole("button", { name: "Korean" }));

    expect(document.cookie).toContain("locale=ko");
    expect(forceNavigateMock).toHaveBeenCalledWith("/dashboard?page=2&locale=ko");
  });
});

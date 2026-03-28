import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const mockSetTheme = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    setTheme: mockSetTheme,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock dropdown menu components — render children directly so content is accessible
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu">{children}</div>
  ),
  DropdownMenuTrigger: ({
    children,
    "aria-label": ariaLabel,
    className,
    disabled,
  }: {
    children: React.ReactNode;
    "aria-label"?: string;
    className?: string;
    disabled?: boolean;
  }) => (
    <button
      data-testid="dropdown-trigger"
      aria-label={ariaLabel}
      className={className}
      disabled={disabled}
    >
      {children}
    </button>
  ),
  DropdownMenuContent: ({ children, align, className }: { children: React.ReactNode; align?: string; className?: string }) => (
    <div data-testid="dropdown-content" data-align={align} className={className}>
      {children}
    </div>
  ),
  DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-group">{children}</div>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-label">{children}</div>
  ),
  DropdownMenuRadioGroup: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (value: string) => void;
  }) => (
    <div data-testid="dropdown-radio-group" data-value={value}>
      {children}
    </div>
  ),
  DropdownMenuRadioItem: ({
    children,
    value,
    className,
  }: {
    children: React.ReactNode;
    value: string;
    className?: string;
  }) => (
    <div
      data-testid={`radio-item-${value}`}
      data-value={value}
      role="menuitemradio"
      className={className}
    >
      {children}
    </div>
  ),
}));

// Mock lucide-react icons with identifiable test ids
vi.mock("lucide-react", () => ({
  SunMedium: ({ className }: { className?: string }) => (
    <svg data-testid="icon-sun" className={className} aria-hidden="true" />
  ),
  MoonStar: ({ className }: { className?: string }) => (
    <svg data-testid="icon-moon" className={className} aria-hidden="true" />
  ),
  Monitor: ({ className }: { className?: string }) => (
    <svg data-testid="icon-monitor" className={className} aria-hidden="true" />
  ),
  SunMoon: ({ className }: { className?: string }) => (
    <svg data-testid="icon-sunmoon" className={className} aria-hidden="true" />
  ),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSetTheme.mockReset();
  });

  it("renders the theme toggle trigger button", () => {
    render(<ThemeToggle />);
    expect(screen.getByTestId("dropdown-trigger")).toBeInTheDocument();
  });

  it("button has accessible aria-label", () => {
    render(<ThemeToggle />);
    const trigger = screen.getByTestId("dropdown-trigger");
    // useTranslations returns key as value, so t("theme") === "theme"
    expect(trigger).toHaveAttribute("aria-label", "theme");
  });

  it("shows sun icon when theme is light", () => {
    // useTheme mock returns theme: "light"
    render(<ThemeToggle />);
    // SunMedium appears in both trigger and dropdown option
    const sunIcons = screen.getAllByTestId("icon-sun");
    expect(sunIcons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders dropdown content with theme options", () => {
    render(<ThemeToggle />);
    expect(screen.getByTestId("radio-item-light")).toBeInTheDocument();
    expect(screen.getByTestId("radio-item-dark")).toBeInTheDocument();
    expect(screen.getByTestId("radio-item-system")).toBeInTheDocument();
  });

  it("radio group reflects current theme value", () => {
    render(<ThemeToggle />);
    // selectedTheme is "light" since mounted=true and theme="light"
    expect(screen.getByTestId("dropdown-radio-group")).toHaveAttribute("data-value", "light");
  });

  it("applies custom className to trigger", () => {
    render(<ThemeToggle className="custom-toggle-class" />);
    const trigger = screen.getByTestId("dropdown-trigger");
    expect(trigger.className).toContain("custom-toggle-class");
  });

  it("renders sr-only span with theme label", () => {
    render(<ThemeToggle />);
    const srOnly = screen.getAllByText("theme").find(
      (el) => el.classList.contains("sr-only")
    );
    expect(srOnly).toBeInTheDocument();
  });

  it("renders all three theme option labels", () => {
    render(<ThemeToggle />);
    // useTranslations returns the key, so labels are "light", "dark", "system"
    expect(screen.getByTestId("radio-item-light")).toHaveTextContent("light");
    expect(screen.getByTestId("radio-item-dark")).toHaveTextContent("dark");
    expect(screen.getByTestId("radio-item-system")).toHaveTextContent("system");
  });
});

import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/layout/app-sidebar";

const { signOutMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useSearchParams: () => ({
    get: () => null,
  }),
}));

vi.mock("next-auth/react", () => ({
  signOut: signOutMock,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: ReactNode;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
  SidebarContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarGroup: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  SidebarGroupLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarGroupContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarMenu: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children }: { children: ReactNode }) => <li>{children}</li>,
  SidebarMenuButton: ({
    children,
    render,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    render?: ReactElement<{ href?: string }>;
    onClick?: () => void;
    disabled?: boolean;
  }) => {
    const href = render?.props?.href;
    if (href) {
      return <a href={href}>{children}</a>;
    }
    return (
      <button onClick={onClick} disabled={disabled}>
        {children}
      </button>
    );
  },
  SidebarFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  SidebarHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));

vi.mock("lucide-react", () => {
  const Icon = ({ className }: { className?: string }) => (
    <svg data-testid="icon" className={className} aria-hidden="true" />
  );
  return {
    BookOpen: Icon,
    FileCode: Icon,
    Send: Icon,
    Users: Icon,
    User: Icon,
    LayoutDashboard: Icon,
    GraduationCap: Icon,
    Shield: Icon,
    LogOut: Icon,
    LogIn: Icon,
    History: Icon,
    FolderOpen: Icon,
    Blocks: Icon,
    Trophy: Icon,
    MessageCircle: Icon,
    Timer: Icon,
    KeyRound: Icon,
    Code: Icon,
    Settings: Icon,
    Server: Icon,
    Play: Icon,
    Upload: Icon,
    Tags: Icon,
    Loader2: Icon,
  };
});

describe("AppSidebar", () => {
  it("hides recruiting-only suppressed navigation and removes the mode badge text", () => {
    render(
      <AppSidebar
        user={{ id: "user-1", username: "candidate", name: "Candidate", role: "student" }}
        siteTitle="JudgeKit"
        platformMode="recruiting"
        capabilities={[]}
      />
    );

    expect(screen.getByText("JudgeKit")).toBeInTheDocument();
    expect(screen.queryByText("platformModes.recruiting")).not.toBeInTheDocument();
    expect(screen.queryByText("groups")).not.toBeInTheDocument();
    expect(screen.queryByText("problems")).not.toBeInTheDocument();
    expect(screen.getByText("contests")).toBeInTheDocument();
  });

  it("routes scoped reviewers to the filtered review queue from the submissions nav item", () => {
    render(
      <AppSidebar
        user={{ id: "user-2", username: "ta", name: "TA", role: "assistant" }}
        siteTitle="JudgeKit"
        platformMode="homework"
        capabilities={["assignments.view_status"]}
      />
    );

    expect(screen.getByRole("link", { name: "submissions" })).toHaveAttribute(
      "href",
      "/dashboard/admin/submissions"
    );
  });

  it("shows problem sets navigation for scoped staff who can edit but not create problem sets", () => {
    render(
      <AppSidebar
        user={{ id: "user-3", username: "editor", name: "Editor", role: "assistant" }}
        siteTitle="JudgeKit"
        platformMode="homework"
        capabilities={["problem_sets.edit"]}
      />
    );

    expect(screen.getByRole("link", { name: "problemSets" })).toHaveAttribute(
      "href",
      "/dashboard/problem-sets"
    );
  });
});

"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { buildLocalizedHref } from "@/lib/locale-paths";
import { Menu, X, ChevronDown, LogOut, LayoutDashboard, FileText, Users, ClipboardList, Settings, Shield } from "lucide-react";

type HeaderItem = {
  href: string;
  label: string;
};

type DropdownItem = {
  href: string;
  label: string;
  icon?: React.ReactNode;
};

type PublicHeaderProps = {
  siteTitle: string;
  items: HeaderItem[];
  actions: HeaderItem[];
  loggedInUser?: {
    name: string;
    href: string;
    label: string;
    /** User role — may be a built-in UserRole or a custom role string */
    role?: string;
  } | null;
};

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getDropdownItems(role?: string): DropdownItem[] {
  const isInstructor = role === "instructor" || role === "admin" || role === "super_admin";
  const isAdmin = role === "admin" || role === "super_admin";

  const items: DropdownItem[] = [
    { href: "/dashboard", label: "dashboard", icon: <LayoutDashboard className="size-4" /> },
  ];

  if (isInstructor) {
    items.push({ href: "/dashboard/problems", label: "problems", icon: <FileText className="size-4" /> });
    items.push({ href: "/dashboard/groups", label: "groups", icon: <Users className="size-4" /> });
  }

  items.push({ href: "/dashboard/submissions", label: "mySubmissions", icon: <ClipboardList className="size-4" /> });
  items.push({ href: "/dashboard/profile", label: "profile", icon: <Settings className="size-4" /> });

  if (isAdmin) {
    items.push({ href: "/dashboard/admin", label: "admin", icon: <Shield className="size-4" /> });
  }

  return items;
}

export function PublicHeader({ siteTitle, items, actions, loggedInUser }: PublicHeaderProps) {
  const pathname = usePathname();
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const tAuth = useTranslations("auth");
  const tShell = useTranslations("publicShell");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousPathnameRef = useRef(pathname);

  const dropdownItems = getDropdownItems(loggedInUser?.role);

  // Close menu on route change
  useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return;
    }

    previousPathnameRef.current = pathname;
    if (!mobileOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setMobileOpen(false);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [mobileOpen, pathname]);

  // Focus management: Escape to close, focus first item on open, restore focus on close
  useEffect(() => {
    if (!mobileOpen) return;

    // Move focus into the panel after it mounts
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      'a[href], button, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        toggleRef.current?.focus();
      }

      // Focus trap: keep Tab within the panel (handles Shift+Tab wraparound)
      if (e.key === "Tab" && panelRef.current) {
        const focusableSelector = 'a[href], button, [tabindex]:not([tabindex="-1"])';
        const focusableEls = Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusableSelector));
        if (focusableEls.length === 0) return;

        const first = focusableEls[0];
        const last = focusableEls[focusableEls.length - 1];

        // Determine which focusable element (or its descendant) is currently active
        const activeEl = document.activeElement;
        const activeIndex = focusableEls.findIndex(
          (el) => el === activeEl || el.contains(activeEl),
        );

        if (e.shiftKey && (activeIndex <= 0 || activeIndex === -1)) {
          // Shift+Tab on first item (or unknown/external element) → wrap to last
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (activeIndex === focusableEls.length - 1 || activeIndex === -1)) {
          // Tab on last item (or unknown/external element) → wrap to first
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  const closeMobileMenu = useCallback(() => {
    setMobileOpen(false);
    // Defer focus restoration so the DOM update (unmount) completes first
    requestAnimationFrame(() => toggleRef.current?.focus());
  }, []);

  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    await signOut({ callbackUrl: "/login" });
  }, []);

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      {/* Screen reader announcement for menu state */}
      {mobileOpen && (
        <div className="sr-only" aria-live="polite">
          {tCommon("mobileMenuOpened")}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-3 sm:gap-4">
        <Link
          href={buildLocalizedHref("/", locale)}
          className="min-w-0 flex-1 text-base font-semibold tracking-tight md:flex-none md:shrink-0"
        >
          <span className="block truncate">{siteTitle}</span>
        </Link>

        <nav aria-label={tCommon("mainNavigation")} className="hidden min-w-0 flex-1 items-center gap-1 md:flex">
          {items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const localizedHref = buildLocalizedHref(item.href, locale);
            return (
              <Link
                key={item.href}
                href={localizedHref}
                className={cn(
                  "rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden items-center gap-1 md:flex">
          <ThemeToggle />
          <LocaleSwitcher />
          {loggedInUser ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                {loggedInUser.label}
                <ChevronDown className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {dropdownItems.map((item) => (
                  <DropdownMenuItem key={item.href}>
                    <Link
                      href={buildLocalizedHref(item.href, locale)}
                      className="flex w-full items-center gap-2"
                    >
                      {item.icon}
                      {tShell(`nav.${item.label}`)}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} disabled={isSigningOut}>
                  <span className="flex items-center gap-2">
                    <LogOut className="size-4" />
                    {isSigningOut ? tCommon("signingOut") : tAuth("signOut")}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            actions.map((action, index) => (
              <Link
                key={action.href}
                href={buildLocalizedHref(action.href, locale)}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  index === actions.length - 1
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {action.label}
              </Link>
            ))
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 md:hidden">
          <ThemeToggle />
          <LocaleSwitcher />
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={tCommon("toggleNavigationMenu")}
            aria-controls={menuId}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? (
              <X className="size-4" aria-hidden="true" />
            ) : (
              <Menu className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          ref={panelRef}
          id={menuId}
          role="region"
          aria-label={tCommon("mobileNavigation")}
          data-state="open"
          className="max-h-[calc(100dvh-56px)] overflow-y-auto border-t md:hidden"
        >
          <div className="mx-auto max-w-6xl px-4 py-2">
            <nav aria-label={tCommon("mobileMenu")} className="flex flex-col gap-0.5">
              {items.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={buildLocalizedHref(item.href, locale)}
                    onClick={closeMobileMenu}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      active
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            {loggedInUser && (
              <div className="mt-2 flex flex-col gap-0.5 border-t pt-2">
                <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/60">
                  {tShell("nav.dashboard")}
                </p>
                {dropdownItems.map((item) => (
                  <Link
                    key={item.href}
                    href={buildLocalizedHref(item.href, locale)}
                    onClick={closeMobileMenu}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {item.icon}
                    {tShell(`nav.${item.label}`)}
                  </Link>
                ))}
                <div className="mt-1 border-t pt-1">
                <button
                  onClick={() => { closeMobileMenu(); handleSignOut(); }}
                  disabled={isSigningOut}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <LogOut className="size-4" />
                  {isSigningOut ? tCommon("signingOut") : tAuth("signOut")}
                </button>
                </div>
              </div>
            )}
            {!loggedInUser && (
              <div className="mt-2 flex flex-col gap-1 border-t pt-2">
                {actions.map((action, index) => (
                  <Link
                    key={action.href}
                    href={buildLocalizedHref(action.href, locale)}
                    onClick={closeMobileMenu}
                    className={cn(
                      "rounded-md px-3 py-2 text-center text-sm font-medium transition-colors",
                      index === actions.length - 1
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

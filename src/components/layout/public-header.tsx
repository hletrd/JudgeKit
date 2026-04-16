"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";
import { buildLocalizedHref } from "@/lib/locale-paths";
import { ChevronDown } from "lucide-react";

type HeaderItem = {
  href: string;
  label: string;
};

type PublicHeaderProps = {
  siteTitle: string;
  items: HeaderItem[];
  actions: HeaderItem[];
  loggedInUser?: {
    name: string;
    href: string;
    label: string;
  } | null;
};

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PublicHeader({ siteTitle, items, actions, loggedInUser }: PublicHeaderProps) {
  const pathname = usePathname();
  const locale = useLocale();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  const closeMobileMenu = useCallback(() => {
    setMobileOpen(false);
    // Defer focus restoration so the DOM update (unmount) completes first
    requestAnimationFrame(() => toggleRef.current?.focus());
  }, []);

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      {/* Screen reader announcement for menu state */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {mobileOpen ? "Navigation menu opened" : ""}
      </div>

      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-3 sm:gap-4">
        <Link
          href={buildLocalizedHref("/", locale)}
          className="min-w-0 flex-1 text-base font-semibold tracking-tight md:flex-none md:shrink-0"
        >
          <span className="block truncate">{siteTitle}</span>
        </Link>

        <nav aria-label="Main navigation" className="hidden min-w-0 flex-1 items-center gap-1 md:flex">
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
            <Link
              href={buildLocalizedHref(loggedInUser.href, locale)}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {loggedInUser.label}
            </Link>
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
            aria-label="Toggle navigation menu"
            aria-controls={menuId}
            aria-expanded={mobileOpen}
          >
            <ChevronDown
              className={cn(
                "size-4 transition-transform duration-200",
                mobileOpen && "rotate-180"
              )}
            />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          ref={panelRef}
          id={menuId}
          role="region"
          aria-label="Mobile navigation"
          data-state="open"
          className="border-t md:hidden"
        >
          <div className="mx-auto max-w-6xl px-4 py-2">
            <nav aria-label="Mobile menu" className="flex flex-col gap-0.5">
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
            <div className="mt-2 flex flex-col gap-1 border-t pt-2">
              {loggedInUser ? (
                <Link
                  href={buildLocalizedHref(loggedInUser.href, locale)}
                  onClick={closeMobileMenu}
                  className="rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {loggedInUser.label}
                </Link>
              ) : (
                actions.map((action, index) => (
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
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

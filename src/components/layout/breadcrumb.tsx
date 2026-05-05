"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Map raw URL segments to i18n keys under the "nav" namespace. */
const SEGMENT_LABEL_MAP: Record<string, string> = {
  dashboard: "dashboard",
  problems: "problems",
  submissions: "submissions",
  contests: "contests",
  groups: "groups",
  profile: "profile",
  rankings: "rankings",
  admin: "administration",
  users: "userManagement",
  languages: "languages",
  settings: "systemSettings",
  workspace: "workspace",
  control: "home",
  practice: "practice",
  playground: "playground",
  community: "community",
  discussions: "discussions",
  assignments: "problemSets",
};

type SegmentOverride = {
  segment: string;
  label: string;
};

type BreadcrumbProps = {
  className?: string;
  /** Custom labels for specific segments (by raw segment value). */
  overrides?: SegmentOverride[];
};

/** Capitalise first character for segments without an i18n mapping. */
function titleCase(segment: string): string {
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export function Breadcrumb({ className, overrides }: BreadcrumbProps) {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");

  // Strip leading locale prefix (e.g. /en, /ko) and split
  const segments = pathname
    .replace(/^\/(en|ko)(?=\/|$)/, "")
    .split("/")
    .filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs: { href: string; label: string; isLast: boolean }[] = [];
  let accumulated = "";

  for (let i = 0; i < segments.length; i++) {
    const raw = segments[i];
    accumulated += `/${raw}`;
    const isLast = i === segments.length - 1;

    // Check overrides first
    const override = overrides?.find((o) => o.segment === raw);
    let label: string;
    if (override) {
      label = override.label;
    } else if (SEGMENT_LABEL_MAP[raw]) {
      label = tNav(SEGMENT_LABEL_MAP[raw]);
    } else {
      label = titleCase(raw.replace(/[-_]/g, " "));
    }

    crumbs.push({ href: accumulated, label, isLast });
  }

  return (
    <nav aria-label={tCommon("breadcrumb")} className={cn(className)}>
      <ol
        itemScope
        itemType="https://schema.org/BreadcrumbList"
        className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
      >
        {/* Home crumb */}
        <li
          itemScope
          itemProp="itemListElement"
          itemType="https://schema.org/ListItem"
          className="flex items-center gap-1"
        >
          <Link
            href="/dashboard"
            itemProp="item"
            className="flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <Home className="size-3.5" aria-hidden="true" />
            <span itemProp="name" className="sr-only">{tCommon("home")}</span>
          </Link>
          <meta itemProp="position" content="1" />
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </li>

        {crumbs.map((crumb, index) => (
          <li
            key={crumb.href}
            itemScope
            itemProp="itemListElement"
            itemType="https://schema.org/ListItem"
            className="flex items-center gap-1"
          >
            {crumb.isLast ? (
              <span itemProp="name" aria-current="page" className="font-medium text-foreground">
                {crumb.label}
              </span>
            ) : (
              <>
                <Link
                  href={crumb.href}
                  itemProp="item"
                  className="transition-colors hover:text-foreground"
                >
                  <span itemProp="name">{crumb.label}</span>
                </Link>
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </>
            )}
            <meta itemProp="position" content={String(index + 2)} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

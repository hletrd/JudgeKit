"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Monitor, MoonStar, SunMedium, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ThemeOption = "light" | "dark" | "system";

const themeOptions: Array<{
  value: ThemeOption;
  icon: typeof SunMedium;
  labelKey: ThemeOption;
}> = [
  { value: "light", icon: SunMedium, labelKey: "light" },
  { value: "dark", icon: MoonStar, labelKey: "dark" },
  { value: "system", icon: Monitor, labelKey: "system" },
];

function subscribeToHydration() {
  return () => {};
}

function isThemeOption(value: string | undefined): value is ThemeOption {
  return value === "light" || value === "dark" || value === "system";
}

function ThemeTriggerIcon({ className, theme }: { className?: string; theme: ThemeOption | undefined }) {
  switch (theme) {
    case "light":
      return <SunMedium className={className} />;
    case "dark":
      return <MoonStar className={className} />;
    case "system":
      return <Monitor className={className} />;
    default:
      return <SunMoon className={className} />;
  }
}

export function ThemeToggle({ className, dbTheme }: { className?: string; dbTheme?: string | null }) {
  const t = useTranslations("common");
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const selectedTheme = mounted && isThemeOption(theme) ? theme : "system";
  const dbSynced = useRef(false);

  // Sync DB theme on first mount (cross-device persistence)
  useEffect(() => {
    if (mounted && dbTheme && isThemeOption(dbTheme) && !dbSynced.current) {
      dbSynced.current = true;
      if (theme !== dbTheme) {
        setTheme(dbTheme);
      }
    }
  }, [mounted, dbTheme, theme, setTheme]);

  if (!mounted) {
    return <Skeleton className={cn("h-11 w-11 rounded-md lg:h-9 lg:w-9", className)} role="status" aria-busy="true" aria-label={t("theme")} />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("theme")}
        className={cn(
          // 44 × 44 px (size-11) on mobile to satisfy the iOS HIG / Material touch-target guideline,
          // shrinks to 36 × 36 (size-9) at lg+ where pointer input dominates.
          "inline-flex h-11 w-11 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring lg:h-9 lg:w-9",
          className,
        )}
      >
        <ThemeTriggerIcon className="size-4" theme={selectedTheme} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("theme")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={selectedTheme}
            onValueChange={(value) => {
              if (isThemeOption(value)) {
                setTheme(value);
                // Persist to DB in background (best-effort)
                import("@/lib/actions/update-preferences").then(({ updatePreferences }) => {
                  updatePreferences({ preferredTheme: value }).catch(() => {});
                }).catch(() => {});
              }
            }}
          >
            {themeOptions.map(({ value, icon: Icon, labelKey }) => (
              <DropdownMenuRadioItem key={value} value={value} className="gap-2">
                <Icon className="size-4 text-muted-foreground" />
                {t(labelKey)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { Presentation, Palette } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLectureMode } from "@/components/lecture/lecture-mode-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useSyncExternalStore } from "react";

function subscribeToHydration() {
  return () => {};
}

const colorSchemeOptions = [
  { value: "dark", labelKey: "lectureDark" },
  { value: "light", labelKey: "lectureLight" },
  { value: "solarized", labelKey: "lectureSolarized" },
] as const;

const fontScaleOptions = [
  { value: "1.25", label: "1.25x" },
  { value: "1.5", label: "1.5x" },
  { value: "1.75", label: "1.75x" },
  { value: "2.0", label: "2.0x" },
  { value: "2.5", label: "2.5x" },
  { value: "3.0", label: "3.0x" },
  { value: "3.5", label: "3.5x" },
  { value: "4.0", label: "4.0x" },
] as const;

type LectureColorScheme = (typeof colorSchemeOptions)[number]["value"];
type LectureFontScale = (typeof fontScaleOptions)[number]["value"];

export function LectureModeToggle({ className }: { className?: string }) {
  const t = useTranslations("common");
  const { active, toggle, fontScale, setFontScale, colorScheme, setColorScheme } = useLectureMode();
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);

  if (!mounted) {
    return <Skeleton className={cn("h-9 w-9 rounded-md", className)} role="status" aria-busy="true" aria-label={t("lectureMode")} />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("lectureMode")}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          active && "bg-primary text-primary-foreground hover:bg-primary/90",
          className,
        )}
      >
        <Presentation className="size-4" />
        <span className="sr-only">{t("lectureMode")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>{t("lectureMode")}</span>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); toggle(); }}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                active ? "bg-primary" : "bg-input"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform",
                  active ? "translate-x-4" : "translate-x-0"
                )}
              />
            </button>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">{t("lectureColorScheme")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={colorScheme} onValueChange={(v) => setColorScheme(v as LectureColorScheme)}>
                {colorSchemeOptions.map(({ value, labelKey }) => (
                  <DropdownMenuRadioItem key={value} value={value} className="gap-2">
                    <Palette className="size-3.5 text-muted-foreground" />
                    {t(labelKey)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">{t("lectureFontScale")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={fontScale} onValueChange={(v) => setFontScale(v as LectureFontScale)}>
                {fontScaleOptions.map(({ value, label }) => (
                  <DropdownMenuRadioItem key={value} value={value}>
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

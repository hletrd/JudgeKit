"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Languages } from "lucide-react";
import { LOCALE_COOKIE_NAME } from "@/lib/i18n/constants";
import { useSyncExternalStore } from "react";

function subscribeToHydration() {
  return () => {};
}

export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations("common");
  const currentLocale = useLocale();
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);

  if (!mounted) {
    return (
      <Skeleton
        className={cn("h-11 w-11 rounded-md lg:h-9 lg:w-9", className)}
        role="status"
        aria-busy="true"
        aria-label={t("language")}
      />
    );
  }

  function setLocale(locale: string) {
    if (locale === currentLocale) {
      return;
    }

    try {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; Path=/; SameSite=Lax${secure}; Max-Age=${60 * 60 * 24 * 365}`;
    } catch {
      // Cookie may be blocked (sandboxed iframe, disabled cookies).
      // Fall through to reload so server-side locale handling can take effect.
    }
    window.location.reload();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("language")}
            // Override Button's size="icon" default (size-8 / 32 px) with a touch-friendly
            // 44 × 44 px footprint on mobile, shrinking back to 36 × 36 at lg+.
            className={cn("size-11 lg:size-9", className)}
          >
            <Languages className="size-4" aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={currentLocale} onValueChange={(value) => setLocale(value)}>
          <DropdownMenuRadioItem value="en">
            {t("english")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="ko">
            {t("korean")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, LOCALE_QUERY_PARAM } from "@/lib/i18n/constants";
import { forceNavigate } from "@/lib/navigation/client";

export function LocaleSwitcher() {
  const t = useTranslations("common");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentLocale = useLocale();

  function setLocale(locale: string) {
    if (locale === currentLocale) {
      return;
    }

    document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; Path=/; SameSite=Lax; ${location.protocol === "https:" ? "Secure; " : ""}Max-Age=${60 * 60 * 24 * 365}`;
    const params = new URLSearchParams(searchParams.toString());

    if (locale === DEFAULT_LOCALE) {
      params.delete(LOCALE_QUERY_PARAM);
    } else {
      params.set(LOCALE_QUERY_PARAM, locale);
    }

    const nextUrl = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
    forceNavigate(nextUrl);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={t("language")}>
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

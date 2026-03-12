"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Languages } from "lucide-react";

export function LocaleSwitcher() {
  const t = useTranslations("common");
  const router = useRouter();
  const currentLocale = useLocale();

  function setLocale(locale: string) {
    document.cookie = `NEXT_LOCALE=${locale}; Path=/; SameSite=Lax; ${location.protocol === "https:" ? "Secure; " : ""}Max-Age=${60 * 60 * 24 * 365}`;
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <Languages className="h-4 w-4" />
        <span className="sr-only">{t("language")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuCheckboxItem
          checked={currentLocale === "en"}
          onCheckedChange={() => setLocale("en")}
        >
          {t("english")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={currentLocale === "ko"}
          onCheckedChange={() => setLocale("ko")}
        >
          {t("korean")}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

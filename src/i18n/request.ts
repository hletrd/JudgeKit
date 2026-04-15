import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE_NAME, SUPPORTED_LOCALES, DEFAULT_LOCALE } from "@/lib/i18n/constants";
import { getResolvedSystemSettings } from "@/lib/system-settings";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const localeOverride = headerStore.get("x-locale-override");
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const acceptLanguage = headerStore.get("accept-language");

  let locale = localeOverride || cookieLocale;

  if (!locale && acceptLanguage) {
    const preferred = acceptLanguage.split(",")[0]?.split("-")[0]?.trim();
    if (preferred === "ko") {
      locale = "ko";
    }
  }

  if (!locale) {
    try {
      const settings = await getResolvedSystemSettings({
        siteTitle: "",
        siteDescription: "",
      });
      locale = settings.defaultLocale ?? DEFAULT_LOCALE;
    } catch {
      locale = DEFAULT_LOCALE;
    }
  }

  if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    locale = "en";
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});

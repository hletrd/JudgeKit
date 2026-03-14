import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE_NAME, SUPPORTED_LOCALES, DEFAULT_LOCALE } from "@/lib/i18n/constants";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const acceptLanguage = headerStore.get("accept-language");

  let locale = cookieLocale;

  if (!locale && acceptLanguage) {
    const preferred = acceptLanguage.split(",")[0]?.split("-")[0]?.trim();
    if (preferred === "ko") {
      locale = "ko";
    }
  }

  locale = locale || DEFAULT_LOCALE;

  if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    locale = "en";
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});

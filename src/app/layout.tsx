import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Script from "next/script";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";
import { NonceProvider } from "@/components/nonce-provider";
import { getAuthUrlObject } from "@/lib/security/env";
import { buildSeoKeywords, buildSocialImageUrl, getAlternateOpenGraphLocales, getOpenGraphLocale } from "@/lib/seo";
import { getResolvedSystemSettings } from "@/lib/system-settings";
import "./globals.css";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  display: "swap",
  variable: "--font-pretendard",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  const [t, tShell, locale] = await Promise.all([
    getTranslations("common"),
    getTranslations("publicShell"),
    getLocale(),
  ]);
  const settings = await getResolvedSystemSettings({
    siteTitle: t("appName"),
    siteDescription: t("appDescription"),
  });
  const authUrl = getAuthUrlObject() ?? undefined;

  const siteTitle = settings.siteTitle;
  const siteDescription = settings.siteDescription;
  const socialImageUrl = buildSocialImageUrl({
    title: siteTitle,
    description: siteDescription,
    locale,
    siteTitle,
    section: tShell("home.eyebrow"),
  });

  return {
    title: {
      default: siteTitle,
      template: `%s - ${siteTitle}`,
    },
    applicationName: siteTitle,
    description: siteDescription,
    category: "education",
    keywords: buildSeoKeywords(siteTitle),
    metadataBase: authUrl,
    openGraph: {
      title: siteTitle,
      description: siteDescription,
      url: authUrl?.toString(),
      siteName: siteTitle,
      type: "website",
      locale: getOpenGraphLocale(locale),
      alternateLocale: getAlternateOpenGraphLocales(locale),
      images: [
        {
          url: socialImageUrl,
          width: 1200,
          height: 630,
          alt: siteTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: siteTitle,
      description: siteDescription,
      images: [socialImageUrl],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? undefined;

  return (
    <html lang={locale} suppressHydrationWarning className={pretendard.variable}>
      <body className="antialiased">
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        )}
        <NonceProvider nonce={nonce}>
          <NextIntlClientProvider messages={messages}>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
              nonce={nonce}
            >
              {children}
            </ThemeProvider>
          </NextIntlClientProvider>
        </NonceProvider>
      </body>
    </html>
  );
}

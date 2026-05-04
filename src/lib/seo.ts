import type { Metadata } from "next";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n/constants";
import { buildLocalePath, normalizeMetadataPath, normalizeSupportedLocale } from "@/lib/locale-paths";
import { getAuthUrlObject } from "@/lib/security/env";

export { buildLocalePath, buildLocalizedHref, normalizeMetadataPath, normalizeSupportedLocale } from "@/lib/locale-paths";

const FALLBACK_SITE_URL = "http://localhost:3000";
const DEFAULT_SEO_KEYWORDS = [
  "online judge",
  "programming assignments",
  "competitive programming",
  "coding contests",
  "practice problems",
  "code playground",
  "programming education",
] as const;

export const NO_INDEX_METADATA: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export function getSiteUrl() {
  return getAuthUrlObject() ?? new URL(FALLBACK_SITE_URL);
}

export function buildAbsoluteUrl(path: string) {
  return new URL(normalizeMetadataPath(path), getSiteUrl()).toString();
}

export function summarizeTextForMetadata(text: string | null | undefined, maxLength = 160) {
  if (!text) {
    return "";
  }

  const normalized = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*_~>#|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized || normalized.length <= maxLength) {
    return normalized;
  }

  const candidate = normalized.slice(0, maxLength + 1);
  const lastSpace = candidate.lastIndexOf(" ");
  const safeCut = lastSpace >= Math.floor(maxLength * 0.6) ? lastSpace : maxLength;

  return `${candidate.slice(0, safeCut).trim()}…`;
}

function summarizeShortLabelForMetadata(text: string | null | undefined, maxLength = 80) {
  if (!text) {
    return "";
  }

  const normalized = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*_~>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized || normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

export function buildSeoKeywords(siteTitle: string, extraKeywords: string[] = []) {
  return Array.from(new Set([
    siteTitle,
    `${siteTitle} online judge`,
    ...DEFAULT_SEO_KEYWORDS,
    ...extraKeywords,
  ].map((keyword) => keyword.trim()).filter(Boolean)));
}

export function getOpenGraphLocale(locale: SupportedLocale | string) {
  return normalizeSupportedLocale(locale) === "ko" ? "ko_KR" : "en_US";
}

export function getAlternateOpenGraphLocales(locale: SupportedLocale | string) {
  const normalizedLocale = normalizeSupportedLocale(locale);
  return SUPPORTED_LOCALES
    .filter((entry) => entry !== normalizedLocale)
    .map((entry) => getOpenGraphLocale(entry));
}

export function buildLocaleAlternates(path: string, locale: SupportedLocale | string): NonNullable<Metadata["alternates"]> {
  const normalizedLocale = normalizeSupportedLocale(locale);
  return {
    canonical: buildLocalePath(path, normalizedLocale),
    languages: {
      en: buildLocalePath(path, "en"),
      ko: buildLocalePath(path, "ko"),
      "x-default": buildLocalePath(path, DEFAULT_LOCALE),
    },
  };
}

export function buildSocialImageUrl(options: {
  title: string;
  description?: string | null;
  locale: SupportedLocale | string;
  siteTitle: string;
  section?: string;
  badge?: string;
  meta?: string;
  footer?: string;
}) {
  const params = new URLSearchParams({
    title: summarizeTextForMetadata(options.title, 120),
    locale: options.locale,
    siteTitle: summarizeTextForMetadata(options.siteTitle, 80),
  });

  const description = summarizeTextForMetadata(options.description, 180);
  if (description) {
    params.set("description", description);
  }

  if (options.section) {
    params.set("section", summarizeShortLabelForMetadata(options.section, 40));
  }

  if (options.badge) {
    params.set("badge", summarizeShortLabelForMetadata(options.badge, 40));
  }

  if (options.meta) {
    params.set("meta", summarizeShortLabelForMetadata(options.meta, 80));
  }

  if (options.footer) {
    params.set("footer", summarizeShortLabelForMetadata(options.footer, 80));
  }

  const url = buildAbsoluteUrl(`/og?${params.toString()}`);
  // Guard against excessively long social image URLs (most servers/browsers
  // handle up to ~2000-8000 chars). If the URL exceeds 2000 characters,
  // strip optional parameters from least to most important until within limits.
  const MAX_SOCIAL_URL_LENGTH = 2000;
  if (url.length > MAX_SOCIAL_URL_LENGTH) {
    const optionalKeys = ["footer", "meta", "badge", "section", "description"];
    for (const key of optionalKeys) {
      if (params.has(key)) {
        params.delete(key);
        const trimmed = buildAbsoluteUrl(`/og?${params.toString()}`);
        if (trimmed.length <= MAX_SOCIAL_URL_LENGTH) return trimmed;
      }
    }
  }
  return url;
}

export function buildPublicMetadata(options: {
  title: string;
  description?: string | null;
  path: string;
  siteTitle: string;
  locale?: SupportedLocale | string;
  keywords?: string[];
  section?: string;
  socialBadge?: string;
  socialMeta?: string;
  socialFooter?: string;
  type?: "website" | "article";
}): Metadata {
  const locale = normalizeSupportedLocale(options.locale);
  const canonicalPath = buildLocalePath(options.path, locale);
  const description = options.description?.trim() || undefined;
  const absoluteUrl = buildAbsoluteUrl(canonicalPath);
  const socialImageUrl = buildSocialImageUrl({
    title: options.title,
    description,
    locale,
    siteTitle: options.siteTitle,
    section: options.section,
    badge: options.socialBadge,
    meta: options.socialMeta,
    footer: options.socialFooter,
  });

  return {
    title: options.title,
    description,
    applicationName: options.siteTitle,
    category: "education",
    creator: options.siteTitle,
    publisher: options.siteTitle,
    authors: [{ name: options.siteTitle }],
    referrer: "origin-when-cross-origin",
    keywords: buildSeoKeywords(options.siteTitle, options.keywords),
    alternates: buildLocaleAlternates(options.path, locale),
    openGraph: {
      title: options.title,
      description,
      url: absoluteUrl,
      siteName: options.siteTitle,
      type: options.type ?? "website",
      locale: getOpenGraphLocale(locale),
      alternateLocale: getAlternateOpenGraphLocales(locale),
      images: [
        {
          url: socialImageUrl,
          width: 1200,
          height: 630,
          alt: `${options.title} - ${options.siteTitle}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: options.title,
      description,
      images: [socialImageUrl],
    },
  };
}

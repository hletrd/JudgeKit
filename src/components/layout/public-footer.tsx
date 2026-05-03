import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DEFAULT_LOCALE } from "@/lib/i18n/constants";
import { buildLocalizedHref } from "@/lib/locale-paths";

type FooterLink = { label: string; url: string };
type FooterLocaleContent = {
  copyrightText?: string;
  links?: FooterLink[];
};

type PublicFooterProps = {
  siteTitle: string;
  footerContent: Record<string, FooterLocaleContent> | null | undefined;
};

export async function PublicFooter({ siteTitle, footerContent }: PublicFooterProps) {
  const [locale, tCommon, tShell] = await Promise.all([getLocale(), getTranslations("common"), getTranslations("publicShell")]);
  const content = footerContent?.[locale] ?? footerContent?.[DEFAULT_LOCALE];
  const copyrightText = content?.copyrightText || `© ${new Date().getFullYear()} ${siteTitle}`;
  const links = content?.links ?? [];

  // Always include "Languages" as a footer link so it remains reachable
  // after being removed from the top-level nav bar.
  const languagesLink: FooterLink = {
    label: tShell("nav.languages"),
    url: "/languages",
  };
  // Privacy notice — required for GDPR/PIPA-compliant deployments and for
  // recruiting candidates to find their data-handling rights without an
  // account.
  const privacyLink: FooterLink = {
    label: tShell("nav.privacy"),
    url: "/privacy",
  };
  const allLinks = [...links, languagesLink, privacyLink];

  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-6 text-center text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6 sm:text-left lg:px-8">
        <span className="max-w-full break-words">{copyrightText}</span>
        {allLinks.length > 0 && (
          <nav
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-end"
            aria-label={tCommon("footerNavigation")}
          >
            {allLinks.map((link) => (
              <Link
                key={link.url}
                href={buildLocalizedHref(link.url, locale)}
                className="transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </footer>
  );
}

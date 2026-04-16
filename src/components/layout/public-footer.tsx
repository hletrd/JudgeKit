import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
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
  const [locale, tCommon] = await Promise.all([getLocale(), getTranslations("common")]);
  const content = footerContent?.[locale] ?? footerContent?.["en"];
  const copyrightText = content?.copyrightText || `© ${new Date().getFullYear()} ${siteTitle}`;
  const links = content?.links ?? [];

  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-6 text-center text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6 sm:text-left lg:px-8">
        <span className="max-w-full break-words">{copyrightText}</span>
        {links.length > 0 && (
          <nav
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-end"
            aria-label={tCommon("footerNavigation")}
          >
            {links.map((link) => (
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

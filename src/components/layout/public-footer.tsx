import Link from "next/link";
import { getLocale } from "next-intl/server";

type FooterLink = { label: string; url: string };
type FooterLocaleContent = {
  copyrightText?: string;
  links?: FooterLink[];
};

type PublicFooterProps = {
  footerContent: Record<string, FooterLocaleContent> | null | undefined;
};

export async function PublicFooter({ footerContent }: PublicFooterProps) {
  if (!footerContent) return null;

  const locale = await getLocale();
  const content = footerContent[locale] ?? footerContent["en"];
  if (!content?.copyrightText && (!content?.links || content.links.length === 0)) return null;

  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6 lg:px-8">
        {content.copyrightText && (
          <span>{content.copyrightText}</span>
        )}
        {content.links && content.links.length > 0 && (
          <nav className="flex gap-4" aria-label="Footer">
            {content.links.map((link) => (
              <Link
                key={link.url}
                href={link.url}
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

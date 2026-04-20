import Link from "next/link";

type PublicPreviewPageProps = {
  title: string;
  description: string;
  note: string;
  primaryCta: { href: string; label: string };
  secondaryCta: { href: string; label: string };
  locale: string;
};

export function PublicPreviewPage({ title, description, note, primaryCta, secondaryCta, locale }: PublicPreviewPageProps) {
  return (
    <div className="mx-auto max-w-3xl rounded-3xl border bg-background px-6 py-10 shadow-sm sm:px-10">
      <h1 className={`text-3xl font-semibold${locale !== "ko" ? " tracking-tight" : ""}`}>{title}</h1>
      <p className="mt-4 text-base leading-7 text-muted-foreground">{description}</p>
      <div className="mt-6 rounded-2xl border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
        {note}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={primaryCta.href} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          {primaryCta.label}
        </Link>
        <Link href={secondaryCta.href} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
          {secondaryCta.label}
        </Link>
      </div>
    </div>
  );
}

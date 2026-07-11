"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * A back affordance that prefers REAL history navigation over a static href.
 *
 * Static back links (`<Link href="/practice">`) silently discard the state
 * the user navigated in with — list filters/pagination in query params, tab
 * selection in the URL hash, scroll position. `router.back()` restores all of
 * it. The `fallbackHref` is used when there is no history to go back to
 * (direct link, new tab), so deep links still land somewhere sensible.
 *
 * `history.length > 1` deliberately errs toward real back-navigation: the
 * only mismatch is a user who deep-landed from an external site, for whom
 * back behaves exactly like the browser's back button — never data loss.
 */
export function BackLink({
  fallbackHref,
  className,
  children,
}: {
  fallbackHref: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <Link
      href={fallbackHref}
      className={className}
      onClick={(event) => {
        if (
          !event.defaultPrevented &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          event.button === 0 &&
          window.history.length > 1
        ) {
          event.preventDefault();
          router.back();
        }
      }}
    >
      {children}
    </Link>
  );
}

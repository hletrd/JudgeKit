"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Next.js 16 RSC streaming bug: Host/X-Forwarded-Host headers from nginx
 * corrupt RSC payloads during client-side navigation on contest routes.
 * This layout intercepts clicks on links marked with `data-full-navigate`
 * within contest pages and forces full page navigation (which always works)
 * instead of client-side RSC.
 *
 * To opt a link into hard navigation, add the `data-full-navigate` attribute:
 *   <a href="/contests/123" data-full-navigate>...</a>
 *
 * TODO: Remove this workaround once the upstream Next.js bug is fixed.
 * Track: https://github.com/vercel/next.js/issues (search for RSC streaming
 * corruption with proxy headers). If no issue exists, one should be filed.
 */
export default function ContestsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const handler = (e: Event) => {
      const me = e as unknown as MouseEvent;
      const anchor = (me.target as HTMLElement)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      // Only intercept links explicitly marked for full navigation
      if (!anchor.hasAttribute("data-full-navigate")) return;

      const href = anchor.getAttribute("href");
      // Only allow relative paths (internal routes). Reject protocol-relative,
      // absolute, and any scheme-prefixed URLs as a defense-in-depth measure.
      if (!href || !href.startsWith("/") || href.startsWith("//")) return;

      // Force full page navigation for links that need it
      me.preventDefault();
      window.location.href = href;
    };

    const main = document.getElementById("main-content");
    const sidebar = document.querySelector("[data-slot='sidebar']");
    main?.addEventListener("click", handler, true);
    sidebar?.addEventListener("click", handler, true);

    return () => {
      main?.removeEventListener("click", handler, true);
      sidebar?.removeEventListener("click", handler, true);
    };
  }, [pathname]);

  return <>{children}</>;
}

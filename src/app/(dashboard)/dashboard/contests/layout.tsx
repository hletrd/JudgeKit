"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Next.js 16 RSC streaming bug: Host/X-Forwarded-Host headers from nginx
 * corrupt RSC payloads during client-side navigation on contest routes.
 * This layout intercepts internal <a> clicks within contest pages and forces
 * full page navigation (which always works) instead of client-side RSC.
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

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("http") || href.startsWith("javascript:") || href.startsWith("data:")) return;

      // Force full page navigation for internal links
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

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Back/forward restores the App Router's cached copy of a page without asking
// the server, so server-rendered data on it (a "my submissions" list, solve
// counts) is whatever it was when the page was first shown — a submission made
// in between is missing. Pages whose data changes while the user is away mount
// this to re-fetch once when they come back through history.
//
// The App Router renders the restored page — effects included — synchronously
// inside its own popstate handler, i.e. before this module's listener sees the
// event, so the mount effect checks on the next task.
const RESTORE_WINDOW_MS = 3000;
let lastTraversalAt = Number.NEGATIVE_INFINITY;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    lastTraversalAt = Date.now();
  });
}

export function RefreshOnHistoryRestore() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (Date.now() - lastTraversalAt < RESTORE_WINDOW_MS) {
        lastTraversalAt = Number.NEGATIVE_INFINITY;
        router.refresh();
      }
    }, 0);

    // Whole-document restores from the browser's back/forward cache.
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        router.refresh();
      }
    };

    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [router]);

  return null;
}

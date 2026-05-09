"use client";

import { useCallback, useEffect, useRef } from "react";

const DEFAULT_WARNING_MESSAGE = "You have unsaved code changes. Leave this page?";
const HISTORY_GUARD_STATE_KEY = "__ojUnsavedChangesGuard";
const HISTORY_INDEX_STATE_KEY = "__ojUnsavedChangesGuardIndex";

// Shared singleton to prevent multiple hook instances from clobbering each
// other's patches of window.history.pushState / replaceState.
// A single shared patch delegates to the most recently mounted active guard
// so that unmounting one instance correctly falls back to the next.
let originalPushState: typeof window.history.pushState | undefined;
let originalReplaceState: typeof window.history.replaceState | undefined;

function getOriginalPushState() {
  if (!originalPushState) {
    originalPushState = window.history.pushState.bind(window.history);
  }
  return originalPushState;
}

function getOriginalReplaceState() {
  if (!originalReplaceState) {
    originalReplaceState = window.history.replaceState.bind(window.history);
  }
  return originalReplaceState;
}

type GuardEntry = {
  confirmNavigation: (target: string | URL | null | undefined) => boolean;
  historyIndexRef: { current: number };
  confirmedLocationRef: { current: string | null };
};

const guardStack: GuardEntry[] = [];
let isHistoryPatched = false;

function getActiveGuard(): GuardEntry | undefined {
  return guardStack[guardStack.length - 1];
}

function sharedPushState(data: unknown, unused: string, url?: string | URL | null) {
  const active = getActiveGuard();
  if (!active) {
    getOriginalPushState()(data, unused, url);
    return;
  }
  if (!active.confirmNavigation(url)) {
    return;
  }
  const nextIndex = active.historyIndexRef.current + 1;
  active.historyIndexRef.current = nextIndex;
  active.confirmedLocationRef.current = resolveNavigationUrl(url);
  getOriginalPushState()(
    {
      ...(typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>,
      [HISTORY_GUARD_STATE_KEY]: true,
      [HISTORY_INDEX_STATE_KEY]: nextIndex,
    },
    unused,
    url,
  );
}

function sharedReplaceState(data: unknown, unused: string, url?: string | URL | null) {
  const active = getActiveGuard();
  if (!active) {
    getOriginalReplaceState()(data, unused, url);
    return;
  }
  if (!active.confirmNavigation(url)) {
    return;
  }
  active.confirmedLocationRef.current = resolveNavigationUrl(url);
  getOriginalReplaceState()(
    {
      ...(typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>,
      [HISTORY_GUARD_STATE_KEY]: true,
      [HISTORY_INDEX_STATE_KEY]: active.historyIndexRef.current,
    },
    unused,
    url,
  );
}

function installHistoryPatch() {
  if (isHistoryPatched) return;
  window.history.pushState = sharedPushState;
  window.history.replaceState = sharedReplaceState;
  isHistoryPatched = true;
}

function uninstallHistoryPatch() {
  if (!isHistoryPatched) return;
  window.history.pushState = getOriginalPushState();
  window.history.replaceState = getOriginalReplaceState();
  isHistoryPatched = false;
}

type HistoryNavigationApi = {
  addEventListener: (type: "navigate", listener: (event: Event) => void) => void;
  removeEventListener: (type: "navigate", listener: (event: Event) => void) => void;
};

type HistoryNavigateEvent = Event & {
  canIntercept?: boolean;
  destination?: {
    url?: string;
  };
  navigationType?: string;
};

type HistoryStateValue = Record<string, unknown>;

type UseUnsavedChangesGuardResult = {
  allowNextNavigation: () => void;
};

type UseUnsavedChangesGuardOptions = {
  isDirty: boolean;
  warningMessage?: string;
};

function getHistoryNavigationApi() {
  return (window as Window & { navigation?: HistoryNavigationApi }).navigation;
}

function toHistoryStateValue(value: unknown): HistoryStateValue {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as HistoryStateValue;
}

function getHistoryStateIndex(state: unknown) {
  const index = toHistoryStateValue(state)[HISTORY_INDEX_STATE_KEY];

  return typeof index === "number" ? index : null;
}

function resolveNavigationUrl(target: string | URL | null | undefined) {
  if (!target) {
    return null;
  }

  const currentUrl = new URL(window.location.href);
  const nextUrl = new URL(target.toString(), currentUrl);

  return `${nextUrl.pathname}${nextUrl.search}`;
}

function isPathNavigation(currentLocation: string, nextLocation: string | null) {
  return !!nextLocation && currentLocation !== nextLocation;
}

/**
 * WARNING: This hook monkey-patches window.history.pushState and
 * window.history.replaceState to intercept client-side navigation.
 * This is a known fragile pattern — it may conflict with Next.js App Router
 * internals or other libraries that patch the same methods.
 *
 * Preferred alternative: use the App Router's navigation events API when
 * it becomes stable, or listen to the `beforeunload` event for tab-close only.
 *
 * Do not add new consumers of this hook without careful testing.
 */
export function useUnsavedChangesGuard({
  isDirty,
  warningMessage = DEFAULT_WARNING_MESSAGE,
}: UseUnsavedChangesGuardOptions): UseUnsavedChangesGuardResult {
  const bypassNavigationRef = useRef(false);
  const confirmedLocationRef = useRef<string | null>(null);
  const historyIndexRef = useRef(0);

  const allowNextNavigation = useCallback(() => {
    bypassNavigationRef.current = true;
    confirmedLocationRef.current = null;
  }, []);

  const confirmNavigation = useCallback(
    (target: string | URL | null | undefined) => {
      const currentLocation = `${window.location.pathname}${window.location.search}`;
      const nextLocation = resolveNavigationUrl(target);

      if (!isPathNavigation(currentLocation, nextLocation)) {
        return true;
      }

      if (bypassNavigationRef.current) {
        return true;
      }

      if (nextLocation && confirmedLocationRef.current === nextLocation) {
        return true;
      }

      const confirmed = window.confirm(warningMessage);

      if (confirmed) {
        confirmedLocationRef.current = nextLocation;
      }

      return confirmed;
    },
    [warningMessage],
  );

  useEffect(() => {
    if (!isDirty) {
      bypassNavigationRef.current = false;
      confirmedLocationRef.current = null;
    }
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      Reflect.set(event, "returnValue", warningMessage);
      return warningMessage;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty, warningMessage]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const navigation = getHistoryNavigationApi();

    if (!navigation) {
      return;
    }

    const handleNavigate = (event: Event) => {
      const navigateEvent = event as HistoryNavigateEvent;

      if (navigateEvent.navigationType !== "traverse") {
        return;
      }

      if (!event.cancelable && !navigateEvent.canIntercept) {
        return;
      }

      if (!confirmNavigation(navigateEvent.destination?.url)) {
        event.preventDefault();
      }
    };

    navigation.addEventListener("navigate", handleNavigate);

    return () => {
      navigation.removeEventListener("navigate", handleNavigate);
    };
  }, [confirmNavigation, isDirty]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const stateWithIndex = toHistoryStateValue(window.history.state);
    const currentIndex = getHistoryStateIndex(stateWithIndex) ?? Date.now();

    historyIndexRef.current = currentIndex;

    if (stateWithIndex[HISTORY_INDEX_STATE_KEY] !== currentIndex) {
      window.history.replaceState(
        {
          ...stateWithIndex,
          [HISTORY_INDEX_STATE_KEY]: currentIndex,
        },
        "",
        window.location.href,
      );
    }

    const handlePopState = (event: PopStateEvent) => {
      const nextLocation = `${window.location.pathname}${window.location.search}`;
      const nextIndex = getHistoryStateIndex(event.state);
      const direction = nextIndex === null || nextIndex < historyIndexRef.current ? 1 : -1;

      if (bypassNavigationRef.current) {
        bypassNavigationRef.current = false;
        confirmedLocationRef.current = null;
        historyIndexRef.current = nextIndex ?? historyIndexRef.current;
        return;
      }

      if (!confirmNavigation(nextLocation)) {
        bypassNavigationRef.current = true;
        window.history.go(direction);
        return;
      }

      confirmedLocationRef.current = null;
      historyIndexRef.current = nextIndex ?? historyIndexRef.current;
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [confirmNavigation, isDirty]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const currentState = toHistoryStateValue(window.history.state);
    const baseIndex = getHistoryStateIndex(currentState) ?? Date.now();

    historyIndexRef.current = baseIndex;

    const entry: GuardEntry = {
      confirmNavigation,
      historyIndexRef,
      confirmedLocationRef,
    };

    guardStack.push(entry);
    installHistoryPatch();

    return () => {
      const idx = guardStack.indexOf(entry);
      if (idx !== -1) {
        guardStack.splice(idx, 1);
      }
      if (guardStack.length === 0) {
        uninstallHistoryPatch();
      }
    };
  }, [confirmNavigation, isDirty]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a[href]");

      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) {
        return;
      }

      const currentUrl = new URL(window.location.href);
      const nextUrl = new URL(anchor.href, currentUrl);

      if (currentUrl.pathname === nextUrl.pathname && currentUrl.search === nextUrl.search) {
        return;
      }

      if (!confirmNavigation(anchor.href)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [confirmNavigation, isDirty]);

  return {
    allowNextNavigation,
  };
}

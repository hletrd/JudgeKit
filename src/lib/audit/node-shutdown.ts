import { flushAuditBuffer } from "./events";
import { stopSseCleanupTimer, stopSharedPollTimer } from "@/app/api/v1/submissions/[id]/events/route";

type ProcessLike = {
  once: (event: string, listener: () => void) => unknown;
  exit?: (code?: number) => never;
};

let registered = false;

function getProcessLike(): ProcessLike | null {
  const candidate = (globalThis as typeof globalThis & { process?: unknown }).process;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const processLike = candidate as ProcessLike;
  return typeof processLike.once === "function" ? processLike : null;
}

export function registerAuditFlushOnShutdown() {
  if (registered) return;

  const processLike = getProcessLike();
  if (!processLike) return;

  registered = true;

  processLike.once("beforeExit", () => {
    stopSseCleanupTimer();
    stopSharedPollTimer();
    void flushAuditBuffer().catch(() => {
      // Best-effort flush during shutdown — ignore errors
    });
  });

  processLike.once("SIGTERM", () => {
    stopSseCleanupTimer();
    stopSharedPollTimer();
    void flushAuditBuffer().finally(() => {
      processLike.exit?.(0);
    });
  });

  processLike.once("SIGINT", () => {
    stopSseCleanupTimer();
    stopSharedPollTimer();
    void flushAuditBuffer().finally(() => {
      processLike.exit?.(130);
    });
  });
}

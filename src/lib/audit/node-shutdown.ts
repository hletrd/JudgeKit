import { flushAuditBuffer } from "./events";

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
    void flushAuditBuffer();
  });

  processLike.once("SIGTERM", () => {
    void flushAuditBuffer().finally(() => {
      processLike.exit?.(0);
    });
  });

  processLike.once("SIGINT", () => {
    void flushAuditBuffer().finally(() => {
      processLike.exit?.(130);
    });
  });
}

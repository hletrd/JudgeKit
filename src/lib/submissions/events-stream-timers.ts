declare global {
  var __sseCleanupTimer: ReturnType<typeof setInterval> | undefined;
  var __sseCleanupInitialized: boolean | undefined;
  var __submissionEventsSharedPollTimer: ReturnType<typeof setInterval> | undefined;
}

export function stopSseCleanupTimer() {
  if (globalThis.__sseCleanupTimer) {
    clearInterval(globalThis.__sseCleanupTimer);
    globalThis.__sseCleanupTimer = undefined;
    globalThis.__sseCleanupInitialized = false;
  }
}

export function stopSharedPollTimer() {
  if (globalThis.__submissionEventsSharedPollTimer) {
    clearInterval(globalThis.__submissionEventsSharedPollTimer);
    globalThis.__submissionEventsSharedPollTimer = undefined;
  }
}

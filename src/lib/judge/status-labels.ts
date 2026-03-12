/**
 * Build a localized map of submission status labels.
 * Accepts the `t` function from `useTranslations("submissions")`
 * (or equivalent namespace that has `status.*` keys).
 */
export function buildStatusLabels(t: (key: string) => string): Record<string, string> {
  return {
    pending: t("status.pending"),
    queued: t("status.queued"),
    judging: t("status.judging"),
    accepted: t("status.accepted"),
    wrong_answer: t("status.wrong_answer"),
    time_limit: t("status.time_limit"),
    memory_limit: t("status.memory_limit"),
    runtime_error: t("status.runtime_error"),
    compile_error: t("status.compile_error"),
  };
}

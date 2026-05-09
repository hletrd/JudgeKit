import pino from "pino";
import { LOGGER_REDACT_PATHS } from "@/lib/security/secrets";

const isDev = process.env.NODE_ENV === "development";
const REDACTED_PLACEHOLDER = "[REDACTED]";

export function createLogger(destination?: Parameters<typeof pino>[1]) {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
      base: { service: "judgekit" },
      redact: {
        paths: LOGGER_REDACT_PATHS,
        censor: REDACTED_PLACEHOLDER,
      },
    },
    destination
  );
}

export const logger = createLogger();

export function createRequestLogger(context: {
  requestId?: string;
  userId?: string;
  route?: string;
}) {
  return logger.child(context);
}

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const DOCKER_DATABASE_HOSTS = new Set(["db", "db-postgres"]);

function isTruthy(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value ?? "");
}

export function resolveHostRunDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const current = env.DATABASE_URL;
  if (!isTruthy(env.JUDGEKIT_HOST_DATABASE_URL)) {
    return current;
  }

  const explicit = env.HOST_DATABASE_URL ?? env.DATABASE_URL_HOST;
  if (explicit) {
    return explicit;
  }

  if (!current) {
    return current;
  }

  let url: URL;
  try {
    url = new URL(current);
  } catch {
    return current;
  }

  if (!DOCKER_DATABASE_HOSTS.has(url.hostname)) {
    return current;
  }

  url.hostname = env.HOST_DATABASE_HOST ?? "127.0.0.1";
  if (env.HOST_DATABASE_PORT) {
    url.port = env.HOST_DATABASE_PORT;
  }
  return url.toString();
}

const hostRunDatabaseUrl = resolveHostRunDatabaseUrl();
if (hostRunDatabaseUrl) {
  process.env.DATABASE_URL = hostRunDatabaseUrl;
}

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load as parseYaml } from "js-yaml";

/**
 * Regression guard for the Apr 2026 data-loss incident.
 *
 * The postgres:18-alpine image defaults PGDATA to a non-standard path
 * (/var/lib/postgresql/18/docker). If a compose file mounts a named volume
 * at /var/lib/postgresql/data without explicitly setting PGDATA to the same
 * path, postgres initialises its cluster at the image default, which lands
 * OUTSIDE the named volume. The named volume stays empty, the cluster ends
 * up in an anonymous volume, and the next `docker compose up` after the
 * operator "fixes" the compose file silently initialises a fresh cluster —
 * wiping the application's data.
 *
 * This test asserts, at unit-test time, that every postgres service across
 * the in-tree compose files pins PGDATA to the same path as the mounted
 * data volume. A regression here means any of the following have happened:
 *
 *   1. Someone removed the `PGDATA: /var/lib/postgresql/data` line.
 *   2. Someone added a new postgres service without pinning PGDATA.
 *   3. The volume mount and PGDATA path drifted.
 *
 * All three are deploy-time bombs. Catch them in CI.
 */

const REQUIRED_PGDATA = "/var/lib/postgresql/data";

type VolumeEntry = string | { source?: string; target?: string; type?: string };
type ComposeService = {
  image?: string;
  volumes?: VolumeEntry[];
  environment?: Record<string, string | null> | string[];
};
type ComposeFile = {
  services?: Record<string, ComposeService>;
};

function readCompose(relativePath: string): ComposeFile {
  const raw = readFileSync(join(process.cwd(), relativePath), "utf8");
  const parsed = parseYaml(raw) as ComposeFile | undefined;
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Failed to parse ${relativePath} as a YAML mapping`);
  }
  return parsed;
}

function extractEnv(service: ComposeService): Record<string, string> {
  const env = service.environment ?? {};
  if (Array.isArray(env)) {
    const out: Record<string, string> = {};
    for (const entry of env) {
      if (typeof entry !== "string") continue;
      const eq = entry.indexOf("=");
      if (eq === -1) {
        out[entry.trim()] = "";
      } else {
        out[entry.slice(0, eq).trim()] = entry.slice(eq + 1).trim();
      }
    }
    return out;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    out[String(k)] = v == null ? "" : String(v);
  }
  return out;
}

function mountsDataPath(service: ComposeService): boolean {
  const volumes = service.volumes ?? [];
  for (const vol of volumes) {
    if (typeof vol === "string") {
      // short form: [source]:target[:mode]
      const parts = vol.split(":");
      if (parts.length >= 2 && parts[1] === REQUIRED_PGDATA) {
        return true;
      }
    } else if (typeof vol === "object" && vol) {
      if (vol.target === REQUIRED_PGDATA) {
        return true;
      }
    }
  }
  return false;
}

function isPostgresService(service: ComposeService): boolean {
  const image = service.image ?? "";
  if (typeof image !== "string") return false;
  return image.startsWith("postgres:") || image === "postgres";
}

function collectPostgresServices(
  compose: ComposeFile
): Array<[string, ComposeService]> {
  const services = compose.services ?? {};
  return Object.entries(services).filter(([, svc]) =>
    isPostgresService(svc as ComposeService)
  ) as Array<[string, ComposeService]>;
}

describe("postgres compose services pin PGDATA", () => {
  const composeFiles = [
    "docker-compose.production.yml",
    "docker-compose.test-backends.yml",
  ];

  for (const file of composeFiles) {
    describe(file, () => {
      const compose = readCompose(file);
      const pgServices = collectPostgresServices(compose);

      it("has at least one postgres service (safety: test guards a real target)", () => {
        expect(pgServices.length).toBeGreaterThan(0);
      });

      for (const [name, service] of pgServices) {
        describe(`service ${name}`, () => {
          it(`pins PGDATA to ${REQUIRED_PGDATA}`, () => {
            const env = extractEnv(service);
            expect(
              env.PGDATA,
              `Service ${name} in ${file} must set PGDATA=${REQUIRED_PGDATA} ` +
                `to prevent the postgres:18-alpine anonymous-volume data loss scenario ` +
                `(see scripts/pg-volume-safety-check.sh).`
            ).toBe(REQUIRED_PGDATA);
          });

          it(`mounts a volume at ${REQUIRED_PGDATA} (PGDATA must land on a named volume)`, () => {
            expect(
              mountsDataPath(service),
              `Service ${name} in ${file} pins PGDATA to ${REQUIRED_PGDATA} ` +
                `but no volume is mounted there — the cluster would live in an ` +
                `anonymous volume.`
            ).toBe(true);
          });
        });
      }
    });
  }
});

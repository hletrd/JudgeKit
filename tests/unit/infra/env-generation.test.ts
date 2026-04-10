import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for the PLUGIN_CONFIG_ENCRYPTION_KEY provisioning gap.
 *
 * All three deploy scripts generate a fresh .env.production on first deploy
 * when one does not already exist. The app refuses to start operations like
 * API-key creation and plugin secret encryption unless
 * PLUGIN_CONFIG_ENCRYPTION_KEY is set, and older generators silently skipped
 * it — the app looked fine until a user hit /api/v1/admin/api-keys and got
 * a 500. This test asserts every env-generation block produces the key.
 *
 * It also asserts that each script has the "backfill" path that adds the
 * key to an existing remote .env.production file if it is missing, so
 * re-deploying against a host that predates the key auto-repairs.
 */

const REQUIRED_KEYS = [
  "AUTH_SECRET=",
  "AUTH_URL=",
  "AUTH_TRUST_HOST=true",
  "POSTGRES_PASSWORD=",
  "PLUGIN_CONFIG_ENCRYPTION_KEY=",
  "JUDGE_AUTH_TOKEN=",
];

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("deploy script env generation includes required secrets", () => {
  const scripts = [
    "deploy-docker.sh",
    "deploy.sh",
  ] as const;
  for (const script of scripts) {
    describe(script, () => {
      const content = read(script);

      for (const key of REQUIRED_KEYS) {
        if (script === "deploy.sh" && key === "POSTGRES_PASSWORD=") {
          // legacy deploy.sh generator also includes POSTGRES_PASSWORD —
          // keeping the assertion list identical to catch future drift.
        }
        it(`writes ${key} into the generated .env.production`, () => {
          expect(
            content.includes(key),
            `${script} must emit ${key} when generating .env.production`,
          ).toBe(true);
        });
      }

      it("backfills PLUGIN_CONFIG_ENCRYPTION_KEY when the remote file is missing it", () => {
        expect(content).toContain("PLUGIN_CONFIG_ENCRYPTION_KEY");
        // Look for a guarded branch that only runs when the key is missing.
        // The exact shape differs per script, but they all grep for the
        // key and append if absent.
        const missingGuardPattern =
          /grep -q '\^PLUGIN_CONFIG_ENCRYPTION_KEY='|PLUGIN_CONFIG_ENCRYPTION_KEY\s*hex/;
        expect(
          missingGuardPattern.test(content),
          `${script} must backfill PLUGIN_CONFIG_ENCRYPTION_KEY on remotes that predate the key`,
        ).toBe(true);
      });
    });
  }

  describe("deploy-test-backends.sh", () => {
    const content = read("deploy-test-backends.sh");

    it("writes PLUGIN_CONFIG_ENCRYPTION_KEY into the generated remote .env.production", () => {
      expect(content).toContain("PLUGIN_CONFIG_ENCRYPTION_KEY=${PLUGIN_CONFIG_ENCRYPTION_KEY}");
    });

    it("backfills PLUGIN_CONFIG_ENCRYPTION_KEY on a running remote that lacks it", () => {
      expect(content).toContain("grep -q '^PLUGIN_CONFIG_ENCRYPTION_KEY='");
    });
  });

  describe(".env.production.example", () => {
    const content = read(".env.production.example");
    it("lists PLUGIN_CONFIG_ENCRYPTION_KEY as a required field", () => {
      expect(content).toContain("PLUGIN_CONFIG_ENCRYPTION_KEY=");
    });
  });
});

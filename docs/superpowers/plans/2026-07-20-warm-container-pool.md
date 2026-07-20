# Warm Container Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a pool of pre-started, single-use judge containers warm for Python 3 / C++ / C on the `oj` deployment so test-case execution skips Docker cold start, with an admin page controlling on-demand vs. always-warm per language.

**Architecture:** Admin writes a `warmPool` JSONB blob into the single-row `system_settings` table. The app normalizes it (language → docker image, since `judge-cpp:latest` serves both C and C++) and ships the resulting targets to workers in the **register and heartbeat responses** — a new app→worker config channel. A new Rust `PoolManager` reconciles idle containers against those targets every heartbeat (~30s). At test-case execution the executor adopts a warm container (`docker update` limits → `docker cp` files → `docker exec`), then destroys and replenishes it. **Every warm path failure falls back to today's exact cold `docker run`.**

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM + PostgreSQL, Zod, React 19, vitest (`tests/unit/**/*.test.ts`), Rust (tokio, serde, reqwest) in `judge-worker-rs/`, Docker CLI.

## Global Constraints

- **Isolation is non-negotiable:** a warm container is used by **exactly one test case**, then destroyed. Never reuse a container across submissions or users.
- **Graceful fallback is mandatory:** if any warm step fails (pool empty, `docker update` fails, cgroup v1, missing image, unsupported language), fall through to the existing cold `run_docker_once` path. Judging correctness must never depend on the warm path.
- **Compile phase is NOT warmed** in this plan. `Phase::Compile` keeps using `run_docker_once` unchanged (compile seccomp differs from run seccomp; seccomp is create-time only).
- **Warm containers are created with the same run-phase security flags** as `run_docker_once` (`--network none`, `--read-only`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--user 65534:65534`, run seccomp profile, `--init`). Only `--memory`, `--memory-swap`, `--cpus`, `--pids-limit` are adjusted per submission via `docker update`.
- **Warm containers are named `oj-warm-<uuid>`** to distinguish them from per-run `oj-<uuid>` containers; startup/orphan cleanup must not kill in-use pool containers.
- **Caps:** `WARM_POOL_MAX_PER_IMAGE = 8`, `WARM_POOL_MAX_TOTAL = 24`.
- **Korean UI text:** no custom `letter-spacing` / `tracking-*` on Korean content; 해요체.
- **Commits:** GPG-signed (`git commit -S`), Conventional Commits with gitmoji, no `Co-Authored-By`.
- Unit tests live in `tests/unit/**/*.test.ts`; run with `npx vitest run <path>`. Rust tests are inline `#[cfg(test)] mod tests`; run with `cargo test` in `judge-worker-rs/`.

---

## File Structure

**Create:**
- `src/lib/judge/warm-pool.ts` — pure types + normalization (language→image, caps). No DB/IO.
- `src/lib/judge/warm-pool-server.ts` — DB-backed `getWarmPoolTargets()` (settings + enabled languages).
- `drizzle/pg/0040_warm_pool.sql` — migration.
- `src/app/(dashboard)/dashboard/admin/settings/warm-pool-form.tsx` — admin UI form.
- `judge-worker-rs/src/pool.rs` — `WarmPoolTargets` reconciliation + idle container pool.
- `tests/unit/judge/warm-pool.test.ts`, `tests/unit/judge/warm-pool-server.test.ts`, `tests/unit/api/judge-warm-pool-propagation.test.ts`, `tests/unit/actions/system-settings-warm-pool.test.ts`.

**Modify:**
- `src/lib/db/schema.pg.ts:676` — add `warmPool` jsonb column to `systemSettings`.
- `src/lib/system-settings.ts:87` + `:168` — add `warmPool` to `SystemSettingsRecord` and the fallback branch.
- `src/lib/validators/system-settings.ts:158` — add `warmPool` zod schema.
- `src/lib/actions/system-settings.ts:131` + `:231` — destructure + `hasOwnInput` write block.
- `src/app/api/v1/admin/settings/route.ts:98` — add `"warmPool"` to `allowedConfigKeys`.
- `src/app/api/v1/judge/register/route.ts:80-85` — add `warmPool` to response.
- `src/app/api/v1/judge/heartbeat/route.ts:97` — add `warmPool` to response.
- `src/app/(dashboard)/dashboard/admin/settings/page.tsx` — load + pass warm-pool props.
- `judge-worker-rs/src/types.rs:346` — `WarmPoolTargets`, `RegisterResponseData.warm_pool`, `HeartbeatResponse`.
- `judge-worker-rs/src/api.rs:102-132` — `heartbeat()` returns parsed targets.
- `judge-worker-rs/src/config.rs:51` — `warm_pool_disabled` kill switch.
- `judge-worker-rs/src/main.rs:290-439` — pool init from register, updates from heartbeat, drain on shutdown.
- `judge-worker-rs/src/docker.rs` — warm container create, `run_docker_warm`, cleanup awareness.
- `judge-worker-rs/src/executor.rs` — run-phase warm attempt + cold fallback.
- `docs/judge-workers.md`, `.env.example` — document `WORKER_WARM_POOL_DISABLE`, `WARM_POOL_DEFAULT_ENABLED`.

---

## Phase 1 — Shared normalization (pure, no IO)

### Task 1: Warm-pool types and normalization

**Files:**
- Create: `src/lib/judge/warm-pool.ts`
- Test: `tests/unit/judge/warm-pool.test.ts`

**Interfaces:**
- Consumes: `JUDGE_LANGUAGE_CONFIGS` from `src/lib/judge/languages.ts` (each entry has `dockerImage: string`).
- Produces: `WarmPoolConfig`, `WarmPoolTargets`, `WARM_POOL_MAX_PER_IMAGE`, `WARM_POOL_MAX_TOTAL`, `languageToImage(language: string): string | undefined`, `resolveWarmPoolTargets(config: WarmPoolConfig | null | undefined, enabledLanguages: ReadonlySet<string>): WarmPoolTargets`, `defaultWarmPoolConfig(): WarmPoolConfig`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/judge/warm-pool.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  WARM_POOL_MAX_PER_IMAGE,
  WARM_POOL_MAX_TOTAL,
  languageToImage,
  resolveWarmPoolTargets,
  type WarmPoolConfig,
} from "@/lib/judge/warm-pool";

const ALL = new Set(["python", "c17", "c23", "cpp20", "cpp23", "cpp26", "rust"]);

describe("languageToImage", () => {
  it("maps C and C++ variants to the shared judge-cpp image", () => {
    expect(languageToImage("c17")).toBe("judge-cpp:latest");
    expect(languageToImage("cpp20")).toBe("judge-cpp:latest");
  });

  it("maps python to judge-python", () => {
    expect(languageToImage("python")).toBe("judge-python:latest");
  });

  it("returns undefined for an unknown language", () => {
    expect(languageToImage("brainfuck-9000")).toBeUndefined();
  });
});

describe("resolveWarmPoolTargets", () => {
  it("returns disabled targets when config is null", () => {
    expect(resolveWarmPoolTargets(null, ALL)).toEqual({ enabled: false, images: {} });
  });

  it("returns disabled targets when config.enabled is false", () => {
    const config: WarmPoolConfig = { enabled: false, languages: { python: 2 } };
    expect(resolveWarmPoolTargets(config, ALL)).toEqual({ enabled: false, images: {} });
  });

  it("groups languages by image and takes the MAX, not the sum", () => {
    // One warm judge-cpp container can serve either C or C++, so 2 and 3 -> 3.
    const config: WarmPoolConfig = { enabled: true, languages: { c17: 2, cpp20: 3 } };
    expect(resolveWarmPoolTargets(config, ALL)).toEqual({
      enabled: true,
      images: { "judge-cpp:latest": 3 },
    });
  });

  it("keeps distinct images separate", () => {
    const config: WarmPoolConfig = { enabled: true, languages: { python: 2, cpp20: 1 } };
    expect(resolveWarmPoolTargets(config, ALL)).toEqual({
      enabled: true,
      images: { "judge-cpp:latest": 1, "judge-python:latest": 2 },
    });
  });

  it("skips languages that are disabled in languageConfigs", () => {
    const config: WarmPoolConfig = { enabled: true, languages: { python: 2, cpp20: 2 } };
    expect(resolveWarmPoolTargets(config, new Set(["python"]))).toEqual({
      enabled: true,
      images: { "judge-python:latest": 2 },
    });
  });

  it("skips unknown languages and non-positive counts", () => {
    const config: WarmPoolConfig = {
      enabled: true,
      languages: { python: 0, nope: 5, cpp20: -3 },
    };
    expect(resolveWarmPoolTargets(config, new Set(["python", "nope", "cpp20"]))).toEqual({
      enabled: true,
      images: {},
    });
  });

  it("clamps per-image counts to WARM_POOL_MAX_PER_IMAGE", () => {
    const config: WarmPoolConfig = {
      enabled: true,
      languages: { python: WARM_POOL_MAX_PER_IMAGE + 50 },
    };
    expect(resolveWarmPoolTargets(config, ALL)).toEqual({
      enabled: true,
      images: { "judge-python:latest": WARM_POOL_MAX_PER_IMAGE },
    });
  });

  it("enforces WARM_POOL_MAX_TOTAL across images deterministically", () => {
    const languages: Record<string, number> = {};
    for (const lang of ["python", "cpp20", "rust"]) {
      languages[lang] = WARM_POOL_MAX_PER_IMAGE;
    }
    const result = resolveWarmPoolTargets({ enabled: true, languages }, ALL);
    const total = Object.values(result.images).reduce((sum, n) => sum + n, 0);
    expect(total).toBeLessThanOrEqual(WARM_POOL_MAX_TOTAL);
  });

  it("floors fractional counts", () => {
    const config: WarmPoolConfig = { enabled: true, languages: { python: 2.9 } };
    expect(resolveWarmPoolTargets(config, ALL)).toEqual({
      enabled: true,
      images: { "judge-python:latest": 2 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/judge/warm-pool.test.ts`
Expected: FAIL — cannot resolve module `@/lib/judge/warm-pool`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/judge/warm-pool.ts`:

```ts
import { JUDGE_LANGUAGE_CONFIGS } from "@/lib/judge/languages";

/**
 * Admin-facing warm-pool configuration, stored as JSONB in
 * `system_settings.warm_pool`. Counts are keyed by LANGUAGE because that is
 * what an admin picks; normalization to docker images happens in
 * `resolveWarmPoolTargets` (C and C++ share `judge-cpp:latest`).
 */
export interface WarmPoolConfig {
  enabled: boolean;
  /** language key -> desired idle warm-container count (0 = off) */
  languages: Record<string, number>;
}

/** What the worker actually reconciles against: idle containers per image. */
export interface WarmPoolTargets {
  enabled: boolean;
  /** docker image -> desired idle warm-container count */
  images: Record<string, number>;
}

/** Per-image ceiling — bounds idle RAM/PID usage on the worker host. */
export const WARM_POOL_MAX_PER_IMAGE = 8;
/** Fleet-wide ceiling across all images on a single worker. */
export const WARM_POOL_MAX_TOTAL = 24;

/**
 * Default config used until an admin saves an explicit value. Enabled only
 * when the deployment opts in via `WARM_POOL_DEFAULT_ENABLED=true` (set for
 * the oj/auraedu app environment), so other deployments stay off by default.
 */
export function defaultWarmPoolConfig(): WarmPoolConfig {
  return {
    enabled: process.env.WARM_POOL_DEFAULT_ENABLED === "true",
    languages: { python: 2, cpp20: 2, c17: 2 },
  };
}

export function languageToImage(language: string): string | undefined {
  const entry = JUDGE_LANGUAGE_CONFIGS[language as keyof typeof JUDGE_LANGUAGE_CONFIGS];
  return entry?.dockerImage;
}

/**
 * Convert admin per-language counts into per-image targets.
 *
 * Counts for languages sharing an image are merged with MAX (not sum): a warm
 * `judge-cpp:latest` container can serve a C submission or a C++ one, so
 * provisioning both separately would double-allocate idle containers.
 */
export function resolveWarmPoolTargets(
  config: WarmPoolConfig | null | undefined,
  enabledLanguages: ReadonlySet<string>,
): WarmPoolTargets {
  if (!config || !config.enabled) {
    return { enabled: false, images: {} };
  }

  const merged: Record<string, number> = {};
  for (const [language, rawCount] of Object.entries(config.languages ?? {})) {
    if (!enabledLanguages.has(language)) continue;
    const image = languageToImage(language);
    if (!image) continue;
    const count = Math.min(WARM_POOL_MAX_PER_IMAGE, Math.floor(Number(rawCount) || 0));
    if (count <= 0) continue;
    merged[image] = Math.max(merged[image] ?? 0, count);
  }

  // Apply the fleet-wide cap deterministically (sorted by image name) so the
  // same config always yields the same targets across workers and restarts.
  const images: Record<string, number> = {};
  let total = 0;
  for (const image of Object.keys(merged).sort()) {
    if (total >= WARM_POOL_MAX_TOTAL) break;
    const allowed = Math.min(merged[image], WARM_POOL_MAX_TOTAL - total);
    if (allowed > 0) {
      images[image] = allowed;
      total += allowed;
    }
  }

  return { enabled: true, images };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/judge/warm-pool.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/judge/warm-pool.ts tests/unit/judge/warm-pool.test.ts
git commit -S -m "feat(judge): ✨ add warm pool config normalization"
```

---

## Phase 2 — Persistence

### Task 2: `warmPool` column, migration, and record type

**Files:**
- Modify: `src/lib/db/schema.pg.ts:676` (inside `systemSettings`, after `communityDownvoteEnabled`)
- Create: `drizzle/pg/0040_warm_pool.sql`
- Modify: `src/lib/system-settings.ts:87` (type) and `:168` (fallback branch)

**Interfaces:**
- Consumes: `WarmPoolConfig` from Task 1.
- Produces: `SystemSettingsRecord.warmPool?: WarmPoolConfig | null`.

- [ ] **Step 1: Add the schema column**

In `src/lib/db/schema.pg.ts`, add immediately after the `communityDownvoteEnabled` line (`:676`) and before `updatedAt`:

```ts
  // Warm container pool: admin-controlled idle judge containers kept ready per
  // language so test-case execution skips Docker cold start. Shape:
  // { enabled: boolean, languages: Record<string, number> }. NULL = use the
  // deployment default (see defaultWarmPoolConfig()).
  warmPool: jsonb("warm_pool").$type<{
    enabled: boolean;
    languages: Record<string, number>;
  } | null>(),
```

- [ ] **Step 2: Create the migration**

Create `drizzle/pg/0040_warm_pool.sql`:

```sql
ALTER TABLE "system_settings"
  ADD COLUMN IF NOT EXISTS "warm_pool" jsonb;
```

- [ ] **Step 3: Extend the record type**

In `src/lib/system-settings.ts`, add to `SystemSettingsRecord` after `communityDownvoteEnabled?: boolean | null;` (`:87`):

```ts
  warmPool?: { enabled: boolean; languages: Record<string, number> } | null;
```

And in the fallback branch object, after `communityDownvoteEnabled: null,` (`:168`), add:

```ts
      warmPool: null,
```

- [ ] **Step 4: Verify the schema compiles and drift is clean**

Run: `npx tsc --noEmit`
Expected: no errors referencing `warmPool` / `system-settings.ts`.

Run: `npm run db:check`
Expected: reports the new `0040_warm_pool.sql` as the pending/applied migration with no unexpected drift.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.pg.ts drizzle/pg/0040_warm_pool.sql src/lib/system-settings.ts
git commit -S -m "feat(db): ✨ add warm_pool settings column"
```

---

## Phase 3 — Validation and write paths

### Task 3: Zod validation for `warmPool`

**Files:**
- Modify: `src/lib/validators/system-settings.ts:158` (after `footerContent`)
- Test: `tests/unit/judge/warm-pool.test.ts` (append a new `describe`)

**Interfaces:**
- Consumes: `WARM_POOL_MAX_PER_IMAGE` from Task 1.
- Produces: `systemSettingsSchema` now accepts `warmPool?: { enabled: boolean; languages: Record<string, number> } | null`.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/judge/warm-pool.test.ts`:

```ts
import { systemSettingsSchema } from "@/lib/validators/system-settings";

describe("systemSettingsSchema warmPool", () => {
  it("accepts a valid warm pool config", () => {
    const parsed = systemSettingsSchema.safeParse({
      warmPool: { enabled: true, languages: { python: 2, cpp20: 3 } },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts null (clear to default)", () => {
    expect(systemSettingsSchema.safeParse({ warmPool: null }).success).toBe(true);
  });

  it("accepts omission", () => {
    expect(systemSettingsSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a count above the per-image cap", () => {
    const parsed = systemSettingsSchema.safeParse({
      warmPool: { enabled: true, languages: { python: WARM_POOL_MAX_PER_IMAGE + 1 } },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a negative count", () => {
    const parsed = systemSettingsSchema.safeParse({
      warmPool: { enabled: true, languages: { python: -1 } },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-integer count", () => {
    const parsed = systemSettingsSchema.safeParse({
      warmPool: { enabled: true, languages: { python: 1.5 } },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a missing enabled flag", () => {
    const parsed = systemSettingsSchema.safeParse({
      warmPool: { languages: { python: 1 } },
    });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/judge/warm-pool.test.ts -t "warmPool"`
Expected: FAIL — the cap/negative/non-integer cases pass validation because the schema ignores unknown keys.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/validators/system-settings.ts`, add the import at the top:

```ts
import { WARM_POOL_MAX_PER_IMAGE } from "@/lib/judge/warm-pool";
```

and add this field to `systemSettingsSchema` right after `footerContent` (`:158`):

```ts
  // Warm container pool (admin-controlled). Counts are per LANGUAGE; the
  // app normalizes them to per-image targets before shipping them to workers.
  warmPool: z
    .object({
      enabled: z.boolean(),
      languages: z.record(
        z.string().max(50),
        z
          .number()
          .int("mustBeInteger")
          .min(0, "valueTooSmall")
          .max(WARM_POOL_MAX_PER_IMAGE, "valueTooLarge"),
      ),
    })
    .nullable()
    .optional(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/judge/warm-pool.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators/system-settings.ts tests/unit/judge/warm-pool.test.ts
git commit -S -m "feat(validators): ✨ validate warm pool settings input"
```

---

### Task 4: Persist `warmPool` from both writers

**Files:**
- Modify: `src/lib/actions/system-settings.ts:131` (destructure) and `:231` (write block)
- Modify: `src/app/api/v1/admin/settings/route.ts:98` (`allowedConfigKeys`)
- Test: extend `tests/unit/actions/system-settings.test.ts` (existing harness) and the existing admin-settings route test

**Interfaces:**
- Consumes: `systemSettingsSchema` (Task 3).
- Produces: a `warmPool` value persisted to `system_settings` by the server action and the REST PUT, guarded by `hasOwnInput` so partial updates never wipe it.

- [ ] **Step 1: Write the failing test**

**Do NOT create a new test file and do NOT assert on source text.** `tests/unit/actions/system-settings.test.ts` already has a full mock harness (`mocks.auth`, `mocks.resolveCapabilities`, `mocks.dbInsertValues`, `mocks.dbInsertOnConflictDoUpdate`, `mocks.requireSettingsReconfirm`, …) that calls the real `updateSystemSettings`. Append this describe block to that file, reusing whatever authorized-caller setup its existing `beforeEach` performs:

```ts
describe("updateSystemSettings warmPool", () => {
  it("persists the warm pool config when provided", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");
    const warmPool = { enabled: true, languages: { python: 2, cpp20: 2 } };

    const result = await updateSystemSettings({ warmPool });

    expect(result.success).toBe(true);
    const written = mocks.dbInsertValues.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(written.warmPool).toEqual(warmPool);
  });

  it("does not touch warmPool when the payload omits it", async () => {
    // Partial-update contract: a PUT that only changes the site title must not
    // wipe the warm pool column.
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");

    await updateSystemSettings({ siteTitle: "JudgeKit" });

    const written = mocks.dbInsertValues.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(written).not.toHaveProperty("warmPool");
  });

  it("clears warmPool to null when explicitly nulled", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");

    await updateSystemSettings({ warmPool: null });

    const written = mocks.dbInsertValues.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(written.warmPool).toBeNull();
  });

  it("rejects a count above the per-image cap before writing", async () => {
    const { updateSystemSettings } = await import("@/lib/actions/system-settings");

    const result = await updateSystemSettings({
      warmPool: { enabled: true, languages: { python: 999 } },
    });

    expect(result.success).toBe(false);
    expect(mocks.dbInsertValues).not.toHaveBeenCalled();
  });
});
```

For the REST PUT, add an equivalent behavioral test to the existing admin-settings route test file (`tests/unit/api/admin-settings-reconfirm.test.ts` or a sibling admin-settings route test — reuse whichever already invokes the `PUT` handler with mocked deps): send `{ warmPool: { enabled: true, languages: { python: 2 } } }` and assert the value reaches the insert/`onConflictDoUpdate` payload. If no such harness exists in that file, create `tests/unit/api/admin-settings-warm-pool.route.test.ts` modelled on the mock setup in `tests/unit/api/judge-heartbeat.route.test.ts` (hoisted mocks + `apiSuccess` stubbed to `NextResponse.json({ data })`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/actions/system-settings.test.ts -t "warmPool"`
Expected: FAIL — `written.warmPool` is `undefined` because the action does not yet persist the field.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/actions/system-settings.ts`, add `warmPool` to the destructuring list right after `footerContent,` (`:130`):

```ts
    warmPool,
```

and add this write block right after the `footerContent` block (`:228`):

```ts
  if (hasOwnInput("warmPool")) {
    baseValues.warmPool = warmPool ?? null;
  }
```

In `src/app/api/v1/admin/settings/route.ts`, add `"warmPool"` to `allowedConfigKeys` (`:98`), after `"uploadMaxZipDecompressedSizeBytes",`:

```ts
      "warmPool",
```

(The existing `filteredConfig` loop at `:164-168` writes any allowed key whose value is not `undefined`, so the jsonb object persists without further changes.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/actions/system-settings.test.ts`
Expected: PASS — the new warmPool tests plus every pre-existing test in the file (the `hasOwnInput` addition must not regress the other partial-update tests).

Run the admin-settings route test file you extended.
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/system-settings.ts src/app/api/v1/admin/settings/route.ts tests/unit/actions/system-settings.test.ts tests/unit/api/
git commit -S -m "feat(admin): ✨ persist warm pool settings from both writers"
```

---

## Phase 4 — App→worker propagation

### Task 5: Server-side target resolution

**Files:**
- Create: `src/lib/judge/warm-pool-server.ts`
- Test: `tests/unit/judge/warm-pool-server.test.ts`

**Interfaces:**
- Consumes: `resolveWarmPoolTargets`, `defaultWarmPoolConfig` (Task 1); `getSystemSettings` from `@/lib/system-settings`; `languageConfigs` table.
- Produces: `getWarmPoolTargets(): Promise<WarmPoolTargets>` — used by the register and heartbeat routes.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/judge/warm-pool-server.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSystemSettings = vi.fn();
const selectFrom = vi.fn();

vi.mock("@/lib/system-settings", () => ({
  getSystemSettings: () => getSystemSettings(),
}));

vi.mock("@/lib/db", () => ({
  db: { select: () => ({ from: () => selectFrom() }) },
}));

describe("getWarmPoolTargets", () => {
  beforeEach(() => {
    vi.resetModules();
    getSystemSettings.mockReset();
    selectFrom.mockReset();
    delete process.env.WARM_POOL_DEFAULT_ENABLED;
  });

  it("resolves stored config into per-image targets", async () => {
    getSystemSettings.mockResolvedValue({
      warmPool: { enabled: true, languages: { python: 2, cpp20: 2, c17: 2 } },
    });
    selectFrom.mockResolvedValue([
      { language: "python", isEnabled: true },
      { language: "cpp20", isEnabled: true },
      { language: "c17", isEnabled: true },
    ]);

    const { getWarmPoolTargets } = await import("@/lib/judge/warm-pool-server");
    await expect(getWarmPoolTargets()).resolves.toEqual({
      enabled: true,
      images: { "judge-cpp:latest": 2, "judge-python:latest": 2 },
    });
  });

  it("falls back to the deployment default when the column is null", async () => {
    process.env.WARM_POOL_DEFAULT_ENABLED = "true";
    getSystemSettings.mockResolvedValue({ warmPool: null });
    selectFrom.mockResolvedValue([
      { language: "python", isEnabled: true },
      { language: "cpp20", isEnabled: true },
      { language: "c17", isEnabled: true },
    ]);

    const { getWarmPoolTargets } = await import("@/lib/judge/warm-pool-server");
    const targets = await getWarmPoolTargets();
    expect(targets.enabled).toBe(true);
    expect(targets.images["judge-python:latest"]).toBe(2);
  });

  it("is disabled by default when the deployment does not opt in", async () => {
    getSystemSettings.mockResolvedValue({ warmPool: null });
    selectFrom.mockResolvedValue([{ language: "python", isEnabled: true }]);

    const { getWarmPoolTargets } = await import("@/lib/judge/warm-pool-server");
    await expect(getWarmPoolTargets()).resolves.toEqual({ enabled: false, images: {} });
  });

  it("excludes languages disabled in languageConfigs", async () => {
    getSystemSettings.mockResolvedValue({
      warmPool: { enabled: true, languages: { python: 2, cpp20: 2 } },
    });
    selectFrom.mockResolvedValue([
      { language: "python", isEnabled: true },
      { language: "cpp20", isEnabled: false },
    ]);

    const { getWarmPoolTargets } = await import("@/lib/judge/warm-pool-server");
    await expect(getWarmPoolTargets()).resolves.toEqual({
      enabled: true,
      images: { "judge-python:latest": 2 },
    });
  });

  it("returns disabled targets if settings lookup throws", async () => {
    getSystemSettings.mockRejectedValue(new Error("db down"));
    selectFrom.mockResolvedValue([]);

    const { getWarmPoolTargets } = await import("@/lib/judge/warm-pool-server");
    await expect(getWarmPoolTargets()).resolves.toEqual({ enabled: false, images: {} });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/judge/warm-pool-server.test.ts`
Expected: FAIL — cannot resolve `@/lib/judge/warm-pool-server`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/judge/warm-pool-server.ts`:

```ts
import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { getSystemSettings } from "@/lib/system-settings";
import {
  defaultWarmPoolConfig,
  resolveWarmPoolTargets,
  type WarmPoolConfig,
  type WarmPoolTargets,
} from "@/lib/judge/warm-pool";

const DISABLED: WarmPoolTargets = { enabled: false, images: {} };

/**
 * Resolve the warm-pool targets a worker should reconcile against. Shipped in
 * the register and heartbeat responses so an admin toggle reaches the fleet
 * within one heartbeat without a redeploy.
 *
 * Fails closed: any lookup error yields disabled targets, which degrades the
 * worker to today's cold-start behaviour rather than breaking heartbeats.
 */
export async function getWarmPoolTargets(): Promise<WarmPoolTargets> {
  try {
    const settings = await getSystemSettings();
    const stored = settings?.warmPool as WarmPoolConfig | null | undefined;
    const config = stored ?? defaultWarmPoolConfig();

    const rows = await db
      .select({
        language: languageConfigs.language,
        isEnabled: languageConfigs.isEnabled,
      })
      .from(languageConfigs);

    const enabled = new Set(
      rows.filter((row) => row.isEnabled !== false).map((row) => row.language),
    );

    return resolveWarmPoolTargets(config, enabled);
  } catch {
    return DISABLED;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/judge/warm-pool-server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/judge/warm-pool-server.ts tests/unit/judge/warm-pool-server.test.ts
git commit -S -m "feat(judge): ✨ resolve warm pool targets server-side"
```

---

### Task 6: Ship targets in register and heartbeat responses

**Files:**
- Modify: `src/app/api/v1/judge/register/route.ts:80-85`
- Modify: `src/app/api/v1/judge/heartbeat/route.ts:97`
- Test: extend `tests/unit/api/judge-register.route.test.ts` and `tests/unit/api/judge-heartbeat.route.test.ts` (existing harnesses)

**Interfaces:**
- Consumes: `getWarmPoolTargets()` (Task 5).
- Produces: both responses now carry `warmPool: { enabled, images }` inside the `data` envelope produced by `apiSuccess`.

- [ ] **Step 1: Write the failing test**

**Do NOT create a new file and do NOT assert on source text.** Both route test files already invoke the real `POST` handler with hoisted mocks and stub `apiSuccess` as `NextResponse.json({ data })`, so the response body is directly assertable.

Add to **both** files a mock for the resolver:

```ts
vi.mock("@/lib/judge/warm-pool-server", () => ({
  getWarmPoolTargets: vi
    .fn()
    .mockResolvedValue({ enabled: true, images: { "judge-cpp:latest": 2 } }),
}));
```

Append to `tests/unit/api/judge-register.route.test.ts`, reusing the file's existing helper for building an authorized request:

```ts
describe("warm pool targets in the register response", () => {
  it("returns targets so a freshly started worker can build its pool immediately", async () => {
    const { POST } = await import("@/app/api/v1/judge/register/route");

    const response = await POST(makeRegisterRequest({ hostname: "w1", concurrency: 4 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.warmPool).toEqual({
      enabled: true,
      images: { "judge-cpp:latest": 2 },
    });
  });
});
```

Append to `tests/unit/api/judge-heartbeat.route.test.ts`, reusing its authorized-heartbeat setup:

```ts
describe("warm pool targets in the heartbeat response", () => {
  it("returns targets on every heartbeat so admin toggles reach the fleet", async () => {
    const { POST } = await import("@/app/api/v1/judge/heartbeat/route");

    const response = await POST(makeHeartbeatRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.ok).toBe(true);
    expect(body.data.warmPool).toEqual({
      enabled: true,
      images: { "judge-cpp:latest": 2 },
    });
  });
});
```

Replace `makeRegisterRequest` / `makeHeartbeatRequest` with whatever request helpers those files already define.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/api/judge-register.route.test.ts tests/unit/api/judge-heartbeat.route.test.ts -t "warm pool"`
Expected: FAIL — `body.data.warmPool` is `undefined`; neither route returns the field yet.

- [ ] **Step 3: Write minimal implementation**

In `src/app/api/v1/judge/register/route.ts`, add the import:

```ts
import { getWarmPoolTargets } from "@/lib/judge/warm-pool-server";
```

and replace the success return (`:80-85`) with:

```ts
    return apiSuccess({
      workerId: worker.id,
      workerSecret,
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      staleClaimTimeoutMs: STALE_CLAIM_TIMEOUT_MS,
      // Warm-pool targets so a freshly started worker can build its pool
      // immediately instead of waiting for the first heartbeat.
      warmPool: await getWarmPoolTargets(),
    });
```

In `src/app/api/v1/judge/heartbeat/route.ts`, add the import:

```ts
import { getWarmPoolTargets } from "@/lib/judge/warm-pool-server";
```

and replace the success return (`:97`) with:

```ts
    // Heartbeat is the steady-state config channel: an admin toggling the warm
    // pool reaches every worker within one heartbeat interval (~30s) with no
    // redeploy. getWarmPoolTargets fails closed to disabled targets.
    return apiSuccess({ ok: true, warmPool: await getWarmPoolTargets() });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/api/judge-register.route.test.ts tests/unit/api/judge-heartbeat.route.test.ts`
Expected: PASS — the new warm-pool tests plus every pre-existing test in both files (adding an `await` to the response must not regress auth, rate-limit, or staleness-sweep behaviour).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/judge/register/route.ts src/app/api/v1/judge/heartbeat/route.ts tests/unit/api/judge-register.route.test.ts tests/unit/api/judge-heartbeat.route.test.ts
git commit -S -m "feat(judge): ✨ ship warm pool targets to workers"
```

---

## Phase 5 — Admin UI

### Task 7: Warm pool admin form

**Files:**
- Create: `src/app/(dashboard)/dashboard/admin/settings/warm-pool-form.tsx`
- Modify: `src/app/(dashboard)/dashboard/admin/settings/page.tsx`
- Modify: `src/app/(dashboard)/dashboard/admin/settings/settings-tabs.tsx`
- Modify: `messages/en.json`, `messages/ko.json`

**Interfaces:**
- Consumes: `updateSystemSettings` from `@/lib/actions/system-settings`; `WarmPoolConfig`, `WARM_POOL_MAX_PER_IMAGE`, `languageToImage` from `@/lib/judge/warm-pool`; `getSystemSettings`.
- Produces: `<WarmPoolForm initialConfig={...} languages={...} />`.

- [ ] **Step 1: Create the form component**

Create `src/app/(dashboard)/dashboard/admin/settings/warm-pool-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { updateSystemSettings } from "@/lib/actions/system-settings";
import {
  WARM_POOL_MAX_PER_IMAGE,
  languageToImage,
  type WarmPoolConfig,
} from "@/lib/judge/warm-pool";

export interface WarmPoolLanguageOption {
  language: string;
  displayName: string;
}

interface WarmPoolFormProps {
  initialConfig: WarmPoolConfig;
  languages: WarmPoolLanguageOption[];
}

export function WarmPoolForm({ initialConfig, languages }: WarmPoolFormProps) {
  const t = useTranslations("admin.settings.warmPool");
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [counts, setCounts] = useState<Record<string, number>>(initialConfig.languages ?? {});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const setCount = (language: string, value: number) => {
    setCounts((prev) => ({ ...prev, [language]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    // Drop zero/absent entries so the stored blob only lists warmed languages.
    const cleaned: Record<string, number> = {};
    for (const [language, count] of Object.entries(counts)) {
      if (count > 0) cleaned[language] = count;
    }

    const result = await updateSystemSettings({
      warmPool: { enabled, languages: cleaned },
    });
    setSaving(false);
    setMessage(result.success ? t("saved") : (result.error ?? t("saveFailed")));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={enabled}
            onCheckedChange={(checked) => setEnabled(checked === true)}
          />
          <span>{t("enabled")}</span>
        </label>
        <p className="mt-1 text-sm text-muted-foreground">{t("enabledHelp")}</p>
      </div>

      <div className="space-y-3">
        {languages.map((option) => {
          const image = languageToImage(option.language) ?? "-";
          return (
            <div key={option.language} className="flex items-center gap-3">
              <Checkbox
                checked={(counts[option.language] ?? 0) > 0}
                disabled={!enabled}
                onCheckedChange={(checked) =>
                  setCount(option.language, checked === true ? 2 : 0)
                }
              />
              <span className="min-w-40">{option.displayName}</span>
              <Input
                type="number"
                min={0}
                max={WARM_POOL_MAX_PER_IMAGE}
                className="w-24"
                disabled={!enabled || (counts[option.language] ?? 0) === 0}
                value={counts[option.language] ?? 0}
                onChange={(event) =>
                  setCount(option.language, Number(event.target.value) || 0)
                }
              />
              <span className="text-sm text-muted-foreground">{image}</span>
            </div>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">{t("sharedImageHint")}</p>

      <Button type="submit" disabled={saving}>
        {saving ? t("saving") : t("save")}
      </Button>
      {message ? <p className="text-sm">{message}</p> : null}
    </form>
  );
}
```

- [ ] **Step 2: Add i18n strings**

In `messages/en.json`, under `admin.settings`, add:

```json
"warmPool": {
  "title": "Warm container pool",
  "enabled": "Enable warm container pool",
  "enabledHelp": "Keep idle judge containers ready so test-case execution skips Docker cold start. Takes effect on workers within about 30 seconds.",
  "sharedImageHint": "Languages that share a Docker image share one pool; the largest configured count wins.",
  "save": "Save",
  "saving": "Saving...",
  "saved": "Saved",
  "saveFailed": "Failed to save"
}
```

In `messages/ko.json`, under `admin.settings`, add (해요체, no custom letter-spacing):

```json
"warmPool": {
  "title": "웜 컨테이너 풀",
  "enabled": "웜 컨테이너 풀 사용",
  "enabledHelp": "채점 컨테이너를 미리 띄워 둬서 테스트케이스 실행이 콜드 스타트를 건너뛰게 해요. 워커에는 약 30초 안에 반영돼요.",
  "sharedImageHint": "같은 도커 이미지를 쓰는 언어는 풀을 공유하고, 설정한 개수 중 가장 큰 값이 적용돼요.",
  "save": "저장",
  "saving": "저장 중...",
  "saved": "저장했어요",
  "saveFailed": "저장하지 못했어요"
}
```

- [ ] **Step 3: Wire the page and tab**

In `src/app/(dashboard)/dashboard/admin/settings/page.tsx`, add imports:

```tsx
import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { defaultWarmPoolConfig, type WarmPoolConfig } from "@/lib/judge/warm-pool";
import { WarmPoolForm } from "./warm-pool-form";
```

After the existing `getSystemSettings()` call, derive the props:

```tsx
  const warmPoolConfig: WarmPoolConfig =
    (settings?.warmPool as WarmPoolConfig | null | undefined) ?? defaultWarmPoolConfig();

  const warmPoolLanguages = (
    await db
      .select({
        language: languageConfigs.language,
        displayName: languageConfigs.displayName,
        isEnabled: languageConfigs.isEnabled,
      })
      .from(languageConfigs)
  )
    .filter((row) => row.isEnabled !== false)
    .map((row) => ({ language: row.language, displayName: row.displayName }));
```

Render inside the settings tabs (follow the existing tab markup in `settings-tabs.tsx`, adding a `warmPool` tab whose panel is):

```tsx
<WarmPoolForm initialConfig={warmPoolConfig} languages={warmPoolLanguages} />
```

- [ ] **Step 4: Verify it builds and renders**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no new errors in the touched files.

Manually: start the dev server, sign in as an admin, open `/dashboard/admin/settings`, select the warm-pool tab, toggle a language, save, and confirm the value round-trips after a reload.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/admin/settings/ messages/en.json messages/ko.json
git commit -S -m "feat(admin): ✨ add warm container pool settings UI"
```

---

## Phase 6 — Rust: wire types, config, and pool reconciliation

### Task 8: Warm-pool wire types and heartbeat parsing

**Files:**
- Modify: `judge-worker-rs/src/types.rs:346` (after `RegisterResponseData`)
- Modify: `judge-worker-rs/src/api.rs:102-132` (`heartbeat`)

**Interfaces:**
- Produces: `types::WarmPoolTargets { enabled: bool, images: HashMap<String, u32> }`, `RegisterResponseData.warm_pool`, `HeartbeatResponse`, and `ApiClient::heartbeat(...) -> Result<WarmPoolTargets, String>`.

- [ ] **Step 1: Write the failing test**

Append to the existing `#[cfg(test)] mod tests` in `judge-worker-rs/src/types.rs`:

```rust
    #[test]
    fn warm_pool_targets_default_to_disabled_when_absent() {
        // Older app servers omit warmPool entirely; the worker must treat that
        // as "warm pool off" rather than failing to parse the response.
        let json = r#"{"workerId":"w1","workerSecret":"s","heartbeatIntervalMs":30000,"staleClaimTimeoutMs":300000}"#;
        let parsed: super::RegisterResponseData = serde_json::from_str(json).expect("parse");
        assert!(!parsed.warm_pool.enabled);
        assert!(parsed.warm_pool.images.is_empty());
    }

    #[test]
    fn warm_pool_targets_parse_image_counts() {
        let json = r#"{"workerId":"w1","workerSecret":"s","heartbeatIntervalMs":30000,"staleClaimTimeoutMs":300000,"warmPool":{"enabled":true,"images":{"judge-cpp:latest":2}}}"#;
        let parsed: super::RegisterResponseData = serde_json::from_str(json).expect("parse");
        assert!(parsed.warm_pool.enabled);
        assert_eq!(parsed.warm_pool.images.get("judge-cpp:latest"), Some(&2));
    }

    #[test]
    fn heartbeat_response_parses_warm_pool() {
        let json = r#"{"data":{"ok":true,"warmPool":{"enabled":true,"images":{"judge-python:latest":3}}}}"#;
        let parsed: super::HeartbeatResponse = serde_json::from_str(json).expect("parse");
        assert_eq!(parsed.data.warm_pool.images.get("judge-python:latest"), Some(&3));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd judge-worker-rs && cargo test warm_pool`
Expected: FAIL — `no field 'warm_pool'` / `cannot find type 'HeartbeatResponse'`.

- [ ] **Step 3: Write minimal implementation**

In `judge-worker-rs/src/types.rs`, add after `RegisterResponseData` (`:346`):

```rust
/// Warm container pool targets pushed by the app server in the register and
/// heartbeat responses. `#[serde(default)]` everywhere so an older app server
/// that omits the field simply yields "disabled" instead of a parse error.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
pub struct WarmPoolTargets {
    #[serde(default)]
    pub enabled: bool,
    /// docker image -> desired idle warm-container count
    #[serde(default)]
    pub images: std::collections::HashMap<String, u32>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct HeartbeatResponseData {
    #[serde(rename = "warmPool", default)]
    pub warm_pool: WarmPoolTargets,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HeartbeatResponse {
    pub data: HeartbeatResponseData,
}
```

and add this field to `RegisterResponseData`:

```rust
    #[serde(rename = "warmPool", default)]
    pub warm_pool: WarmPoolTargets,
```

In `judge-worker-rs/src/api.rs`, change the import line to include the new types:

```rust
use crate::types::{
    ClaimRequest, DeregisterRequest, HeartbeatRequest, HeartbeatResponse, PollResponse,
    RegisterRequest, RegisterResponse, ResultReport, SecretString, StatusReport, Submission,
    TestResult, WarmPoolTargets,
};
```

and replace the tail of `heartbeat` (from the `if !response.status().is_success()` check through `Ok(())`) with:

```rust
        if !response.status().is_success() {
            return Err(format!("Heartbeat failed: {}", response.status()));
        }

        // The heartbeat response is the steady-state warm-pool config channel.
        // A body that fails to parse must not fail the heartbeat itself (the
        // worker is still alive); fall back to disabled targets.
        match response.json::<HeartbeatResponse>().await {
            Ok(parsed) => Ok(parsed.data.warm_pool),
            Err(e) => {
                tracing::debug!(error = %e, "heartbeat response missing/invalid warmPool");
                Ok(WarmPoolTargets::default())
            }
        }
```

and change its signature to:

```rust
    ) -> Result<WarmPoolTargets, String> {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd judge-worker-rs && cargo test warm_pool`
Expected: PASS.

Run: `cd judge-worker-rs && cargo build`
Expected: FAIL at `main.rs` — the heartbeat call site now yields `WarmPoolTargets`. Fix it in Task 10; for this commit, update the `Ok(())` match arm in `main.rs:411` to `Ok(_) => {`.

- [ ] **Step 5: Commit**

```bash
git add judge-worker-rs/src/types.rs judge-worker-rs/src/api.rs judge-worker-rs/src/main.rs
git commit -S -m "feat(worker): ✨ parse warm pool targets from app server"
```

---

### Task 9: Worker kill switch and pool reconciliation planning

**Files:**
- Modify: `judge-worker-rs/src/config.rs:51` (struct field) and `from_env`
- Create: `judge-worker-rs/src/pool.rs`
- Modify: `judge-worker-rs/src/main.rs` (add `mod pool;`)

**Interfaces:**
- Consumes: `types::WarmPoolTargets` (Task 8).
- Produces: `Config.warm_pool_disabled: bool`; `pool::ReconcilePlan { to_create: Vec<(String, usize)>, to_remove: Vec<(String, usize)> }`; `pool::plan_reconcile(current: &HashMap<String, usize>, targets: &WarmPoolTargets) -> ReconcilePlan`.

- [ ] **Step 1: Write the failing test**

Create `judge-worker-rs/src/pool.rs` containing only the test module for now:

```rust
#[cfg(test)]
mod tests {
    use super::plan_reconcile;
    use crate::types::WarmPoolTargets;
    use std::collections::HashMap;

    fn targets(enabled: bool, pairs: &[(&str, u32)]) -> WarmPoolTargets {
        WarmPoolTargets {
            enabled,
            images: pairs.iter().map(|(k, v)| ((*k).to_string(), *v)).collect(),
        }
    }

    fn current(pairs: &[(&str, usize)]) -> HashMap<String, usize> {
        pairs.iter().map(|(k, v)| ((*k).to_string(), *v)).collect()
    }

    #[test]
    fn creates_missing_containers_up_to_target() {
        let plan = plan_reconcile(&current(&[]), &targets(true, &[("judge-cpp:latest", 2)]));
        assert_eq!(plan.to_create, vec![("judge-cpp:latest".to_string(), 2)]);
        assert!(plan.to_remove.is_empty());
    }

    #[test]
    fn removes_excess_containers() {
        let plan = plan_reconcile(
            &current(&[("judge-cpp:latest", 5)]),
            &targets(true, &[("judge-cpp:latest", 2)]),
        );
        assert!(plan.to_create.is_empty());
        assert_eq!(plan.to_remove, vec![("judge-cpp:latest".to_string(), 3)]);
    }

    #[test]
    fn is_a_noop_when_already_at_target() {
        let plan = plan_reconcile(
            &current(&[("judge-cpp:latest", 2)]),
            &targets(true, &[("judge-cpp:latest", 2)]),
        );
        assert!(plan.to_create.is_empty());
        assert!(plan.to_remove.is_empty());
    }

    #[test]
    fn drains_everything_when_disabled() {
        let plan = plan_reconcile(
            &current(&[("judge-cpp:latest", 2), ("judge-python:latest", 1)]),
            &targets(false, &[("judge-cpp:latest", 2)]),
        );
        assert!(plan.to_create.is_empty());
        let mut removed = plan.to_remove.clone();
        removed.sort();
        assert_eq!(
            removed,
            vec![
                ("judge-cpp:latest".to_string(), 2),
                ("judge-python:latest".to_string(), 1)
            ]
        );
    }

    #[test]
    fn drains_images_dropped_from_targets() {
        let plan = plan_reconcile(
            &current(&[("judge-python:latest", 3)]),
            &targets(true, &[("judge-cpp:latest", 1)]),
        );
        assert_eq!(plan.to_create, vec![("judge-cpp:latest".to_string(), 1)]);
        assert_eq!(plan.to_remove, vec![("judge-python:latest".to_string(), 3)]);
    }

    #[test]
    fn plans_are_deterministic_across_runs() {
        let cur = current(&[("judge-python:latest", 1)]);
        let tgt = targets(true, &[("judge-cpp:latest", 2), ("judge-rust:latest", 1)]);
        assert_eq!(plan_reconcile(&cur, &tgt), plan_reconcile(&cur, &tgt));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd judge-worker-rs && cargo test plan_reconcile`
Expected: FAIL — `cannot find function 'plan_reconcile'`.

- [ ] **Step 3: Write minimal implementation**

Prepend to `judge-worker-rs/src/pool.rs` (above the test module):

```rust
use crate::types::WarmPoolTargets;
use std::collections::HashMap;

/// Difference between the pool we have and the pool we want, expressed as
/// per-image counts. Kept as a pure value so the decision logic is unit
/// testable without touching Docker.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ReconcilePlan {
    /// (image, how many idle containers to create)
    pub to_create: Vec<(String, usize)>,
    /// (image, how many idle containers to destroy)
    pub to_remove: Vec<(String, usize)>,
}

/// Compute the create/remove deltas needed to move `current` to `targets`.
///
/// When `targets.enabled` is false the plan drains every image, which is how an
/// admin turning the feature off reaches the fleet on the next heartbeat.
/// Output is sorted by image name so a given (current, targets) pair always
/// produces the same plan.
pub fn plan_reconcile(
    current: &HashMap<String, usize>,
    targets: &WarmPoolTargets,
) -> ReconcilePlan {
    let mut plan = ReconcilePlan::default();

    let desired: HashMap<&str, usize> = if targets.enabled {
        targets
            .images
            .iter()
            .map(|(image, count)| (image.as_str(), *count as usize))
            .collect()
    } else {
        HashMap::new()
    };

    let mut images: Vec<&str> = current
        .keys()
        .map(String::as_str)
        .chain(desired.keys().copied())
        .collect();
    images.sort_unstable();
    images.dedup();

    for image in images {
        let have = current.get(image).copied().unwrap_or(0);
        let want = desired.get(image).copied().unwrap_or(0);
        if want > have {
            plan.to_create.push((image.to_string(), want - have));
        } else if have > want {
            plan.to_remove.push((image.to_string(), have - want));
        }
    }

    plan
}
```

In `judge-worker-rs/src/config.rs`, add to the `Config` struct after `prewarm_images` (`:51`):

```rust
    /// Operator kill switch. When true the worker ignores warm-pool targets
    /// from the app server and judges every test case with a cold
    /// `docker run`. Configurable via `WORKER_WARM_POOL_DISABLE`.
    pub warm_pool_disabled: bool,
```

and inside `from_env`, before the final `Ok(Self { ... })`, add:

```rust
        let warm_pool_disabled = env::var("WORKER_WARM_POOL_DISABLE")
            .map(|v| {
                let v = v.trim().to_ascii_lowercase();
                v == "1" || v == "true" || v == "yes"
            })
            .unwrap_or(false);
```

and add `warm_pool_disabled,` to the returned struct literal.

In `judge-worker-rs/src/main.rs`, add the module declaration next to the other `mod` lines:

```rust
mod pool;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd judge-worker-rs && cargo test plan_reconcile`
Expected: PASS (6 tests).

Run: `cd judge-worker-rs && cargo build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add judge-worker-rs/src/pool.rs judge-worker-rs/src/config.rs judge-worker-rs/src/main.rs
git commit -S -m "feat(worker): ✨ add warm pool reconciliation planning"
```

---

### Task 10: Idle container lifecycle and pool manager

**Files:**
- Modify: `judge-worker-rs/src/pool.rs` (add `PoolManager`)
- Modify: `judge-worker-rs/src/docker.rs` (add `create_warm_container`, `remove_container_by_name`, warm-aware cleanup)
- Modify: `judge-worker-rs/src/main.rs` (init from register, update from heartbeat, drain on shutdown)

**Interfaces:**
- Consumes: `plan_reconcile` (Task 9), `Config.warm_pool_disabled` (Task 9), `WarmPoolTargets` (Task 8).
- Produces: `pool::PoolManager::new(disabled: bool) -> Arc<PoolManager>`, `PoolManager::set_targets(&self, targets: WarmPoolTargets)`, `PoolManager::acquire(&self, image: &str) -> Option<String>` (returns a container name), `PoolManager::drain_all(&self)`; `docker::create_warm_container(image: &str) -> Result<String, String>`, `docker::remove_container_by_name(name: &str)`.

- [ ] **Step 1: Write the failing test**

Append to the test module in `judge-worker-rs/src/pool.rs`:

```rust
    use super::PoolManager;

    #[tokio::test]
    async fn acquire_returns_none_when_pool_is_empty() {
        let manager = PoolManager::new(false);
        assert_eq!(manager.acquire("judge-cpp:latest").await, None);
    }

    #[tokio::test]
    async fn disabled_manager_never_hands_out_containers() {
        let manager = PoolManager::new(true);
        manager
            .set_targets(targets(true, &[("judge-cpp:latest", 2)]))
            .await;
        assert_eq!(manager.acquire("judge-cpp:latest").await, None);
        assert_eq!(manager.idle_counts().await.len(), 0);
    }

    #[tokio::test]
    async fn acquire_pops_a_registered_idle_container_once() {
        let manager = PoolManager::new(false);
        manager
            .register_idle_for_test("judge-cpp:latest", "oj-warm-abc")
            .await;
        assert_eq!(
            manager.acquire("judge-cpp:latest").await,
            Some("oj-warm-abc".to_string())
        );
        // Single-use: the same container is never handed out twice.
        assert_eq!(manager.acquire("judge-cpp:latest").await, None);
    }

    #[tokio::test]
    async fn idle_counts_reflect_registered_containers() {
        let manager = PoolManager::new(false);
        manager
            .register_idle_for_test("judge-cpp:latest", "oj-warm-1")
            .await;
        manager
            .register_idle_for_test("judge-cpp:latest", "oj-warm-2")
            .await;
        let counts = manager.idle_counts().await;
        assert_eq!(counts.get("judge-cpp:latest"), Some(&2));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd judge-worker-rs && cargo test pool::`
Expected: FAIL — `cannot find type 'PoolManager'`.

- [ ] **Step 3: Write minimal implementation**

Add to `judge-worker-rs/src/pool.rs` (above the test module):

```rust
use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Prefix for warm (pre-started, idle) containers. Distinct from the per-run
/// `oj-` prefix so cleanup sweeps can tell a pooled container apart from an
/// abandoned judging container.
pub const WARM_CONTAINER_PREFIX: &str = "oj-warm-";

#[derive(Default)]
struct PoolState {
    /// image -> idle container names ready to be adopted
    idle: HashMap<String, VecDeque<String>>,
    targets: WarmPoolTargets,
}

/// Maintains a pool of pre-started, idle judge containers so a test-case run
/// can skip Docker container creation. Containers are strictly single use: a
/// container handed out by `acquire` is never returned to the pool.
pub struct PoolManager {
    disabled: bool,
    state: Mutex<PoolState>,
}

impl PoolManager {
    pub fn new(disabled: bool) -> Arc<Self> {
        Arc::new(Self {
            disabled,
            state: Mutex::new(PoolState::default()),
        })
    }

    /// Replace the desired targets (called on register and every heartbeat).
    pub async fn set_targets(&self, targets: WarmPoolTargets) {
        if self.disabled {
            return;
        }
        let mut state = self.state.lock().await;
        state.targets = targets;
    }

    /// Current idle container count per image.
    pub async fn idle_counts(&self) -> HashMap<String, usize> {
        let state = self.state.lock().await;
        state
            .idle
            .iter()
            .map(|(image, queue)| (image.clone(), queue.len()))
            .collect()
    }

    /// Take an idle container for a single run. Returns None when the pool is
    /// empty or disabled, which makes the caller fall back to a cold run.
    pub async fn acquire(&self, image: &str) -> Option<String> {
        if self.disabled {
            return None;
        }
        let mut state = self.state.lock().await;
        state.idle.get_mut(image).and_then(VecDeque::pop_front)
    }

    #[cfg(test)]
    pub async fn register_idle_for_test(&self, image: &str, container: &str) {
        let mut state = self.state.lock().await;
        state
            .idle
            .entry(image.to_string())
            .or_default()
            .push_back(container.to_string());
    }

    /// Bring the live pool in line with the current targets. Creates missing
    /// idle containers and destroys excess ones. Failures are logged and
    /// ignored: a pool that cannot be filled simply means cold runs.
    pub async fn reconcile(&self) {
        if self.disabled {
            return;
        }

        // Compute the plan under the lock, then release it before touching
        // Docker so a slow `docker run` never blocks acquire() on the hot path.
        let plan = {
            let state = self.state.lock().await;
            let current: HashMap<String, usize> = state
                .idle
                .iter()
                .map(|(image, queue)| (image.clone(), queue.len()))
                .collect();
            plan_reconcile(&current, &state.targets)
        };

        for (image, count) in plan.to_remove {
            for _ in 0..count {
                let victim = {
                    let mut state = self.state.lock().await;
                    state.idle.get_mut(&image).and_then(VecDeque::pop_front)
                };
                match victim {
                    Some(name) => crate::docker::remove_container_by_name(&name).await,
                    None => break,
                }
            }
        }

        for (image, count) in plan.to_create {
            for _ in 0..count {
                match crate::docker::create_warm_container(&image).await {
                    Ok(name) => {
                        let mut state = self.state.lock().await;
                        state
                            .idle
                            .entry(image.clone())
                            .or_default()
                            .push_back(name);
                    }
                    Err(e) => {
                        tracing::warn!(image = %image, error = %e, "failed to create warm container");
                        break;
                    }
                }
            }
        }
    }

    /// Destroy every idle container (graceful shutdown).
    pub async fn drain_all(&self) {
        let drained: Vec<String> = {
            let mut state = self.state.lock().await;
            state.idle.drain().flat_map(|(_, queue)| queue).collect()
        };
        for name in drained {
            crate::docker::remove_container_by_name(&name).await;
        }
    }
}
```

In `judge-worker-rs/src/docker.rs`, add these functions (mirroring the run-phase flags assembled in `run_docker_once`, minus the per-submission limits which `docker update` applies at adopt time):

```rust
/// Create a pre-started, idle sandbox container for `image`.
///
/// Flags mirror the Phase::Run container in `run_docker_once` — same network,
/// filesystem, capability, user and seccomp posture — EXCEPT:
///   * `/workspace` is a writable tmpfs (there is no submission workspace to
///     bind-mount yet; files arrive later via `docker cp`), and
///   * memory/cpu/pids start at generous ceilings and are tightened to the
///     submission's real limits with `docker update` when the container is
///     adopted.
/// The container idles on `sleep infinity` and is destroyed after one use.
pub async fn create_warm_container(image: &str) -> Result<String, String> {
    let name = format!("{}{}", crate::pool::WARM_CONTAINER_PREFIX, Uuid::new_v4());

    let seccomp = resolve_seccomp_profile(
        Phase::Run,
        &warm_seccomp_profile_path(),
        warm_disable_custom_seccomp(),
        false,
    )
    .map_err(|e| e.to_string())?;

    let mut args: Vec<String> = vec![
        "run".into(),
        "-d".into(),
        "--name".into(),
        name.clone(),
        "--network".into(),
        "none".into(),
        "--memory".into(),
        format!("{}m", WARM_CEILING_MEMORY_MB),
        "--memory-swap".into(),
        format!("{}m", WARM_CEILING_MEMORY_MB),
        "--cpus".into(),
        EXECUTION_CPU_LIMIT.into(),
        "--pids-limit".into(),
        "64".into(),
        "--read-only".into(),
        "--tmpfs".into(),
        RUN_TMPFS.into(),
        "--tmpfs".into(),
        "/workspace:rw,exec,size=64m,uid=65534,gid=65534".into(),
        "--cap-drop=ALL".into(),
        "--security-opt=no-new-privileges".into(),
        "--ulimit".into(),
        "nofile=1024:1024".into(),
        "--user".into(),
        "65534:65534".into(),
        "-w".into(),
        "/workspace".into(),
    ];

    if let Some(profile) = seccomp {
        args.push(format!("--security-opt=seccomp={}", profile.display()));
    }
    if let Some(runtime) = oci_runtime() {
        args.push(format!("--runtime={}", runtime));
    }
    args.push("--init".into());
    args.push(image.to_string());
    args.extend(["sleep".to_string(), "infinity".to_string()]);

    let output = tokio::process::Command::new("docker")
        .args(&args)
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|e| format!("docker run (warm) failed to spawn: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("docker run (warm) failed: {}", stderr.trim()));
    }

    tracing::info!(container = %name, image = %image, "created warm container");
    Ok(name)
}

/// Force-remove a container by name, ignoring "already gone" errors.
pub async fn remove_container_by_name(name: &str) {
    let _ = tokio::process::Command::new("docker")
        .args(["rm", "-f", name])
        .kill_on_drop(true)
        .output()
        .await;
}
```

Add these constants near the other docker constants:

```rust
/// Memory ceiling a warm container starts with. `docker update` lowers this to
/// the submission's real limit when the container is adopted, so it only needs
/// to be >= any per-submission limit the judge will ask for.
const WARM_CEILING_MEMORY_MB: u32 = 1024;
```

and small helpers reading the same env the executor uses:

```rust
fn warm_seccomp_profile_path() -> std::path::PathBuf {
    std::env::var("JUDGE_SECCOMP_PROFILE")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::path::PathBuf::from("/app/seccomp-profile.json"))
}

fn warm_disable_custom_seccomp() -> bool {
    std::env::var("JUDGE_DISABLE_CUSTOM_SECCOMP")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}
```

Make the stale-container sweep warm-aware: in `cleanup_stale_running_containers`, skip names starting with `crate::pool::WARM_CONTAINER_PREFIX` (idle warm containers are long-running by design and must not be reaped as stale). Leave `cleanup_all_oj_containers_at_startup` as-is — removing leftover warm containers from a previous process is correct.

In `judge-worker-rs/src/main.rs`:

1. After a successful register, create and seed the pool (next to the existing prewarm spawn at `:303`):

```rust
            let warm_pool = pool::PoolManager::new(config.warm_pool_disabled);
            warm_pool.set_targets(resp.data.warm_pool.clone()).await;
            {
                let warm_pool = Arc::clone(&warm_pool);
                tokio::spawn(async move { warm_pool.reconcile().await });
            }
```

Hold `warm_pool` in a variable that outlives the match so the poll loop and shutdown can use it.

2. In the heartbeat task (`:407`), feed targets back and reconcile:

```rust
                match client
                    .heartbeat(&wid, wsecret.as_deref(), current_active, available, uptime)
                    .await
                {
                    Ok(targets) => {
                        if consecutive_failures > 0 {
                            tracing::info!(
                                "Heartbeat recovered after {} failures",
                                consecutive_failures
                            );
                        }
                        consecutive_failures = 0;
                        hb_pool.set_targets(targets).await;
                        hb_pool.reconcile().await;
                    }
```

(clone an `Arc<PoolManager>` as `hb_pool` into the heartbeat task alongside the other clones at `:385-388`.)

3. After the poll loop breaks and the heartbeat task is cancelled (`:690`), drain:

```rust
    warm_pool.drain_all().await;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd judge-worker-rs && cargo test pool::`
Expected: PASS (10 tests total in `pool`).

Run: `cd judge-worker-rs && cargo build`
Expected: success.

Run: `cd judge-worker-rs && cargo clippy -- -D warnings`
Expected: no warnings in `pool.rs` / `docker.rs`.

- [ ] **Step 5: Commit**

```bash
git add judge-worker-rs/src/pool.rs judge-worker-rs/src/docker.rs judge-worker-rs/src/main.rs
git commit -S -m "feat(worker): ✨ maintain warm container pool from app targets"
```

---

## Phase 7 — Rust: adopt warm containers for test-case runs

### Task 11: `run_docker_warm` — adopt, retune limits, inject, execute

**Files:**
- Modify: `judge-worker-rs/src/docker.rs`

**Interfaces:**
- Consumes: `DockerRunOptions`, `Phase`, `read_cgroup_memory_peak`, `remove_container_by_name` (Task 10).
- Produces: `docker::run_docker_warm(options: &DockerRunOptions, container: &str) -> Result<DockerRunResult, DockerError>` — same result shape as `run_docker_once`.

**Additional binding requirements (decided after the plan was first written):**

1. **Restore W^X before executing user code (REQUIRED, user-approved).** A cold run mounts `/workspace` read-only and `/tmp` `noexec`, so no path is both writable and executable. A warm container's `/workspace` tmpfs is `rw,exec`, which would hand untrusted submissions a writable+executable path. After `docker cp` and before `docker exec`, drop write permission on `/workspace` and its contents so the executing (uid 65534, no-capability) process cannot create or modify files there, while compiled binaries remain executable. Verify the lockdown actually holds against the unprivileged run user — a submission must not be able to chmod/chown its way back to writable. If the chosen mechanism cannot be shown to hold, treat the warm path as unavailable for that run (`WarmUnavailable` → cold fallback) rather than shipping a weaker sandbox.
2. **Refuse adoption when the submission's memory limit exceeds the warm ceiling.** Warm containers are created at `WARM_CEILING_MEMORY_MB` (1024). `docker update` can lower a limit but must never be used to grant more than the container was created with. If `options.memory_limit_mb` exceeds the ceiling, return `WarmUnavailable` and let the cold path handle it.
3. **Refuse adoption for languages needing an exec-allowed `/tmp`.** Cold run containers set `COMPILE_TMPFS` (exec-allowed) when `options.needs_exec_tmp` is true (.NET/Mono toolchains); warm containers always get the strict `RUN_TMPFS`. If `options.needs_exec_tmp` is true, return `WarmUnavailable` → cold fallback, or those submissions would fail in a warm container.
4. **Treat a missing/dead container as `WarmUnavailable`.** `docker inspect`/`exec` returning "no such container" must fall back to cold, never fail the submission.

- [ ] **Step 1: Write the failing test**

Append to the `#[cfg(test)] mod tests` in `judge-worker-rs/src/docker.rs`:

```rust
    #[test]
    fn warm_update_args_apply_submission_limits() {
        let args = super::warm_update_args("oj-warm-x", 256);
        assert!(args.contains(&"update".to_string()));
        assert!(args.contains(&"--memory".to_string()));
        assert!(args.contains(&"256m".to_string()));
        assert!(args.contains(&"--memory-swap".to_string()));
        assert!(args.contains(&"oj-warm-x".to_string()));
    }

    #[test]
    fn warm_exec_args_run_as_nobody_in_workspace() {
        let args = super::warm_exec_args("oj-warm-x", &["python3".into(), "sol.py".into()], false);
        assert!(args.starts_with(&["exec".to_string()]));
        assert!(args.contains(&"--user".to_string()));
        assert!(args.contains(&"65534:65534".to_string()));
        assert!(args.contains(&"--workdir".to_string()));
        assert!(args.contains(&"/workspace".to_string()));
        assert!(args.contains(&"python3".to_string()));
    }

    #[test]
    fn warm_exec_args_request_stdin_when_input_present() {
        let args = super::warm_exec_args("oj-warm-x", &["cat".into()], true);
        assert!(args.contains(&"-i".to_string()));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd judge-worker-rs && cargo test warm_`
Expected: FAIL — `cannot find function 'warm_update_args'`.

- [ ] **Step 3: Write minimal implementation**

Add to `judge-worker-rs/src/docker.rs`:

```rust
/// `docker update` arguments that retune an adopted warm container to the
/// submission's real limits. Memory is the one limit that MUST be corrected
/// (the container started at WARM_CEILING_MEMORY_MB); cgroup v2 is required.
fn warm_update_args(container: &str, memory_limit_mb: u32) -> Vec<String> {
    let mem = get_memory_limit_mb(memory_limit_mb);
    vec![
        "update".into(),
        "--memory".into(),
        format!("{}m", mem),
        "--memory-swap".into(),
        format!("{}m", mem),
        container.into(),
    ]
}

/// `docker exec` arguments that run the submission command inside an adopted
/// warm container with the same user/workdir the cold path uses.
fn warm_exec_args(container: &str, command: &[String], has_input: bool) -> Vec<String> {
    let mut args: Vec<String> = vec!["exec".into()];
    if has_input {
        args.push("-i".into());
    }
    args.extend([
        "--user".into(),
        "65534:65534".into(),
        "--workdir".into(),
        "/workspace".into(),
        container.to_string(),
    ]);
    args.extend(command.iter().cloned());
    args
}

/// Reset the container's cgroup peak-memory counter so the reading taken after
/// this run reflects only this run. Returns false when the kernel does not
/// support resetting `memory.peak`, in which case the caller must not use the
/// warm path (peak memory would be over-reported).
async fn reset_cgroup_memory_peak(container_id: &str) -> bool {
    for path in [
        format!("/sys/fs/cgroup/system.slice/docker-{container_id}.scope/memory.peak"),
        format!("/sys/fs/cgroup/docker/{container_id}/memory.peak"),
    ] {
        if tokio::fs::write(&path, b"0").await.is_ok() {
            return true;
        }
    }
    false
}
```

Then add `run_docker_warm`, which mirrors `run_docker_once`'s execution/measurement half. Copy the body of `run_docker_once` from the `Command::new("docker")` spawn onward (stdout/stderr capping, stdin write, timeout handling, exit-code mapping, `read_cgroup_memory_peak`) and change only the front half:

```rust
/// Execute one test case inside an ALREADY-RUNNING warm container.
///
/// Caller contract: `container` came from `PoolManager::acquire` (so it is
/// single-use), and the caller destroys it afterwards regardless of outcome.
/// Any Err here means the caller must fall back to `run_docker_once`.
pub async fn run_docker_warm(
    options: &DockerRunOptions,
    container: &str,
) -> Result<DockerRunResult, DockerError> {
    // Warm containers only ever serve the run phase; compile keeps the cold
    // path because its seccomp profile differs and seccomp is create-time only.
    debug_assert_eq!(options.phase, Phase::Run);

    // 1) Retune limits to this submission.
    let update = tokio::process::Command::new("docker")
        .args(warm_update_args(container, options.memory_limit_mb))
        .kill_on_drop(true)
        .output()
        .await
        .map_err(DockerError::SpawnFailed)?;
    if !update.status.success() {
        return Err(DockerError::WarmUnavailable(
            String::from_utf8_lossy(&update.stderr).trim().to_string(),
        ));
    }

    // 2) Copy the prepared workspace in (the warm container has an empty tmpfs
    //    /workspace; it could not bind-mount a workspace that did not exist
    //    when it was created).
    let copy = tokio::process::Command::new("docker")
        .args([
            "cp",
            &format!("{}/.", options.workspace_dir),
            &format!("{container}:/workspace"),
        ])
        .kill_on_drop(true)
        .output()
        .await
        .map_err(DockerError::SpawnFailed)?;
    if !copy.status.success() {
        return Err(DockerError::WarmUnavailable(
            String::from_utf8_lossy(&copy.stderr).trim().to_string(),
        ));
    }

    // 3) Zero the peak-memory counter so the post-run reading is this run's.
    if !reset_cgroup_memory_peak(container).await {
        return Err(DockerError::WarmUnavailable(
            "kernel does not support resetting memory.peak".to_string(),
        ));
    }

    // 4) Execute, then reuse the cold path's measurement logic verbatim.
    let mut child = tokio::process::Command::new("docker")
        .args(warm_exec_args(container, &options.command, options.input.is_some()))
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(DockerError::SpawnFailed)?;

    run_and_measure(&mut child, options, container).await
}
```

**Required refactor (do this first, in the same commit):** extract everything in `run_docker_once` from the `let timeout_duration = ...` line onward — the stdout/stderr capping tasks, the stdin write, the timeout wait, the exit-status → verdict mapping, and the `read_cgroup_memory_peak` call — into:

```rust
async fn run_and_measure(
    child: &mut tokio::process::Child,
    options: &DockerRunOptions,
    container_id: &str,
) -> Result<DockerRunResult, DockerError>
```

and call it from **both** `run_docker_once` and `run_docker_warm`. This is what guarantees warm and cold runs report identical timing, memory and verdict semantics — do not reimplement the measurement logic in `run_docker_warm`.

Add the new error variant to `DockerError`:

```rust
    /// The warm path could not be used for this run; the caller must retry cold.
    WarmUnavailable(String),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd judge-worker-rs && cargo test warm_`
Expected: PASS (3 tests).

Run: `cd judge-worker-rs && cargo test`
Expected: all existing tests still pass (the `run_and_measure` extraction must not change cold-path behaviour).

- [ ] **Step 5: Commit**

```bash
git add judge-worker-rs/src/docker.rs
git commit -S -m "feat(worker): ✨ execute test cases in warm containers"
```

---

### Task 12: Executor warm attempt with cold fallback

**Files:**
- Modify: `judge-worker-rs/src/executor.rs`

**Interfaces:**
- Consumes: `PoolManager::acquire` (Task 10), `docker::run_docker_warm`, `docker::remove_container_by_name` (Tasks 10–11).
- Produces: `executor::execute` unchanged in signature, but the run phase now tries warm first. `execute` gains an `Option<Arc<PoolManager>>` parameter threaded from `main.rs`.

- [ ] **Step 1: Write the failing test**

Append to the `#[cfg(test)] mod tests` in `judge-worker-rs/src/executor.rs`:

```rust
    #[test]
    fn warm_is_attempted_only_for_the_run_phase() {
        // Compile keeps the cold path: its seccomp profile differs from run's
        // and seccomp cannot be changed on an already-created container.
        assert!(super::warm_eligible(crate::docker::Phase::Run));
        assert!(!super::warm_eligible(crate::docker::Phase::Compile));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd judge-worker-rs && cargo test warm_eligible`
Expected: FAIL — `cannot find function 'warm_eligible'`.

- [ ] **Step 3: Write minimal implementation**

In `judge-worker-rs/src/executor.rs`, add:

```rust
/// Only the run phase may use a warm container (see Global Constraints).
pub(crate) fn warm_eligible(phase: crate::docker::Phase) -> bool {
    phase == crate::docker::Phase::Run
}

/// Run one test case, preferring a warm container and falling back to a cold
/// `docker run` on any warm-path failure. The warm container is destroyed after
/// a single use no matter the outcome, preserving per-run isolation.
async fn run_test_case_container(
    options: &docker::DockerRunOptions,
    pool: Option<&std::sync::Arc<crate::pool::PoolManager>>,
) -> Result<docker::DockerRunResult, docker::DockerError> {
    if warm_eligible(options.phase) {
        if let Some(pool) = pool {
            if let Some(container) = pool.acquire(&options.image).await {
                let result = docker::run_docker_warm(options, &container).await;
                // Single use: destroy immediately, then let the pool refill
                // asynchronously so the next test case finds a warm container.
                docker::remove_container_by_name(&container).await;
                {
                    let pool = std::sync::Arc::clone(pool);
                    tokio::spawn(async move { pool.reconcile().await });
                }
                match result {
                    Ok(ok) => return Ok(ok),
                    Err(docker::DockerError::WarmUnavailable(reason)) => {
                        tracing::warn!(reason = %reason, "warm path unavailable; falling back to cold run");
                    }
                    Err(e) => return Err(e),
                }
            }
        }
    }

    // Cold fallback: call the SAME public docker entry point the run loop
    // already used before this change (the wrapper around run_docker_once that
    // handles the seccomp retry) — do not call run_docker_once directly, or the
    // fallback would lose that retry behaviour.
    docker::run_docker(options).await
}
```

Before writing this, open `judge-worker-rs/src/executor.rs` and find the exact function the per-test-case run loop currently calls into `docker` with a `DockerRunOptions` (it is the public wrapper that owns the `should_retry_without_seccomp` retry). Use that exact name in the fallback line above instead of `docker::run_docker` if it differs.

Then replace that per-test-case call in the run loop with `run_test_case_container(&options, pool).await`, and thread `pool: Option<&Arc<PoolManager>>` through `execute`'s signature and its `main.rs` call site (`main.rs:640`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd judge-worker-rs && cargo test warm_eligible`
Expected: PASS.

Run: `cd judge-worker-rs && cargo test`
Expected: all tests pass.

Run: `cd judge-worker-rs && cargo clippy -- -D warnings`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add judge-worker-rs/src/executor.rs judge-worker-rs/src/main.rs
git commit -S -m "feat(worker): ✨ use warm containers with cold fallback"
```

---

## Phase 8 — Defaults, docs, and verification

### Task 13: Document the feature and verify end to end

**Files:**
- Modify: `docs/judge-workers.md`
- Modify: `.env.example`
- Modify: `.env.deploy.auraedu` (oj opt-in)

- [ ] **Step 1: Document the env vars**

In `.env.example`, next to the existing `WORKER_PREWARM_IMAGES` entry (`:147-148`), add:

```bash
# Warm container pool (worker): operator kill switch. When true the worker
# ignores warm-pool targets from the app and judges every test case with a cold
# `docker run`. Default false.
WORKER_WARM_POOL_DISABLE=false

# Warm container pool (app): enables the warm pool by DEFAULT for this
# deployment until an admin saves an explicit value in the admin settings page.
# Set true on the integrated oj/auraedu deployment; leave unset elsewhere.
WARM_POOL_DEFAULT_ENABLED=false
```

In `.env.deploy.auraedu`, add `WARM_POOL_DEFAULT_ENABLED=true` so oj gets Python 3 / C++ / C warmed out of the box.

In `docs/judge-workers.md`, add a "Warm container pool" section after the prewarm docs (`:163-169`) explaining: pool is per docker image (C and C++ share `judge-cpp:latest`); containers are single-use and destroyed after one test case; compile stays cold; admin controls it at `/dashboard/admin/settings`; changes reach workers within one heartbeat (~30s); every failure falls back to a cold `docker run`; `WORKER_WARM_POOL_DISABLE` is the kill switch.

- [ ] **Step 2: Run the full automated gates**

Run: `npx vitest run`
Expected: PASS, including the new `tests/unit/judge/*` and `tests/unit/api/*` files.

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

Run: `cd judge-worker-rs && cargo test && cargo clippy -- -D warnings`
Expected: clean.

- [ ] **Step 3: Verify warm-pool-off is a no-op**

Set `WARM_POOL_DEFAULT_ENABLED` unset and `WORKER_WARM_POOL_DISABLE=true`, start a worker, and submit one Python and one C++ solution.
Expected: judging succeeds; worker logs show no `created warm container` lines; verdicts, time and memory match a pre-change run.

- [ ] **Step 4: Verify warm-pool-on end to end (oj staging)**

Enable the pool in `/dashboard/admin/settings` (Python 3 = 2, C++ = 2, C = 2) and save.
Expected within ~30s: worker logs `created warm container` for `judge-cpp:latest` and `judge-python:latest`; `docker ps` shows `oj-warm-*` containers idling.

Submit Python, C++ and C solutions with multiple test cases.
Expected: correct verdicts; per-test-case time and memory readings in the same range as the cold run (peak memory must NOT accumulate across test cases — that is the `reset_cgroup_memory_peak` guard); `oj-warm-*` containers are consumed and replenished.

Set the pool count to 0 and save.
Expected within ~30s: all `oj-warm-*` containers disappear and judging continues cold.

- [ ] **Step 5: Commit**

```bash
git add docs/judge-workers.md .env.example .env.deploy.auraedu
git commit -S -m "docs(judge): 📝 document warm container pool configuration"
```

---

## Self-Review Notes

**Spec coverage:** every section of `docs/superpowers/specs/2026-07-20-warm-container-pool-design.md` maps to a task — §4 data model → Tasks 1–2; §5 API propagation → Tasks 5–6, 8; §6.1 PoolManager → Tasks 9–10; §6.2 execution path → Tasks 11–12; §6.3 lifecycle/kill switch → Tasks 9–10; §6.4 risks (cgroup v2, ulimit, memory.peak, seccomp) → Tasks 10–11 via `WarmUnavailable` + cold fallback; §7 admin UI → Tasks 3–4, 7; §8 edge cases → Tasks 9–10, 13; §9 tests → every task; §10 rollout → task ordering; §11 non-goals → excluded.

**Known deviation from the spec (deliberate):** the spec left the default enabled everywhere; this plan gates the default behind `WARM_POOL_DEFAULT_ENABLED` so only the oj deployment opts in, matching the original "oj target에서" request. Other deployments stay off until an admin enables it.

**Riskiest task:** Task 11 (`run_docker_warm`). It requires extracting `run_and_measure` out of `run_docker_once` without altering cold-path timing/memory semantics — the existing cold-path tests are the regression gate, and Step 4 runs the whole Rust suite for exactly that reason.

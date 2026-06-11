# RPF Cycle 8 — Debugger

**Date:** 2026-04-29
**HEAD reviewed:** `1c991812`
**Change surface:** 0 commits, 0 files, 0 lines.

## Findings

**0 NEW.** Empty change surface.

## Re-debug verification of prior fixes

### Time-route Date.now → getDbNowMs (cycle-7 stale-AGG-1)

- File `src/app/api/v1/time/route.ts` at HEAD:
  ```ts
  import { NextResponse } from "next/server";
  import { getDbNowMs } from "@/lib/db-time";
  export const dynamic = "force-dynamic";
  export async function GET() {
    return NextResponse.json({ timestamp: await getDbNowMs() });
  }
  ```
- `getDbNowMs` definition in `src/lib/db-time.ts` (verified earlier cycles): runs `SELECT EXTRACT(EPOCH FROM NOW()) * 1000` against the active connection, returns millis.
- Behavior: client `useSyncedClock` hook fetches this endpoint at startup and periodically; gets DB-time millis; aligns local clock skew. Server-side deadline checks use SQL `NOW()` directly, so client and server agree.
- **Bug class eliminated:** "submission rejected with N seconds remaining" from app-server clock drift. Confirmed.
- New cycle-7 regression test guards against future revert.

### Plaintext recruiting token column (cycle-7 stale-AGG-2)

- `src/lib/db/schema.pg.ts` table `recruitingInvitations`:
  - `tokenHash: varchar("token_hash", { length: 64 })` (sha256 hex; 64 chars).
  - `uniqueIndex("ri_token_hash_idx").on(table.tokenHash)`.
- `src/lib/db/schema.pg.ts` (re-grep): no plaintext `token` column in this table; no `ri_token_idx` (plaintext index).
- **Threat class eliminated:** DB backup leak no longer exposes redeemable invitation tokens.

## Bug-class scan at HEAD

- Date.now() in API routes: grep returns hits in: rate-limit modules (`AGG-2` carry), some non-DB-time API routes (request-time helpers, request-id, error timestamps, OAuth state expiry — all benign uses where app-server time is correct or the choice of clock doesn't matter).
- No new instances of clock-skew-sensitive Date.now usage on critical paths.
- No new SQL injection vectors (no SQL string concatenation introduced; drizzle parameterization preserved).
- No new race conditions visible (no new shared state writes).

## Recommendations

- Continue with cycle-8 doc + bash-cap picks. No debugger-specific items to surface.

## Confidence

H on re-validation of cycle-7 fix correctness; H on no-new-bug-class introduction at HEAD.

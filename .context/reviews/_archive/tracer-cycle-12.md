# Tracer — Cycle 12 Deep Review

**Date:** 2026-04-24
**Reviewer:** tracer
**Scope:** Causal tracing of suspicious flows, competing hypotheses

## Traced Flow: Plugin Secret Storage and Retrieval

### Hypothesis: Malformed `enc:v1:` prefix values can silently destroy plugin secrets

**Trace:**

1. Admin submits plugin config with secret key value `enc:v1:not-encrypted`
2. `preparePluginConfigForStorage` (`secrets.ts:104-143`)
   - Line 112: `incomingValue = "enc:v1:not-encrypted"` (string, length > 0)
   - Line 122: `incomingValue.length === 0` → false, skip
   - Line 132: `isEncryptedPluginSecret(incomingValue)` → true (prefix `enc:v1:` matches)
   - Line 136: `prepared[key] = incomingValue` — stored as-is
3. DB now contains `enc:v1:not-encrypted` in the secret config column
4. On next read, `decryptPluginConfigForUse` (`secrets.ts:80-101`)
   - Line 88: `rawValue = "enc:v1:not-encrypted"`, length > 0
   - Line 94: `decryptPluginSecret(rawValue)` called
   - `decryptPluginSecret` (`secrets.ts:30-57`)
     - Line 31: `isEncryptedPluginSecret(value)` → true
     - Line 35: `[, , ivRaw, tagRaw, ciphertextRaw] = value.split(":")`
       - Split result: `["enc", "v1", "not-encrypted"]`
       - `ivRaw = "not-encrypted"`, `tagRaw = undefined`, `ciphertextRaw = undefined`
     - Line 36: `!ivRaw || !tagRaw || !ciphertextRaw` → `!undefined || !undefined` → true
     - Line 37: throws `new Error("Malformed encrypted plugin secret")`
   - Back in `decryptPluginConfigForUse`, line 95: catch block
     - Line 96: `logger.error(...)` logged
     - Line 97: `decrypted[key] = ""` — secret is now empty string
5. Plugin receives empty string for its API key → external API calls fail

**Verdict:** CONFIRMED. The trace shows a clear causal path from malformed prefix input to silent secret loss. The `split(":")` produces fewer than 5 elements, and the destructuring assigns `undefined` to `tagRaw` and `ciphertextRaw`.

**Competing hypothesis:** Could the admin accidentally type `enc:v1:` as a real secret? LOW probability — the prefix is not a natural input. But a malicious admin or XSS could craft it deliberately.

**Fix:** Validate structure in `isEncryptedPluginSecret` or add a separate validation step.

## Traced Flow: Rate-Limit Time Source Inconsistency

### Hypothesis: App time vs. DB time causes rate-limit window miscalculation

**Trace:**

1. Request hits `consumeApiRateLimit` → `atomicConsumeRateLimit`
   - `const now = Date.now()` — app server time, say T_app
   - Writes `windowStartedAt: T_app` to DB
2. Later, another request hits `checkServerActionRateLimit` on the same key
   - `const now = (await getDbNowUncached()).getTime()` — DB time, say T_db
   - Reads `windowStartedAt: T_app` from DB
   - Compares `T_app + windowMs <= T_db`
   - If T_app > T_db (app clock ahead), the window appears already expired even though it isn't
   - If T_app < T_db (app clock behind), the window appears still active even though it should have expired

**Verdict:** CONFIRMED (LOW severity). The inconsistency exists but practical impact is limited by typical sub-second clock skew.

**Fix:** Standardize on DB time in `atomicConsumeRateLimit`.

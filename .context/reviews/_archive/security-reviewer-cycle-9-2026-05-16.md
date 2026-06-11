# Security Reviewer — RPF Cycle 9 (2026-05-16)

**HEAD:** `9854e072` · **Scope:** OWASP top-10 sweep over recently
touched paths (plugins/secrets, data-retention, AI gate, proxy locale).

## Findings

### SEC9-1 — Latent: `isValidEncryptedPluginSecret` unused after policy change

**Severity:** LOW · **Confidence:** HIGH
**File:** `src/lib/plugins/secrets.ts:27-34`

`isValidEncryptedPluginSecret` validates the full
`enc:v1:iv:tag:ciphertext` shape. With the new plaintext-storage
policy, no caller routes through this validator (a grep confirms no
in-repo call sites for `isValidEncryptedPluginSecret`). Dead code
adds confusion. Either re-wire the storage path to call it on incoming
`enc:v1:` writes (defense-in-depth) or remove it.

### SEC9-2 — Verified-safe: `decryptPluginConfigForUse` swallows decrypt errors

**Severity:** INFO · **Confidence:** HIGH
**File:** `src/lib/plugins/secrets.ts:131-136`

When decryption fails, the function logs and replaces the value with
the empty string. This is intentional (don't expose stale ciphertext;
fail-closed for the dependent feature). Good behavior; left as-is.

### SEC9-3 — Verified-safe: AI gate role bypass

**File:** `src/lib/platform-mode-context.ts:272-295`

The cycle-8 added staff-bypass uses the cached `resolveCapabilities`
lookup against the `submissions.view_all` capability. Capability
strings are sourced from `defaults.ts` and validated via
`isBuiltinRole` semantics. No URL-injectable role path; `userRole`
comes from server-side auth context. Verified safe.

### SEC9-4 — Carry-forward, deferred: plaintext plugin secrets at rest

Operator-directed policy. SEC8b-1 deferred ledger entry remains valid.

### SEC9-5 — Carry-forward: 5-year chat retention

`/privacy` page derives `aiChatLogs` retention from
`DATA_RETENTION_DAYS.chatMessages`, so the user-facing notice already
reads "1825 days". SEC8b-5 is effectively closed by code; recommend
moving from "deferred" to "verified-safe" status with a note that
operator should still send a separate user-comms about the retention
policy change. Confidence on the code fix: HIGH.

## Verdict

No new HIGH or MEDIUM findings. One small dead-code item
(SEC9-1) worth resolving to keep the secrets module lean. SEC9-5
should be reclassified — code already aligned, just policy
communication remains.

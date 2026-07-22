# AI Assistant (chat-widget plugin)

The AI assistant is an optional in-app coding helper that students can open while
working on a problem. It is implemented as the **`chat-widget` plugin**
(`src/lib/plugins/chat-widget/`). When enabled, it renders a chat widget that
can read the current problem, the student's editor code, submission history, and
compile/runtime errors (via bounded tools) and answer as a programming tutor.

This document covers how it is gated, the providers it supports, how an admin
configures it, the live model pickers, and how provider API keys are stored.

---

## Enabling and gating

The assistant is gated by the **`aiAssistantEnabled` system setting**, toggled at
**Settings → General** (`/dashboard/admin/settings`). It defaults to on, but the
platform mode overrides it:

- In **exam**, **contest**, and **recruiting** modes the assistant is **forced
  off by default** (fairness — no unauthorized AI help). This is derived by
  `getEffectiveModeRestrictions` / `isAiAssistantEnabled` in
  `src/lib/system-settings.ts`.
- An admin can opt back in for a restricted mode with the
  **`allowAiAssistantInRestrictedModes`** setting.
- In **homework** mode the assistant follows the plain `aiAssistantEnabled`
  value.

There is also a **per-problem toggle** (`problems.allowAiAssistant`): even when
the assistant is globally enabled, a problem with the per-problem toggle off will
not serve the assistant for that problem. The chat route
(`POST /api/v1/plugins/chat-widget/chat`) enforces both the global context gate
and the per-problem gate before responding.

---

## Providers

The assistant supports four LLM providers (`src/lib/plugins/chat-widget/providers.ts`):

| Provider key | Service | Notes |
|---|---|---|
| `openai` | OpenAI | `https://api.openai.com/v1/chat/completions` |
| `claude` | Anthropic Claude | `https://api.anthropic.com/v1/messages` |
| `gemini` | Google Gemini | `https://generativelanguage.googleapis.com/v1beta/...`, key sent via `x-goog-api-key` header |
| `openrouter` | OpenRouter | OpenAI-wire-compatible, base `https://openrouter.ai/api/v1/chat/completions`, with `HTTP-Referer` / `X-Title` attribution headers |

`openrouter` is OpenAI-wire-compatible: the streaming, tool-call, and tool-result
formats are identical to the OpenAI provider, so its adapter reuses that logic
and changes only the base URL and the two attribution headers. Each provider
supports both streaming chat and tool calling.

Default models: OpenAI `gpt-5-mini`, Claude `claude-sonnet-4-6`, Gemini
`gemini-3.6-flash`, OpenRouter `deepseek/deepseek-v4-flash`
(`src/lib/plugins/chat-widget/schema.ts`).

---

## Admin configuration

Configure the plugin at **`/dashboard/admin/plugins/chat-widget`** (requires the
`system.plugins` capability). Per provider you set:

- the **active provider** (`provider`),
- the **model** for each provider (`openaiModel`, `claudeModel`, `geminiModel`,
  `openrouterModel`),
- the **API key** for each provider (`openaiApiKey`, `claudeApiKey`,
  `geminiApiKey`, `openrouterApiKey`).

Plus assistant-wide settings: `assistantName`, `systemPrompt`, `knowledgeBase`,
`maxTokens`, and `rateLimitPerMinute`.

Use **Test connection** (`POST /api/v1/plugins/chat-widget/test-connection`) to
verify a provider/model against the stored key. The test reads the saved key from
the plugin config — it is never taken from the browser — which both prevents SSRF
via an attacker-supplied key and confirms the real saved configuration.

---

## Live model pickers

For **OpenRouter** and **Gemini** the model field is a live picker backed by
admin-gated endpoints (both require `system.plugins`):

- `GET /api/v1/plugins/chat-widget/openrouter-models` — proxies OpenRouter's
  public `/api/v1/models` catalog (no key needed).
- `GET /api/v1/plugins/chat-widget/gemini-models` — proxies Google's
  `/v1beta/models`, sending the saved Gemini key in the `x-goog-api-key` header
  and filtering to models that support `generateContent`.

Both endpoints:

- **Cache** the catalog in memory for ~1h and degrade gracefully: a slow/failed
  upstream falls back to the stale cache, or to a recommended shortlist when
  there is no cache, so the picker always renders and the admin page never hangs
  or 500s on an upstream hiccup.
- Return a compact per-model shape with a `recommended` flag; the recommended
  ids are shown first in the picker, followed by the full searchable list.

The **recommended shortlist** is hardcoded (ids only — live metadata such as
name/price/context comes from the fetch):

- OpenRouter: `src/lib/plugins/chat-widget/openrouter-models.ts`
  (`RECOMMENDED_OPENROUTER_MODELS`), default `deepseek/deepseek-v4-flash`.
- Gemini: `src/lib/plugins/chat-widget/gemini-models.ts`
  (`RECOMMENDED_GEMINI_MODELS`), default `gemini-3.6-flash`. These are the
  confirmed **fallback list** used when the live fetch cannot run (e.g. no key
  configured, `keyConfigured: false`).

Recommended ids that are missing from the live payload are still included (with
null metadata) so the shortlist is always complete. OpenAI and Claude do not have
live pickers — their model is entered as text.

---

## API key storage (plaintext at rest)

**Chat-widget provider API keys are stored PLAINTEXT at rest** — they are not
encrypted with AES-256-GCM. This is a deliberate, documented product decision
(owner, 2026-07-22; see the module header in
`src/lib/plugins/secrets.ts`). The rationale: the symmetric encryption key would
live on the same host as the database, so at-rest encryption is judged
low-value for this threat model. New writes persist the key verbatim;
`encryptPluginSecret` is intentionally not called on the write path.

What is **retained**:

- **Response redaction** — keys are never echoed back to the browser
  (`redactPluginConfigForRead` blanks them and returns a `<key>Configured`
  boolean instead), and they appear as `[REDACTED]` in audit logs
  (`redactPluginConfigForAudit`).
- **Legacy decryption** — values written before this decision that carry the
  `enc:v1:` prefix are still decrypted on read for backward compatibility.

Honest tradeoff: because the keys are now cleartext in the DB, a **database-only
leak** (a backup / `pg_dump`, a read replica, or SQL injection) exposes the
provider API keys directly, without needing the host's encryption key. See
`docs/threat-model.md` §8.1 / §9.2.

Note that this plaintext decision applies **only** to chat-widget provider keys.
System-settings secrets such as `hcaptchaSecret` and `smtpPass` are unchanged and
remain encrypted at rest.

---

## Troubleshooting

- **Chatbot does not respond / "connection failed".** Check that the selected
  provider has a valid API key saved on the plugin page and run **Test
  connection**. The chat route needs a configured key for the active provider.
- **Assistant is missing entirely.** Confirm `aiAssistantEnabled` is on at
  Settings → General, that the platform mode is not silently forcing it off
  (exam/contest/recruiting force it off unless
  `allowAiAssistantInRestrictedModes` is set), and that the problem's
  per-problem AI toggle is on.
- **Gemini model picker only shows the recommended list.** The live Gemini list
  loads only when a **valid** Gemini API key is saved (the endpoint returns
  `keyConfigured: false` and the fallback shortlist otherwise). Save a valid key,
  then reopen the picker.
- **OpenRouter/Gemini picker shows a "stale"/fallback notice.** The upstream
  catalog fetch failed and the picker degraded to cached or recommended data;
  saving still works, and the list refreshes on the next successful fetch.

# Verifier — RPF Cycle 8 (2026-05-16)

**Date:** 2026-05-16

---

## Verifications against stated user-injected behavior

| User-injected directive | Code change observed | Verdict |
|---|---|---|
| 채팅 플로팅버튼 (admin always sees chat) | `chat-widget-loader.tsx` accepts `userRole`; `(public)/layout.tsx` passes `session.user.role`; `platform-mode-context.ts` short-circuits when `caps.has("submissions.view_all")` | VERIFIED |
| 관리자/강사 비공개 대회 접근 + 재채점 | `(public)/contests/[id]/page.tsx` allows `managing` branch through enrolled-detail; `(public)/submissions/[id]/page.tsx` removes the `assignmentId && visibility !== "public"` guard around `canViewAsInstructor` and now passes real capabilities; `submissions.ts` short-circuits on `submissions.view_all` before the `assignmentId` check | VERIFIED |
| TLE 765ms < 1000ms 오인 fix | `executor.rs` adds `DOCKER_RUN_OVERHEAD_BUDGET_MS = 2_000` and gates TLE on `execution.duration_ms > effective_time_limit_ms`; new `classify_test_case_verdict` helper + 9 unit tests confirm the wall-clock-kill-but-within-limit branch maps to RuntimeError | VERIFIED |
| 전체 제출 검색 라벨 줄바꿈 | `admin/submissions/page.tsx` adds `whitespace-nowrap` to all six labels and `overflow-x-auto`/`md:flex-nowrap`/`md:min-w-max` on the form | VERIFIED |
| Button heights inconsistent | `ui/button.tsx` default size now `h-10`; `lg` is `h-11`; admin settings forms (`allowed-hosts-form`, `config-settings-form`) drop explicit `size="sm"` next to inputs | VERIFIED |
| Code timeline syntax highlighting + progress-bar timeline + anchor jumps | `code-timeline-panel.tsx` HighlightedCode component using highlight.js + sanitizer; `students/[userId]/page.tsx` ParticipantTimelineBar + per-card anchor links to `#submission-<id>` | VERIFIED |
| Locale switcher 잘 안 고정 | `proxy.ts` `hasSessionCookie` toggles off deterministic public locale for authenticated users on SEO pages | VERIFIED |
| AI 어시스턴트 / 자동리뷰 | `chat-widget/chat/route.ts` forwards `userRole` to `isAiAssistantEnabledForContext` | VERIFIED |
| API key plaintext policy | `secrets.ts` `decryptPluginSecret` `allowPlaintext = options?.allowPlaintextFallback ?? true`; `preparePluginConfigForStorage` stores `incomingValue` verbatim | VERIFIED |
| Analytics SQL `ROUND::numeric` fix | `contest-analytics.ts` `ROUND(s.score::numeric, 2) = 100`; `leaderboard.ts` three call sites updated | VERIFIED |

## Schema drift check

`drizzle/` and `src/db/schema.ts` were not modified this cycle. No new
schema drift introduced. The "schema drift on oj/algo/worv" item from the
run context is a deployment-environment check (verify migrations applied
in each env), not a code change — no in-repo verification possible
without DB access.

## Test gates

- `npm run lint` → PASS
- `npm run build` → PASS
- `npm run test:unit` → 317 files, 2410 tests pass
- `cargo test --release` (judge-worker-rs) → 64 tests pass

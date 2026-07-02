# Document-Specialist Inventory

Date: 2026-07-01
Scope: Map documentation claims in AGENTS.md, README.md, SECURITY.md, docs/api.md, docs/deployment.md, docs/languages.md to authoritative source files in /tmp/judgekit-local.

Summary: 109 live `/api/v1` route files; 34 have no matching path in `docs/api.md` using `:param` normalization.

---

## 1. API Endpoint Inventory

Live routes in `src/app/api/v1/**` mapped to `docs/api.md`. Paths are normalized (`[id]` → `:id`) before matching.

| Methods | Route | Source File | docs/api.md lines | Status |
|---|---|---|---|---|
| GET,PATCH,DELETE | `/api/v1/admin/api-keys/[id]` | `src/app/api/v1/admin/api-keys/[id]/route.ts` | 1427,1438 | Documented |
| GET,POST | `/api/v1/admin/api-keys` | `src/app/api/v1/admin/api-keys/route.ts` | 1394,1400,1427 | Documented |
| GET | `/api/v1/admin/audit-logs` | `src/app/api/v1/admin/audit-logs/route.ts` | 1756 | Documented |
| POST | `/api/v1/admin/backup` | `src/app/api/v1/admin/backup/route.ts` | 1801 | Documented |
| GET | `/api/v1/admin/chat-logs` | `src/app/api/v1/admin/chat-logs/route.ts` | 1785 | Documented |
| POST | `/api/v1/admin/docker/images/build` | `src/app/api/v1/admin/docker/images/build/route.ts` | 1702 | Documented |
| POST | `/api/v1/admin/docker/images/prune` | `src/app/api/v1/admin/docker/images/prune/route.ts` | 1715 | Documented |
| GET,POST,DELETE | `/api/v1/admin/docker/images` | `src/app/api/v1/admin/docker/images/route.ts` | 1666,1678,1691 | Documented |
| GET,PATCH | `/api/v1/admin/languages/[language]` | `src/app/api/v1/admin/languages/[language]/route.ts` | 1558,1564 | Documented |
| GET,POST | `/api/v1/admin/languages` | `src/app/api/v1/admin/languages/route.ts` | 1533,1539,1558 | Documented |
| GET | `/api/v1/admin/login-logs` | `src/app/api/v1/admin/login-logs/route.ts` | 1772 | Documented |
| POST | `/api/v1/admin/migrate/export` | `src/app/api/v1/admin/migrate/export/route.ts` | 1856 | Documented |
| POST | `/api/v1/admin/migrate/import` | `src/app/api/v1/admin/migrate/import/route.ts` | 1871 | Documented |
| POST | `/api/v1/admin/migrate/validate` | `src/app/api/v1/admin/migrate/validate/route.ts` | 1832 | Documented |
| GET,PATCH | `/api/v1/admin/plugins/[id]` | `src/app/api/v1/admin/plugins/[id]/route.ts` | 1735,1741 | Documented |
| GET | `/api/v1/admin/plugins` | `src/app/api/v1/admin/plugins/route.ts` | 1729,1735,1741 | Documented |
| POST | `/api/v1/admin/restore` | `src/app/api/v1/admin/restore/route.ts` | 1818 | Documented |
| GET,PATCH,DELETE | `/api/v1/admin/roles/[id]` | `src/app/api/v1/admin/roles/[id]/route.ts` | 1509,1515,1525 | Documented |
| GET,POST | `/api/v1/admin/roles` | `src/app/api/v1/admin/roles/route.ts` | 1484,1490,1509 | Documented |
| GET,PUT | `/api/v1/admin/settings` | `src/app/api/v1/admin/settings/route.ts` | 1446,1452 | Documented |
| GET | `/api/v1/admin/submissions/export` | `src/app/api/v1/admin/submissions/export/route.ts` | — | Missing |
| POST | `/api/v1/admin/submissions/rejudge` | `src/app/api/v1/admin/submissions/rejudge/route.ts` | — | Missing |
| PATCH,DELETE | `/api/v1/admin/tags/[id]` | `src/app/api/v1/admin/tags/[id]/route.ts` | 1605,1611 | Documented |
| GET,POST | `/api/v1/admin/tags` | `src/app/api/v1/admin/tags/route.ts` | 1588,1594,1605 | Documented |
| POST | `/api/v1/admin/test-email` | `src/app/api/v1/admin/test-email/route.ts` | — | Missing |
| PATCH,DELETE | `/api/v1/admin/workers/[id]` | `src/app/api/v1/admin/workers/[id]/route.ts` | 1627,1638 | Documented |
| GET | `/api/v1/admin/workers` | `src/app/api/v1/admin/workers/route.ts` | 1619,1627,1638 | Documented |
| GET | `/api/v1/admin/workers/stats` | `src/app/api/v1/admin/workers/stats/route.ts` | 1644 | Documented |
| POST | `/api/v1/auth/forgot-password` | `src/app/api/v1/auth/forgot-password/route.ts` | — | Missing |
| POST | `/api/v1/auth/resend-verification` | `src/app/api/v1/auth/resend-verification/route.ts` | — | Missing |
| POST | `/api/v1/auth/reset-password` | `src/app/api/v1/auth/reset-password/route.ts` | — | Missing |
| POST | `/api/v1/auth/verify-email` | `src/app/api/v1/auth/verify-email/route.ts` | — | Missing |
| POST | `/api/v1/code-snapshots` | `src/app/api/v1/code-snapshots/route.ts` | — | Missing |
| DELETE | `/api/v1/community/posts/[id]` | `src/app/api/v1/community/posts/[id]/route.ts` | — | Missing |
| POST | `/api/v1/community/threads/[id]/posts` | `src/app/api/v1/community/threads/[id]/posts/route.ts` | — | Missing |
| PATCH,DELETE | `/api/v1/community/threads/[id]` | `src/app/api/v1/community/threads/[id]/route.ts` | — | Missing |
| POST | `/api/v1/community/threads` | `src/app/api/v1/community/threads/route.ts` | — | Missing |
| POST | `/api/v1/community/votes` | `src/app/api/v1/community/votes/route.ts` | — | Missing |
| POST | `/api/v1/compiler/run` | `src/app/api/v1/compiler/run/route.ts` | 1271 | Documented |
| GET,POST,DELETE | `/api/v1/contests/[assignmentId]/access-code` | `src/app/api/v1/contests/[assignmentId]/access-code/route.ts` | 1050,1056,1062 | Documented |
| GET | `/api/v1/contests/[assignmentId]/analytics` | `src/app/api/v1/contests/[assignmentId]/analytics/route.ts` | 990 | Documented |
| PATCH,DELETE | `/api/v1/contests/[assignmentId]/announcements/[announcementId]` | `src/app/api/v1/contests/[assignmentId]/announcements/[announcementId]/route.ts` | — | Missing |
| GET,POST | `/api/v1/contests/[assignmentId]/announcements` | `src/app/api/v1/contests/[assignmentId]/announcements/route.ts` | — | Missing |
| POST,GET | `/api/v1/contests/[assignmentId]/anti-cheat` | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` | 1008,1029 | Documented |
| PATCH,DELETE | `/api/v1/contests/[assignmentId]/clarifications/[clarificationId]` | `src/app/api/v1/contests/[assignmentId]/clarifications/[clarificationId]/route.ts` | — | Missing |
| GET,POST | `/api/v1/contests/[assignmentId]/clarifications` | `src/app/api/v1/contests/[assignmentId]/clarifications/route.ts` | — | Missing |
| GET | `/api/v1/contests/[assignmentId]/code-snapshots/[userId]` | `src/app/api/v1/contests/[assignmentId]/code-snapshots/[userId]/route.ts` | — | Missing |
| GET | `/api/v1/contests/[assignmentId]/export` | `src/app/api/v1/contests/[assignmentId]/export/route.ts` | 996 | Documented |
| GET,POST | `/api/v1/contests/[assignmentId]/invite` | `src/app/api/v1/contests/[assignmentId]/invite/route.ts` | 1068,1078 | Documented |
| GET | `/api/v1/contests/[assignmentId]/leaderboard` | `src/app/api/v1/contests/[assignmentId]/leaderboard/route.ts` | 957 | Documented |
| GET | `/api/v1/contests/[assignmentId]/participant-timeline/[userId]` | `src/app/api/v1/contests/[assignmentId]/participant-timeline/[userId]/route.ts` | — | Missing |
| GET | `/api/v1/contests/[assignmentId]/participants` | `src/app/api/v1/contests/[assignmentId]/participants/route.ts` | — | Missing |
| GET,PATCH,DELETE | `/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]` | `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts` | — | Missing |
| POST | `/api/v1/contests/[assignmentId]/recruiting-invitations/bulk` | `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/bulk/route.ts` | — | Missing |
| GET,POST | `/api/v1/contests/[assignmentId]/recruiting-invitations` | `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/route.ts` | — | Missing |
| GET | `/api/v1/contests/[assignmentId]/recruiting-invitations/stats` | `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/stats/route.ts` | — | Missing |
| POST | `/api/v1/contests/[assignmentId]/similarity-check` | `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts` | 1089 | Documented |
| GET | `/api/v1/contests/[assignmentId]/stats` | `src/app/api/v1/contests/[assignmentId]/stats/route.ts` | — | Missing |
| POST | `/api/v1/contests/join` | `src/app/api/v1/contests/join/route.ts` | 941 | Documented |
| POST | `/api/v1/contests/quick-create` | `src/app/api/v1/contests/quick-create/route.ts` | — | Missing |
| GET,DELETE | `/api/v1/files/[id]` | `src/app/api/v1/files/[id]/route.ts` | 1200,1211 | Documented |
| POST | `/api/v1/files/bulk-delete` | `src/app/api/v1/files/bulk-delete/route.ts` | 1217 | Documented |
| POST,GET | `/api/v1/files` | `src/app/api/v1/files/route.ts` | 1158,1172,1185 | Documented |
| POST,GET | `/api/v1/groups/[id]/assignments/[assignmentId]/exam-session` | `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-session/route.ts` | 877,888,894 | Documented |
| PATCH | `/api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]` | `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/[userId]/route.ts` | — | Missing |
| GET | `/api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions` | `src/app/api/v1/groups/[id]/assignments/[assignmentId]/exam-sessions/route.ts` | 894 | Documented |
| GET | `/api/v1/groups/[id]/assignments/[assignmentId]/export` | `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts` | 867 | Documented |
| POST,GET,DELETE | `/api/v1/groups/[id]/assignments/[assignmentId]/overrides` | `src/app/api/v1/groups/[id]/assignments/[assignmentId]/overrides/route.ts` | 902,908,928 | Documented |
| GET,PATCH,DELETE | `/api/v1/groups/[id]/assignments/[assignmentId]` | `src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts` | 847,853,861 | Documented |
| GET,POST | `/api/v1/groups/[id]/assignments` | `src/app/api/v1/groups/[id]/assignments/route.ts` | 818,824,847 | Documented |
| GET,POST,DELETE | `/api/v1/groups/[id]/instructors` | `src/app/api/v1/groups/[id]/instructors/route.ts` | 773,782,804 | Documented |
| DELETE | `/api/v1/groups/[id]/members/[userId]` | `src/app/api/v1/groups/[id]/members/[userId]/route.ts` | 735 | Documented |
| POST | `/api/v1/groups/[id]/members/bulk` | `src/app/api/v1/groups/[id]/members/bulk/route.ts` | 741 | Documented |
| GET,POST | `/api/v1/groups/[id]/members` | `src/app/api/v1/groups/[id]/members/route.ts` | 716,722,735 | Documented |
| GET,PATCH,DELETE | `/api/v1/groups/[id]` | `src/app/api/v1/groups/[id]/route.ts` | 689,695,706 | Documented |
| GET,POST | `/api/v1/groups` | `src/app/api/v1/groups/route.ts` | 660,676,689 | Documented |
| GET | `/api/v1/health` | `src/app/api/v1/health/route.ts` | — | Missing |
| POST | `/api/v1/judge/claim` | `src/app/api/v1/judge/claim/route.ts` | 1344 | Documented |
| POST | `/api/v1/judge/deregister` | `src/app/api/v1/judge/deregister/route.ts` | 1386 | Documented |
| POST | `/api/v1/judge/heartbeat` | `src/app/api/v1/judge/heartbeat/route.ts` | 1327 | Documented |
| POST | `/api/v1/judge/poll` | `src/app/api/v1/judge/poll/route.ts` | 1367 | Documented |
| POST | `/api/v1/judge/register` | `src/app/api/v1/judge/register/route.ts` | 1301 | Documented |
| GET | `/api/v1/languages` | `src/app/api/v1/languages/route.ts` | 1235 | Documented |
| POST | `/api/v1/playground/run` | `src/app/api/v1/playground/run/route.ts` | — | Missing |
| POST | `/api/v1/plugins/chat-widget/chat` | `src/app/api/v1/plugins/chat-widget/chat/route.ts` | 1891 | Documented |
| POST | `/api/v1/plugins/chat-widget/test-connection` | `src/app/api/v1/plugins/chat-widget/test-connection/route.ts` | 1918 | Documented |
| POST,DELETE | `/api/v1/problem-sets/[id]/groups` | `src/app/api/v1/problem-sets/[id]/groups/route.ts` | 1134,1145 | Documented |
| GET,PATCH,DELETE | `/api/v1/problem-sets/[id]` | `src/app/api/v1/problem-sets/[id]/route.ts` | 1116,1122,1128 | Documented |
| GET,POST | `/api/v1/problem-sets` | `src/app/api/v1/problem-sets/route.ts` | 1104,1110,1116 | Documented |
| GET | `/api/v1/problems/[id]/accepted-solutions` | `src/app/api/v1/problems/[id]/accepted-solutions/route.ts` | — | Missing |
| POST | `/api/v1/problems/[id]/compute-expected` | `src/app/api/v1/problems/[id]/compute-expected/route.ts` | 495,514 | Documented |
| GET,PUT,DELETE | `/api/v1/problems/[id]/draft` | `src/app/api/v1/problems/[id]/draft/route.ts` | — | Missing |
| GET | `/api/v1/problems/[id]/export` | `src/app/api/v1/problems/[id]/export/route.ts` | 562 | Documented |
| GET,PATCH,DELETE | `/api/v1/problems/[id]` | `src/app/api/v1/problems/[id]/route.ts` | 495,514,522 | Documented |
| POST | `/api/v1/problems/import` | `src/app/api/v1/problems/import/route.ts` | — | Missing |
| GET,POST | `/api/v1/problems` | `src/app/api/v1/problems/route.ts` | 65,73,366 | Documented |
| POST | `/api/v1/recruiting/validate` | `src/app/api/v1/recruiting/validate/route.ts` | — | Missing |
| GET,POST | `/api/v1/submissions/[id]/comments` | `src/app/api/v1/submissions/[id]/comments/route.ts` | 622,628 | Documented |
| GET | `/api/v1/submissions/[id]/events` | `src/app/api/v1/submissions/[id]/events/route.ts` | 641 | Documented |
| GET | `/api/v1/submissions/[id]/queue-status` | `src/app/api/v1/submissions/[id]/queue-status/route.ts` | — | Missing |
| POST | `/api/v1/submissions/[id]/rejudge` | `src/app/api/v1/submissions/[id]/rejudge/route.ts` | 614 | Documented |
| GET | `/api/v1/submissions/[id]` | `src/app/api/v1/submissions/[id]/route.ts` | 608,614,622 | Documented |
| GET,POST | `/api/v1/submissions` | `src/app/api/v1/submissions/route.ts` | 572,590,608 | Documented |
| GET | `/api/v1/tags` | `src/app/api/v1/tags/route.ts` | 1258 | Documented |
| POST | `/api/v1/test/seed` | `src/app/api/v1/test/seed/route.ts` | 1948 | Documented |
| GET | `/api/v1/time` | `src/app/api/v1/time/route.ts` | 219 | Documented |
| GET,PATCH,DELETE | `/api/v1/users/[id]` | `src/app/api/v1/users/[id]/route.ts` | 291,299,321 | Documented |
| POST | `/api/v1/users/bulk` | `src/app/api/v1/users/bulk/route.ts` | 335 | Documented |
| GET,POST | `/api/v1/users` | `src/app/api/v1/users/route.ts` | 232,265,291 | Documented |

## 2. Language Inventory

Active `Language` union members mapped to docs, Dockerfiles, and presets.

| Language | TS Union | docs/languages.md | AGENTS.md | languages.ts image | Dockerfile | Worker enum | deploy all | setup all | ARM-prohibitive | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| `ada` | Yes | 50 | 49 | `judge-ada:latest` | `docker/Dockerfile.judge-ada` | Yes | Yes | Yes | No | — |
| `aheui` | Yes | 63 | 66 | `judge-esoteric:latest` | `docker/Dockerfile.judge-esoteric` | Yes | No | No | No | — |
| `algol68` | Yes | 80 | 76 | `judge-algol68:latest` | `docker/Dockerfile.judge-algol68` | Yes | Yes | Yes | No | — |
| `apl` | Yes | 68 | 70 | `judge-apl:latest` | `docker/Dockerfile.judge-apl` | Yes | Yes | Yes | No | — |
| `arturo` | Yes | 96 | 112 | `judge-arturo:latest` | `docker/Dockerfile.judge-arturo` | Yes | Yes | Yes | No | — |
| `awk` | Yes | 54 | 53 | `judge-awk:latest` | `docker/Dockerfile.judge-awk` | Yes | Yes | Yes | No | — |
| `b` | Yes | 66 | 69 | `judge-b:latest` | `docker/Dockerfile.judge-b` | Yes | Yes | Yes | No | — |
| `bash` | Yes | 47 | 46 | `judge-bash:latest` | `docker/Dockerfile.judge-bash` | Yes | Yes | Yes | No | — |
| `befunge` | Yes | 62 | 65 | `judge-esoteric:latest` | `docker/Dockerfile.judge-esoteric` | Yes | No | No | No | — |
| `bqn` | Yes | 78 | 73 | `judge-bqn:latest` | `docker/Dockerfile.judge-bqn` | Yes | Yes | Yes | No | — |
| `brainfuck` | Yes | 61 | 64 | `judge-brainfuck:latest` | `docker/Dockerfile.judge-brainfuck` | Yes | Yes | Yes | No | — |
| `bun_js` | Yes | 87 | 83 | `judge-bun:latest` | `docker/Dockerfile.judge-bun` | Yes | No | No | No | — |
| `bun_ts` | Yes | 88 | 84 | `judge-bun:latest` | `docker/Dockerfile.judge-bun` | Yes | No | No | No | — |
| `c17` | Yes | 3 | 3 | `judge-cpp:latest` | `docker/Dockerfile.judge-cpp` | Yes | No | No | No | — |
| `c23` | Yes | 4 | 4 | `judge-cpp:latest` | `docker/Dockerfile.judge-cpp` | Yes | No | No | No | — |
| `c3` | Yes | 98 | 104 | `judge-c3:latest` | `docker/Dockerfile.judge-c3` | Yes | Yes | Yes | No | — |
| `c89` | Yes | 1 | 1 | `judge-cpp:latest` | `docker/Dockerfile.judge-cpp` | Yes | No | No | No | — |
| `c99` | Yes | 2 | 2 | `judge-cpp:latest` | `docker/Dockerfile.judge-cpp` | Yes | No | No | No | — |
| `carp` | Yes | 114 | 93 | `judge-carp:latest` | `docker/Dockerfile.judge-carp` | Yes | No | Yes | Yes | — |
| `chapel` | Yes | 118 | 115 | `judge-chapel:latest` | `docker/Dockerfile.judge-chapel` | Yes | No | Yes | Yes | — |
| `clang_c23` | Yes | 8 | 7 | `judge-clang:latest` | `docker/Dockerfile.judge-clang` | Yes | No | No | No | — |
| `clang_cpp23` | Yes | 9 | 8 | `judge-clang:latest` | `docker/Dockerfile.judge-clang` | Yes | No | No | No | — |
| `clang_cpp26` | Yes | 10 | — | `judge-clang:latest` | `docker/Dockerfile.judge-clang` | Yes | No | No | No | missing from AGENTS.md |
| `clean` | Yes | 113 | 89 | `judge-clean:latest` | `docker/Dockerfile.judge-clean` | Yes | No | Yes | Yes | — |
| `clojure` | Yes | 51 | 50 | `judge-clojure:latest` | `docker/Dockerfile.judge-clojure` | Yes | Yes | Yes | No | — |
| `cobol` | Yes | 43 | 42 | `judge-cobol:latest` | `docker/Dockerfile.judge-cobol` | Yes | Yes | Yes | No | — |
| `coffeescript` | Yes | 18 | 15 | `judge-node:latest` | `docker/Dockerfile.judge-node` | Yes | No | No | No | — |
| `commonlisp` | Yes | 46 | 45 | `judge-commonlisp:latest` | `docker/Dockerfile.judge-commonlisp` | Yes | Yes | Yes | No | — |
| `cpp20` | Yes | 5 | 5 | `judge-cpp:latest` | `docker/Dockerfile.judge-cpp` | Yes | No | No | No | — |
| `cpp23` | Yes | 6 | 6 | `judge-cpp:latest` | `docker/Dockerfile.judge-cpp` | Yes | No | No | No | — |
| `cpp26` | Yes | 7 | — | `judge-cpp:latest` | `docker/Dockerfile.judge-cpp` | Yes | No | No | No | missing from AGENTS.md |
| `crystal` | Yes | 58 | 58 | `judge-crystal:latest` | `docker/Dockerfile.judge-crystal` | Yes | Yes | Yes | No | — |
| `csharp` | Yes | 22 | 20 | `judge-csharp:latest` | `docker/Dockerfile.judge-csharp` | Yes | Yes | Yes | No | — |
| `curry` | Yes | 112 | 90 | `judge-curry:latest` | `docker/Dockerfile.judge-curry` | Yes | No | Yes | Yes | — |
| `d` | Yes | 37 | 35 | `judge-d:latest` | `docker/Dockerfile.judge-d` | Yes | Yes | Yes | No | — |
| `dart` | Yes | 31 | 29 | `judge-dart:latest` | `docker/Dockerfile.judge-dart` | Yes | Yes | Yes | No | — |
| `dc` | Yes | 49 | 48 | `judge-bash:latest` | `docker/Dockerfile.judge-bash` | Yes | No | No | No | — |
| `delphi` | Yes | 42 | 40 | `judge-pascal:latest` | `docker/Dockerfile.judge-pascal` | Yes | No | No | No | — |
| `deno_js` | Yes | 85 | 81 | `judge-deno:latest` | `docker/Dockerfile.judge-deno` | Yes | No | No | No | — |
| `deno_ts` | Yes | 86 | 82 | `judge-deno:latest` | `docker/Dockerfile.judge-deno` | Yes | No | No | No | — |
| `elixir` | Yes | 35 | 33 | `judge-elixir:latest` | `docker/Dockerfile.judge-elixir` | Yes | Yes | Yes | No | — |
| `elm` | Yes | 121 | 116 | `judge-elm:latest` | `docker/Dockerfile.judge-elm` | Yes | No | Yes | Yes | — |
| `erlang` | Yes | 45 | 44 | `judge-erlang:latest` | `docker/Dockerfile.judge-erlang` | Yes | Yes | Yes | No | — |
| `factor` | Yes | 109 | 99 | `judge-factor:latest` | `docker/Dockerfile.judge-factor` | Yes | No | Yes | Yes | — |
| `fennel` | Yes | 91 | 87 | `judge-lua:latest` | `docker/Dockerfile.judge-lua` | Yes | No | No | No | — |
| `flix` | Yes | 67 | 88 | `judge-flix:latest` | `docker/Dockerfile.judge-flix` | Yes | No | Yes | Yes | doc image mismatch code |
| `forth` | Yes | 73 | 63 | `judge-forth:latest` | `docker/Dockerfile.judge-forth` | Yes | Yes | Yes | No | — |
| `fortran` | Yes | 40 | 38 | `judge-fortran:latest` | `docker/Dockerfile.judge-fortran` | Yes | Yes | Yes | No | — |
| `freebasic` | Yes | 69 | 71 | `judge-freebasic:latest` | `docker/Dockerfile.judge-freebasic` | Yes | Yes | Yes | No | — |
| `fsharp` | Yes | 23 | 21 | `judge-fsharp:latest` | `docker/Dockerfile.judge-fsharp` | Yes | Yes | Yes | No | — |
| `gleam` | Yes | 89 | 85 | `judge-gleam:latest` | `docker/Dockerfile.judge-gleam` | Yes | Yes | Yes | No | — |
| `go` | Yes | 20 | 17 | `judge-go:latest` | `docker/Dockerfile.judge-go` | Yes | Yes | Yes | No | — |
| `grain` | Yes | 115 | 95 | `judge-grain:latest` | `docker/Dockerfile.judge-grain` | Yes | No | Yes | Yes | — |
| `groovy` | Yes | 56 | 56 | `judge-groovy:latest` | `docker/Dockerfile.judge-groovy` | Yes | Yes | Yes | No | — |
| `hare` | Yes | 101 | 105 | `judge-hare:latest` | `docker/Dockerfile.judge-hare` | Yes | Yes | Yes | No | — |
| `haskell` | Yes | 30 | 28 | `judge-haskell:latest` | `docker/Dockerfile.judge-haskell` | Yes | Yes | Yes | No | — |
| `haxe` | Yes | 75 | 61 | `judge-haxe:latest` | `docker/Dockerfile.judge-haxe` | Yes | Yes | Yes | No | — |
| `hy` | Yes | 95 | 106 | `judge-hy:latest` | `docker/Dockerfile.judge-hy` | Yes | Yes | Yes | No | — |
| `hyeong` | Yes | 64 | 67 | `judge-esoteric:latest` | `docker/Dockerfile.judge-esoteric` | Yes | No | No | No | — |
| `icon` | Yes | 79 | 75 | `judge-icon:latest` | `docker/Dockerfile.judge-icon` | Yes | Yes | Yes | No | — |
| `idris2` | Yes | 119 | 117 | `judge-idris2:latest` | `docker/Dockerfile.judge-idris2` | Yes | No | Yes | Yes | — |
| `janet` | Yes | 97 | 107 | `judge-janet:latest` | `docker/Dockerfile.judge-janet` | Yes | Yes | Yes | No | — |
| `java` | Yes | 12 | 10 | `judge-jvm:latest` | `docker/Dockerfile.judge-jvm` | Yes | No | No | No | — |
| `javascript` | Yes | 16 | 13 | `judge-node:latest` | `docker/Dockerfile.judge-node` | Yes | No | No | No | — |
| `julia` | Yes | 36 | 34 | `judge-julia:latest` | `docker/Dockerfile.judge-julia` | Yes | Yes | Yes | No | — |
| `koka` | Yes | 102 | 108 | `judge-koka:latest` | `docker/Dockerfile.judge-koka` | Yes | Yes | Yes | No | — |
| `kotlin` | Yes | 13 | 11 | `judge-jvm:latest` | `docker/Dockerfile.judge-jvm` | Yes | No | No | No | — |
| `lean` | Yes | 103 | 103 | `judge-lean:latest` | `docker/Dockerfile.judge-lean` | Yes | Yes | Yes | No | — |
| `llvm_ir` | Yes | 11 | 9 | `judge-clang:latest` | `docker/Dockerfile.judge-clang` | Yes | No | No | No | — |
| `lolcode` | Yes | 82 | 78 | `judge-lolcode:latest` | `docker/Dockerfile.judge-lolcode` | Yes | Yes | Yes | No | — |
| `lua` | Yes | 29 | 27 | `judge-lua:latest` | `docker/Dockerfile.judge-lua` | Yes | Yes | Yes | No | — |
| `mercury` | Yes | 105 | 92 | `judge-mercury:latest` | `docker/Dockerfile.judge-mercury` | Yes | No | Yes | Yes | — |
| `micropython` | Yes | 92 | 109 | `judge-micropython:latest` | `docker/Dockerfile.judge-micropython` | Yes | Yes | Yes | No | — |
| `minizinc` | Yes | 111 | 100 | `judge-minizinc:latest` | `docker/Dockerfile.judge-minizinc` | Yes | No | Yes | Yes | — |
| `modula2` | Yes | 108 | 98 | `judge-modula2:latest` | `docker/Dockerfile.judge-modula2` | Yes | No | Yes | Yes | — |
| `moonbit` | Yes | 117 | 118 | `judge-moonbit:latest` | `docker/Dockerfile.judge-moonbit` | Yes | No | Yes | Yes | — |
| `nasm` | Yes | 71 | 41 | `judge-nasm:latest` | `docker/Dockerfile.judge-nasm` | Yes | Yes | Yes | No | — |
| `nelua` | Yes | 100 | 110 | `judge-nelua:latest` | `docker/Dockerfile.judge-nelua` | Yes | Yes | Yes | No | — |
| `nim` | Yes | 33 | 31 | `judge-nim:latest` | `docker/Dockerfile.judge-nim` | Yes | Yes | Yes | No | — |
| `objective_c` | Yes | 72 | 19 | `judge-objective-c:latest` | `docker/Dockerfile.judge-objective-c` | Yes | No | No | No | — |
| `ocaml` | Yes | 34 | 32 | `judge-ocaml:latest` | `docker/Dockerfile.judge-ocaml` | Yes | Yes | Yes | No | — |
| `octave` | Yes | 57 | 57 | `judge-octave:latest` | `docker/Dockerfile.judge-octave` | Yes | Yes | Yes | No | — |
| `odin` | Yes | 76 | 62 | `judge-odin:latest` | `docker/Dockerfile.judge-odin` | Yes | Yes | Yes | No | — |
| `pascal` | Yes | 41 | 39 | `judge-pascal:latest` | `docker/Dockerfile.judge-pascal` | Yes | Yes | Yes | No | — |
| `perl` | Yes | 26 | 24 | `judge-perl:latest` | `docker/Dockerfile.judge-perl` | Yes | Yes | Yes | No | — |
| `php` | Yes | 27 | 25 | `judge-php:latest` | `docker/Dockerfile.judge-php` | Yes | Yes | Yes | No | — |
| `picat` | Yes | 104 | 97 | `judge-picat:latest` | `docker/Dockerfile.judge-picat` | Yes | Yes | Yes | No | — |
| `plaintext` | Yes | 122 | 120 | `judge-node:latest` | `docker/Dockerfile.judge-node` | Yes | No | No | No | — |
| `pony` | Yes | 116 | 96 | `judge-pony:latest` | `docker/Dockerfile.judge-pony` | Yes | No | Yes | Yes | — |
| `postscript` | Yes | 60 | 60 | `judge-postscript:latest` | `docker/Dockerfile.judge-postscript` | Yes | Yes | Yes | No | — |
| `powershell` | Yes | 59 | 59 | `judge-powershell:latest` | `docker/Dockerfile.judge-powershell` | Yes | Yes | Yes | No | — |
| `prolog` | Yes | 52 | 51 | `judge-prolog:latest` | `docker/Dockerfile.judge-prolog` | Yes | Yes | Yes | No | — |
| `purescript` | Yes | 107 | 91 | `judge-purescript:latest` | `docker/Dockerfile.judge-purescript` | Yes | No | Yes | Yes | — |
| `pypy` | Yes | 15 | 124 | `judge-pypy:latest` | `docker/Dockerfile.judge-pypy` | Yes | Yes | Yes | No | — |
| `python` | Yes | 14 | 12 | `judge-python:latest` | `docker/Dockerfile.judge-python` | Yes | Yes | Yes | No | — |
| `r` | Yes | 25 | 23 | `judge-r:latest` | `docker/Dockerfile.judge-r` | Yes | Yes | Yes | No | — |
| `racket` | Yes | 38 | 36 | `judge-racket:latest` | `docker/Dockerfile.judge-racket` | Yes | Yes | Yes | No | — |
| `raku` | Yes | 74 | 55 | `judge-raku:latest` | `docker/Dockerfile.judge-raku` | Yes | Yes | Yes | No | — |
| `rescript` | Yes | 120 | 119 | `judge-rescript:latest` | `docker/Dockerfile.judge-rescript` | Yes | No | Yes | Yes | — |
| `rexx` | Yes | 94 | 111 | `judge-rexx:latest` | `docker/Dockerfile.judge-rexx` | Yes | Yes | Yes | No | — |
| `ruby` | Yes | 28 | 26 | `judge-ruby:latest` | `docker/Dockerfile.judge-ruby` | Yes | Yes | Yes | No | — |
| `rust` | Yes | 19 | 16 | `judge-rust:latest` | `docker/Dockerfile.judge-rust` | Yes | Yes | Yes | No | — |
| `scala` | Yes | 44 | 43 | `judge-scala:latest` | `docker/Dockerfile.judge-scala` | Yes | Yes | Yes | No | — |
| `scheme` | Yes | 55 | 54 | `judge-scheme:latest` | `docker/Dockerfile.judge-scheme` | Yes | Yes | Yes | No | — |
| `sed` | Yes | 48 | 47 | `judge-bash:latest` | `docker/Dockerfile.judge-bash` | Yes | No | No | No | — |
| `shakespeare` | Yes | 83 | 79 | `judge-shakespeare:latest` | `docker/Dockerfile.judge-shakespeare` | Yes | Yes | Yes | No | — |
| `smalltalk` | Yes | 70 | 72 | `judge-smalltalk:latest` | `docker/Dockerfile.judge-smalltalk` | Yes | Yes | Yes | No | — |
| `sml` | Yes | 90 | 86 | `judge-sml:latest` | `docker/Dockerfile.judge-sml` | Yes | Yes | Yes | No | — |
| `snobol4` | Yes | 81 | 77 | `judge-snobol4:latest` | `docker/Dockerfile.judge-snobol4` | Yes | Yes | Yes | No | — |
| `spark` | Yes | 110 | 102 | `judge-ada:latest` | `docker/Dockerfile.judge-ada` | Yes | No | No | No | — |
| `squirrel` | Yes | 93 | 113 | `judge-squirrel:latest` | `docker/Dockerfile.judge-squirrel` | Yes | Yes | Yes | No | — |
| `swift` | Yes | 21 | 18 | `judge-swift:latest` | `docker/Dockerfile.judge-swift` | Yes | Yes | Yes | No | — |
| `systemverilog` | Yes | 124 | 122 | `judge-node:latest` | `docker/Dockerfile.judge-node` | Yes | No | No | No | — |
| `tcl` | Yes | 53 | 52 | `judge-tcl:latest` | `docker/Dockerfile.judge-tcl` | Yes | Yes | Yes | No | — |
| `typescript` | Yes | 17 | 14 | `judge-node:latest` | `docker/Dockerfile.judge-node` | Yes | No | No | No | — |
| `uiua` | Yes | 77 | 74 | `judge-uiua:latest` | `docker/Dockerfile.judge-uiua` | Yes | Yes | Yes | No | — |
| `umjunsik` | Yes | 84 | 80 | `judge-umjunsik:latest` | `docker/Dockerfile.judge-umjunsik` | Yes | Yes | Yes | No | — |
| `vala` | Yes | 99 | 114 | `judge-vala:latest` | `docker/Dockerfile.judge-vala` | Yes | Yes | Yes | No | — |
| `vbnet` | Yes | 24 | 22 | `judge-fsharp:latest` | `docker/Dockerfile.judge-fsharp` | Yes | No | No | No | — |
| `verilog` | Yes | 123 | 121 | `judge-node:latest` | `docker/Dockerfile.judge-node` | Yes | No | No | No | — |
| `vhdl` | Yes | 125 | 123 | `judge-node:latest` | `docker/Dockerfile.judge-node` | Yes | No | No | No | — |
| `vlang` | Yes | 39 | 37 | `judge-v:latest` | `docker/Dockerfile.judge-v` | Yes | No | No | No | — |
| `wat` | Yes | 106 | 101 | `judge-wat:latest` | `docker/Dockerfile.judge-wat` | Yes | No | Yes | Yes | — |
| `whitespace` | Yes | 65 | 68 | `judge-esoteric:latest` | `docker/Dockerfile.judge-esoteric` | Yes | No | No | No | — |
| `zig` | Yes | 32 | 30 | `judge-zig:latest` | `docker/Dockerfile.judge-zig` | Yes | Yes | Yes | No | — |

## 3. Docker Image Inventory

Each `docker/Dockerfile.*` mapped to the language(s) that reference it.

| Docker Image | Dockerfile | Languages using it | docs/languages.md rows | AGENTS.md rows |
|---|---|---|---|---|
| `judge-ada` | `docker/Dockerfile.judge-ada` | `ada`, `spark` | 50, 110 | 49, 102 |
| `judge-algol68` | `docker/Dockerfile.judge-algol68` | `algol68` | 80 | 76 |
| `judge-apl` | `docker/Dockerfile.judge-apl` | `apl` | 68 | 70 |
| `judge-arturo` | `docker/Dockerfile.judge-arturo` | `arturo` | 96 | 112 |
| `judge-awk` | `docker/Dockerfile.judge-awk` | `awk` | 54 | 53 |
| `judge-b` | `docker/Dockerfile.judge-b` | `b` | 66 | 69 |
| `judge-bash` | `docker/Dockerfile.judge-bash` | `bash`, `sed`, `dc` | 47, 48, 49 | 46, 47, 48 |
| `judge-bqn` | `docker/Dockerfile.judge-bqn` | `bqn` | 78 | 73 |
| `judge-brainfuck` | `docker/Dockerfile.judge-brainfuck` | `brainfuck` | 61 | 64 |
| `judge-bun` | `docker/Dockerfile.judge-bun` | `bun_js`, `bun_ts` | 87, 88 | 83, 84 |
| `judge-c3` | `docker/Dockerfile.judge-c3` | `c3` | 98 | 104 |
| `judge-carp` | `docker/Dockerfile.judge-carp` | `carp` | 114 | 93 |
| `judge-chapel` | `docker/Dockerfile.judge-chapel` | `chapel` | 118 | 115 |
| `judge-clang` | `docker/Dockerfile.judge-clang` | `clang_c23`, `clang_cpp23`, `clang_cpp26`, `llvm_ir` | 8, 9, 10, 11 | 7, 8, 9 |
| `judge-clean` | `docker/Dockerfile.judge-clean` | `clean` | 113 | 89 |
| `judge-clojure` | `docker/Dockerfile.judge-clojure` | `clojure` | 51 | 50 |
| `judge-cobol` | `docker/Dockerfile.judge-cobol` | `cobol` | 43 | 42 |
| `judge-commonlisp` | `docker/Dockerfile.judge-commonlisp` | `commonlisp` | 46 | 45 |
| `judge-cpp` | `docker/Dockerfile.judge-cpp` | `c17`, `c23`, `cpp20`, `cpp23`, `cpp26`, `c99`, `c89` | 3, 4, 5, 6, 7, 2, 1 | 3, 4, 5, 6, 2, 1 |
| `judge-crystal` | `docker/Dockerfile.judge-crystal` | `crystal` | 58 | 58 |
| `judge-csharp` | `docker/Dockerfile.judge-csharp` | `csharp` | 22 | 20 |
| `judge-curry` | `docker/Dockerfile.judge-curry` | `curry` | 112 | 90 |
| `judge-d` | `docker/Dockerfile.judge-d` | `d` | 37 | 35 |
| `judge-dart` | `docker/Dockerfile.judge-dart` | `dart` | 31 | 29 |
| `judge-deno` | `docker/Dockerfile.judge-deno` | `deno_js`, `deno_ts` | 85, 86 | 81, 82 |
| `judge-elixir` | `docker/Dockerfile.judge-elixir` | `elixir` | 35 | 33 |
| `judge-elm` | `docker/Dockerfile.judge-elm` | `elm` | 121 | 116 |
| `judge-erlang` | `docker/Dockerfile.judge-erlang` | `erlang` | 45 | 44 |
| `judge-esoteric` | `docker/Dockerfile.judge-esoteric` | `befunge`, `aheui`, `hyeong`, `whitespace` | 62, 63, 64, 65 | 65, 66, 67, 68 |
| `judge-factor` | `docker/Dockerfile.judge-factor` | `factor` | 109 | 99 |
| `judge-flix` | `docker/Dockerfile.judge-flix` | `flix` | 67 | 88 |
| `judge-forth` | `docker/Dockerfile.judge-forth` | `forth` | 73 | 63 |
| `judge-fortran` | `docker/Dockerfile.judge-fortran` | `fortran` | 40 | 38 |
| `judge-freebasic` | `docker/Dockerfile.judge-freebasic` | `freebasic` | 69 | 71 |
| `judge-fsharp` | `docker/Dockerfile.judge-fsharp` | `fsharp`, `vbnet` | 23, 24 | 21, 22 |
| `judge-gleam` | `docker/Dockerfile.judge-gleam` | `gleam` | 89 | 85 |
| `judge-go` | `docker/Dockerfile.judge-go` | `go` | 20 | 17 |
| `judge-grain` | `docker/Dockerfile.judge-grain` | `grain` | 115 | 95 |
| `judge-groovy` | `docker/Dockerfile.judge-groovy` | `groovy` | 56 | 56 |
| `judge-hare` | `docker/Dockerfile.judge-hare` | `hare` | 101 | 105 |
| `judge-haskell` | `docker/Dockerfile.judge-haskell` | `haskell` | 30 | 28 |
| `judge-haxe` | `docker/Dockerfile.judge-haxe` | `haxe` | 75 | 61 |
| `judge-hy` | `docker/Dockerfile.judge-hy` | `hy` | 95 | 106 |
| `judge-icon` | `docker/Dockerfile.judge-icon` | `icon` | 79 | 75 |
| `judge-idris2` | `docker/Dockerfile.judge-idris2` | `idris2` | 119 | 117 |
| `judge-j` | `docker/Dockerfile.judge-j` | — | — | — |
| `judge-janet` | `docker/Dockerfile.judge-janet` | `janet` | 97 | 107 |
| `judge-julia` | `docker/Dockerfile.judge-julia` | `julia` | 36 | 34 |
| `judge-jvm` | `docker/Dockerfile.judge-jvm` | `java`, `kotlin` | 12, 13 | 10, 11 |
| `judge-koka` | `docker/Dockerfile.judge-koka` | `koka` | 102 | 108 |
| `judge-lean` | `docker/Dockerfile.judge-lean` | `lean` | 103 | 103 |
| `judge-lolcode` | `docker/Dockerfile.judge-lolcode` | `lolcode` | 82 | 78 |
| `judge-lua` | `docker/Dockerfile.judge-lua` | `lua`, `fennel` | 29, 91 | 27, 87 |
| `judge-malbolge` | `docker/Dockerfile.judge-malbolge` | — | — | — |
| `judge-mercury` | `docker/Dockerfile.judge-mercury` | `mercury` | 105 | 92 |
| `judge-micropython` | `docker/Dockerfile.judge-micropython` | `micropython` | 92 | 109 |
| `judge-minizinc` | `docker/Dockerfile.judge-minizinc` | `minizinc` | 111 | 100 |
| `judge-modula2` | `docker/Dockerfile.judge-modula2` | `modula2` | 108 | 98 |
| `judge-moonbit` | `docker/Dockerfile.judge-moonbit` | `moonbit` | 117 | 118 |
| `judge-nasm` | `docker/Dockerfile.judge-nasm` | `nasm` | 71 | 41 |
| `judge-nelua` | `docker/Dockerfile.judge-nelua` | `nelua` | 100 | 110 |
| `judge-nim` | `docker/Dockerfile.judge-nim` | `nim` | 33 | 31 |
| `judge-node` | `docker/Dockerfile.judge-node` | `javascript`, `typescript`, `plaintext`, `verilog`, `systemverilog`, `vhdl`, `coffeescript` | 16, 17, 122, 123, 124, 125, 18 | 13, 14, 120, 121, 122, 123, 15 |
| `judge-objective-c` | `docker/Dockerfile.judge-objective-c` | `objective_c` | 72 | 19 |
| `judge-ocaml` | `docker/Dockerfile.judge-ocaml` | `ocaml` | 34 | 32 |
| `judge-octave` | `docker/Dockerfile.judge-octave` | `octave` | 57 | 57 |
| `judge-odin` | `docker/Dockerfile.judge-odin` | `odin` | 76 | 62 |
| `judge-pascal` | `docker/Dockerfile.judge-pascal` | `pascal`, `delphi` | 41, 42 | 39, 40 |
| `judge-perl` | `docker/Dockerfile.judge-perl` | `perl` | 26 | 24 |
| `judge-php` | `docker/Dockerfile.judge-php` | `php` | 27 | 25 |
| `judge-picat` | `docker/Dockerfile.judge-picat` | `picat` | 104 | 97 |
| `judge-pony` | `docker/Dockerfile.judge-pony` | `pony` | 116 | 96 |
| `judge-postscript` | `docker/Dockerfile.judge-postscript` | `postscript` | 60 | 60 |
| `judge-powershell` | `docker/Dockerfile.judge-powershell` | `powershell` | 59 | 59 |
| `judge-prolog` | `docker/Dockerfile.judge-prolog` | `prolog` | 52 | 51 |
| `judge-purescript` | `docker/Dockerfile.judge-purescript` | `purescript` | 107 | 91 |
| `judge-pypy` | `docker/Dockerfile.judge-pypy` | `pypy` | 15 | 124 |
| `judge-python` | `docker/Dockerfile.judge-python` | `python` | 14 | 12 |
| `judge-r` | `docker/Dockerfile.judge-r` | `r` | 25 | 23 |
| `judge-racket` | `docker/Dockerfile.judge-racket` | `racket` | 38 | 36 |
| `judge-raku` | `docker/Dockerfile.judge-raku` | `raku` | 74 | 55 |
| `judge-rescript` | `docker/Dockerfile.judge-rescript` | `rescript` | 120 | 119 |
| `judge-rexx` | `docker/Dockerfile.judge-rexx` | `rexx` | 94 | 111 |
| `judge-roc` | `docker/Dockerfile.judge-roc` | — | — | — |
| `judge-ruby` | `docker/Dockerfile.judge-ruby` | `ruby` | 28 | 26 |
| `judge-rust` | `docker/Dockerfile.judge-rust` | `rust` | 19 | 16 |
| `judge-scala` | `docker/Dockerfile.judge-scala` | `scala` | 44 | 43 |
| `judge-scheme` | `docker/Dockerfile.judge-scheme` | `scheme` | 55 | 54 |
| `judge-shakespeare` | `docker/Dockerfile.judge-shakespeare` | `shakespeare` | 83 | 79 |
| `judge-simula` | `docker/Dockerfile.judge-simula` | — | — | — |
| `judge-smalltalk` | `docker/Dockerfile.judge-smalltalk` | `smalltalk` | 70 | 72 |
| `judge-sml` | `docker/Dockerfile.judge-sml` | `sml` | 90 | 86 |
| `judge-snobol4` | `docker/Dockerfile.judge-snobol4` | `snobol4` | 81 | 77 |
| `judge-squirrel` | `docker/Dockerfile.judge-squirrel` | `squirrel` | 93 | 113 |
| `judge-swift` | `docker/Dockerfile.judge-swift` | `swift` | 21 | 18 |
| `judge-tcl` | `docker/Dockerfile.judge-tcl` | `tcl` | 53 | 52 |
| `judge-uiua` | `docker/Dockerfile.judge-uiua` | `uiua` | 77 | 74 |
| `judge-umjunsik` | `docker/Dockerfile.judge-umjunsik` | `umjunsik` | 84 | 80 |
| `judge-v` | `docker/Dockerfile.judge-v` | `vlang` | 39 | 37 |
| `judge-vala` | `docker/Dockerfile.judge-vala` | `vala` | 99 | 114 |
| `judge-wat` | `docker/Dockerfile.judge-wat` | `wat` | 106 | 101 |
| `judge-zig` | `docker/Dockerfile.judge-zig` | `zig` | 32 | 30 |

## 4. Capability Inventory

Source: `src/lib/capabilities/types.ts` (46 unique capabilities). Default role grants from `src/lib/capabilities/defaults.ts`.

| Capability | Default roles |
|---|---|
| `anti_cheat.run_similarity` | super_admin, instructor, assistant |
| `anti_cheat.view_events` | super_admin, instructor, assistant |
| `assignments.create` | super_admin, instructor |
| `assignments.delete` | super_admin, instructor |
| `assignments.edit` | super_admin, instructor |
| `assignments.view_status` | super_admin, instructor, assistant |
| `community.moderate` | super_admin, instructor |
| `content.submit_solutions` | super_admin, student |
| `content.view_own_submissions` | super_admin, student |
| `contests.create` | super_admin, instructor |
| `contests.export` | super_admin, instructor |
| `contests.manage_access_codes` | super_admin, instructor |
| `contests.view_analytics` | super_admin, instructor |
| `contests.view_leaderboard_full` | super_admin, instructor |
| `files.manage` | super_admin, admin |
| `files.upload` | super_admin, admin, instructor, assistant |
| `groups.create` | super_admin, instructor |
| `groups.delete` | super_admin, admin |
| `groups.edit` | super_admin, instructor |
| `groups.manage_members` | super_admin, instructor |
| `groups.view_all` | super_admin, admin |
| `problem_sets.assign_groups` | super_admin, instructor |
| `problem_sets.create` | super_admin, instructor |
| `problem_sets.delete` | super_admin, instructor |
| `problem_sets.edit` | super_admin, instructor |
| `problems.create` | super_admin, instructor |
| `problems.delete` | super_admin, instructor |
| `problems.edit` | super_admin, instructor |
| `problems.manage_visibility` | super_admin, instructor |
| `problems.view_all` | super_admin, instructor, assistant |
| `recruiting.manage_invitations` | super_admin, instructor |
| `submissions.comment` | super_admin, instructor, assistant |
| `submissions.rejudge` | super_admin, instructor, assistant |
| `submissions.view_all` | super_admin, instructor |
| `submissions.view_source` | super_admin, instructor, assistant |
| `system.audit_logs` | super_admin, admin |
| `system.backup` | super_admin, admin |
| `system.chat_logs` | super_admin, admin |
| `system.login_logs` | super_admin, admin |
| `system.plugins` | super_admin, admin |
| `system.settings` | super_admin, admin |
| `users.create` | super_admin, admin |
| `users.delete` | super_admin, admin |
| `users.edit` | super_admin, admin |
| `users.manage_roles` | super_admin |
| `users.view` | super_admin, instructor |

## 5. Deployment & Config Inventory

| docs/deployment.md claim | Source files | Notes |
|---|---|---|
| Production stack uses `docker-compose.production.yml` | `docker-compose.production.yml`, `deploy-docker.sh`, `deploy.sh` | Verified |
| App container internal port 3000, host 3100 | `docker-compose.production.yml:96` (`127.0.0.1:3100:3000`) | Doc says internal 3100; code maps 3000 internally |
| Worker stack `docker-compose.worker.yml` | `docker-compose.worker.yml`, `scripts/deploy-worker.sh` | Verified |
| Language presets: core, popular, extended, all, everything | `deploy-docker.sh:268-277`, `scripts/setup.sh`, `docs/languages.md:214-220`, `AGENTS.md:375` | Sizes differ between docs/deployment.md and deploy-docker.sh |
| Env vars (`DATABASE_URL`, `REDIS_URL`, etc.) | `.env.example`, `docker-compose.production.yml`, `src/lib/db/index.ts`, `src/lib/redis.ts` | Verified |
| Backup cron via `install-online-judge-backup-timer.sh` | `scripts/install-online-judge-backup-timer.sh`, `scripts/backup-db.sh`, `scripts/verify-db-backup.sh` | Verified |
| Static site `static-site/nginx.conf` | `static-site/nginx.conf` | Verified |

---

## 6. Security Scope Inventory

| SECURITY.md scope | Actual source files | Status |
|---|---|---|
| Auth.js v5 credentials/session + API-key bearer | `src/lib/auth/config.ts`, `src/lib/auth/api-key.ts`, `src/app/api/v1/auth/**` | Verified |
| Capability system | `src/lib/capabilities/types.ts`, `src/lib/capabilities/defaults.ts`, `src/lib/capabilities/cache.ts` | Verified |
| Rate limiter sidecar `rate-limiter-rs/` | `rate-limiter-rs/src/main.rs`, `src/lib/security/api-rate-limit.ts` | Verified |
| Code-similarity sidecar `code-similarity-rs/` | `code-similarity-rs/Cargo.toml`, `Dockerfile.code-similarity`, `src/lib/assignments/code-similarity.ts` | Path wording ambiguous (root Dockerfile) |
| Judge sandboxing (gvisor/crun) | `docs/judge-worker-gvisor.md`, `scripts/install-gvisor.sh`, `scripts/install-crun-runtime.sh`, `judge-worker-rs/src/docker.rs` | Verified |
| Secrets/encryption scope | `src/lib/security/encryption.ts`, `src/lib/auth/config.ts` | Verified |

---

## 7. Worker & Sidecar Inventory

| docs/judge-workers.md claim | Source files |
|---|---|
| Rust judge worker (`judge-worker-rs`) | `judge-worker-rs/src/{main,api,config,executor,docker,languages,runner,types,validation,comparator}.rs` |
| Rate-limiter sidecar (`rate-limiter-rs`) | `rate-limiter-rs/src/main.rs` |
| Docker Compose worker stack | `docker-compose.worker.yml` |
| Worker deploy script | `scripts/deploy-worker.sh` |
| gvisor runtime config | `scripts/install-gvisor.sh`, `docs/judge-worker-gvisor.md` |
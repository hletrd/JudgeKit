# JudgeKit Competitive Programmer Review (v2 — 사실 검증 완료)

**Date**: 2026-04-16 (v2)
**Reviewer Perspective**: acmicpc.net (BOJ) / koistudy / LeetCode heavy user
**Scope**: Public-facing features — problem solving, contests, rankings, community, playground
**Commit**: 607be56 (current HEAD)

---

## Executive Summary

> **v2 정정**: 기존 리뷰(v1)에서 검색, 필터, 정렬, Solved/Unsolved 표시, Ctrl+Enter 단축키, 전체화면 에디터, 가상 대회, 에디토리얼 탭, 유사 문제 추천, 문제 통계를 "없다"고 기술했으나, **실제 코드 검증 결과 모두 구현되어 있음이 확인됨.** 이 리뷰는 사실 검증을 거친 정정판이다.

JudgeKit은 **기존 평가보다 훨씬 잘 만들어져 있다.** 경쟁 프로그래밍의 기본 UX(검색·필터·정렬·단축키·통계·추천·가상 대회)는 이미 갖추고 있다. 하지만 **깊이**가 부족하다. Special Judge, 인터랙티브 문제, 서브태스크, 클랜 시스템, 인라인 제출 등 "있어야 매일 쓰는 플랫폼"이 되는 고급 기능이 누락되어 있다.

**총평**: 교육용으로는 A급. 대회 준비용으로는 B-. 기존 평가(C+급)에서 상향.

---

## v1 → v2 주요 정정 사항

### 기존 리뷰가 틀린 것 (기능이 있는데 "없다"고 함)

| 항목 | v1 기술 | 실제 코드 |
|------|---------|-----------|
| 문제 검색 | "CRITICAL: 검색 기능 없음" | `practice/page.tsx:152-154` 제목 검색 **있음** |
| 알고리즘 필터 | "CRITICAL: 필터 없음" | `practice/page.tsx:157-164` 태그 필터 **있음** |
| 정렬 | "HIGH: 정렬 옵션 없음" | `practice/page.tsx:170-181` 4가지 정렬 **있음** |
| Solved/Unsolved | "CRITICAL: 표시 없음" | `practice/page.tsx:193-195` 상태 표시 **있음** |
| Ctrl+Enter | "치명적 결함" | `code-editor.tsx:68-72` **구현됨** |
| 전체화면 | "없음" | `code-editor.tsx:33-47` F11 **구현됨** |
| 문제 통계 | "HIGH: 통계 없음" | `problems/[id]/page.tsx:338-368` **있음** |
| 유사 문제 | "MEDIUM: 추천 없음" | `problems/[id]/page.tsx:370-399` **있음** |
| 에디토리얼 | "P1: 해설 시스템 없음" | `problems/[id]/page.tsx` 에디토리얼 탭 **있음** |
| 내 제출 | "HIGH: 바로가기 없음" | `problems/[id]/page.tsx` My Submissions 탭 **있음** |
| 가상 대회 | "CRITICAL: 없음" | `contests/[id]/page.tsx` virtual practice **있음** |
| Vim 단축키 | "부분" | `vim-scroll-shortcuts.tsx` j/k/N/P/G **포괄적** |

### 기존 리뷰가 맞은 것 (실제로 없음)

| 항목 | 상태 | 심각도 |
|------|------|--------|
| Special Judge | 미구현 | P0 |
| 인라인 코드 제출 (문제 페이지에서) | 미구현 | P0 |
| 서브태스크 / 그룹 채점 | 미구현 | P0 |
| 인터랙티브 문제 | 미구현 | P1 |
| 클랜(Q&A) 시스템 | 미구현 | P1 |
| 팀 대회 | 미구현 | P1 |
| 레이팅 시스템 | 미구현 | P2 |
| 언어별 템플릿 코드 | 미구현 | P1 |
| 다른 사람 코드 열람 | 미구현 | P1 |
| WA/TLE 상세 피드백 | 미구현 | P1 |
| 문제집(Playlist) | 미구현 | P3 |

---

## 세부 리뷰

자세한 내용은 각 분야별 리뷰 파일을 참조:

- [00-overall-verdict.md](./00-overall-verdict.md) — 종합 평가 (정정판)
- [01-problem-experience.md](./01-problem-experience.md) — 문제 열람 & 제출 경험 (정정판)
- [02-contest-system.md](./02-contest-system.md) — 대회 시스템 (정정판)
- [03-judging-engine.md](./03-judging-engine.md) — 판정 엔진
- [04-community-ux.md](./04-community-ux.md) — 커뮤니티 & UX (정정판)
- [05-competitive-gap-analysis.md](./05-competitive-gap-analysis.md) — 타 플랫폼 대비 갭 분석 (정정판)
- [06-recommendations.md](./06-recommendations.md) — 개선 제안 우선순위 (정정판)

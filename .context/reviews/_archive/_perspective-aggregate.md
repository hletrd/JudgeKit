# Multi-Perspective Review Aggregate -- JudgeKit

**Date**: 2026-05-04
**Reviewers**: Student, Instructor, Admin, TA/Assistant, Job Applicant, Security Researcher
**Scope**: Full platform -- all user roles, all features, security posture

---

## Overall Grades

| Perspective | Grade | Key Strength | Key Weakness |
|---|---|---|---|
| Student | B+ | Exam system, code editor, i18n | 4s submit delay, mobile problem list, no "Time's up" modal |
| Instructor | B+ | Scoring models, anti-cheat, leaderboard | No exam session reset, no bulk score ops, cramped assignment dialog |
| Admin | B+ | 44-capability RBAC, audit logging | No admin dashboard, no user export, limited bulk ops |
| TA/Assistant | C+ | Capability scoping, anti-cheat access | No sidebar, no score overrides, no bulk ops, no discussion mod |
| Job Applicant | B | Security posture, CodeMirror editor, real-time feedback | No password recovery, no password confirmation, intimidating notices |
| Security | B+ | Docker sandbox, Argon2id, rate limiting | Plaintext secrets in .env, weak prod passwords, observational anti-cheat |

**Weighted Average: B+** (strong engineering, polish and workflow gaps)

---

## Critical Findings Across All Perspectives

### 1. TA Navigation is Broken (TA -- C+)
Default TAs get no sidebar at all. The `AppSidebar` returns `null` because TAs lack admin capabilities. They must navigate through the PublicHeader dropdown, which has no TA-specific items. A TA grading 200 submissions has no discoverable path to their work.

**Files**: `src/components/layout/app-sidebar.tsx:155-163`

### 2. No Exam Session Reset/Extend (Instructor -- B+)
If a student's browser crashes mid-exam, there is no instructor mechanism to reset or extend their personal deadline. During a 200-student midterm, 5-10 students will have browser issues. The instructor must contact the platform admin.

**Files**: `src/lib/assignments/exam-sessions.ts`

### 3. No Password Confirmation in Recruiting (Job Applicant -- B)
The recruit start form has one password field. A typo means permanent lockout until admin reset. Combined with 5-attempt lockout and no self-service recovery, this is the #1 source of candidate support tickets.

**Files**: `src/app/(auth)/recruit/[token]/recruit-start-form.tsx:117-131`

### 4. Plaintext Secrets on Disk (Security -- B+)
`.env` files contain SSH passwords, production admin passwords, AUTH_SECRET, JUDGE_AUTH_TOKEN. While gitignored, they have 644 permissions. Compromise of the developer workstation = full infrastructure takeover.

**Files**: `.env`, `.env.production`, `.env.deploy`

### 5. No Admin Dashboard (Admin -- B+)
Admins have 14 sidebar pages but no overview. Must visit 4-5 pages to understand system health. The `admin-health.ts` infrastructure exists but is not exposed in the UI.

### 6. 4-Second Submit Delay During Exams (Student -- B+)
Every submission goes through a 4-second "confirming" toast. During a timed exam with 5 minutes left, this is agonizing. No profile setting or exam-mode flag to disable it.

**Files**: `src/components/problem/problem-submission-form.tsx:233-327`

---

## Findings by Category

### Exam Integrity
| Finding | Severity | Perspective |
|---|---|---|
| Anti-cheat is observational, not preventive | High | Security |
| No real-time blocking of suspicious behavior | High | Security |
| Tab switches logged but not prevented | Medium | Security |
| No auto-flag thresholds for submission hold | Medium | Security |
| No "Time's up" modal when exam timer expires | High | Student |
| No pre-exam instructions or system check | Medium | Instructor |
| 4-second submit delay punishes students under time pressure | High | Student |
| Keyboard shortcuts `n`/`p` fire in textareas during exams | Medium | Student |

### Navigation & UX
| Finding | Severity | Perspective |
|---|---|---|
| No sidebar for default TAs | Critical | TA |
| No TA-specific dropdown items in header | Critical | TA |
| Problem list table not mobile-friendly (8 columns) | High | Student |
| Assignment form is cramped modal, not full page | High | Instructor |
| Problem selector is flat dropdown with no search | High | Instructor |
| Contest join redirects to dashboard, not contest page | Medium | Student |
| Profile read-only fields look editable | Low | Student |
| Leaderboard has no horizontal scroll indicator | Low | Student |
| Settings page has 10 tabs with no search | Medium | Admin |

### Grading & Bulk Operations
| Finding | Severity | Perspective |
|---|---|---|
| No bulk score override | Critical | Instructor |
| TAs cannot manage score overrides | Critical | TA |
| No bulk rejudge for TA-scoped submissions | Critical | TA |
| No cross-group assignment duplication | High | Instructor |
| No user list export (CSV) | High | Admin |
| No bulk user operations beyond CSV import | High | Admin |
| Score override dialog lacks audit trail visibility | Medium | Instructor |
| No group member export | Medium | Instructor |

### Security
| Finding | Severity | Perspective |
|---|---|---|
| Plaintext secrets in .env files | Critical | Security |
| Weak/default production passwords | Critical | Security |
| Plugin secret plaintext fallback in production | Medium | Security |
| Judge IP allowlist defaults to allow-all | Medium | Security |
| Source code exposed in judge claim responses | Medium | Security |
| hCaptcha optional for sign-up | Medium | Security |
| Password policy minimal (8 chars only) | Medium | Security |
| AUTH_URL uses HTTP in production | Medium | Security |
| No self-service password recovery for candidates | High | Job Applicant |
| Token locks after 5 failed attempts, no self-service unlock | High | Job Applicant |
| Unsaved changes guard hardcoded in English | Medium | Student |
| Runtime error labels hardcoded in English | Medium | Student |

### Recruiting / Candidate Experience
| Finding | Severity | Perspective |
|---|---|---|
| No password confirmation field | Critical | Job Applicant |
| No self-service password recovery | Critical | Job Applicant |
| Token locks after 5 attempts with no cooldown | High | Job Applicant |
| Review notice is intimidating and vague | Medium | Job Applicant |
| Anti-cheat privacy dialog blocks every page load | Medium | Job Applicant |
| Timer is a small badge, not prominent | Medium | Job Applicant |
| No auto-save indicator near editor | Medium | Job Applicant |
| Results page requires separate URL | Low | Job Applicant |
| Language list truncated to 6 on landing page | Low | Job Applicant |

### Code Editor & Submissions
| Finding | Severity | Perspective |
|---|---|---|
| Run result is ephemeral (no history) | Low | Student |
| Code editor fullscreen "F" label is misleading | Low | Student |
| Submission status tooltip hover-only (not touch-friendly) | Low | Student |
| No copy button on sample I/O blocks | Low | Student |
| Diff view only for visible test cases | Low | Student |
| Source file upload has no size warning | Low | Student |
| Inline code commenting infrastructure not wired up | Medium | TA |

### Data Management
| Finding | Severity | Perspective |
|---|---|---|
| Data retention policies not admin-configurable | High | Admin |
| No scheduled backup mechanism | Medium | Admin |
| User detail page shows only 7 fields | High | Admin |
| User search limited to username/name | Medium | Admin |
| Bulk import preview limited to 50 rows | Low | Admin |

---

## What's Done Well (Cross-Perspective Consensus)

These strengths were noted by **multiple reviewers**:

1. **Docker Sandbox Security** (Security, Instructor) -- `--network=none`, `--cap-drop=ALL`, `--read-only`, `--user 65534`, seccomp, PID/memory limits. Exceptional.

2. **Scoring Models** (Instructor, Student) -- ICPC/IOI with proper tie-breaking, epsilon comparison for floats, leaderboard freeze with live rank.

3. **Anti-Cheat Tier Model** (Instructor, TA, Security) -- Three-tier review system with responsible disclaimers about not using signals alone.

4. **Code Editor** (Student, Job Applicant) -- CodeMirror 6 with 14+ language modes, auto-save, keyboard shortcuts, fullscreen, dark mode.

5. **i18n** (Student, Admin) -- 3141-line translations for English and Korean, Korean letter-spacing guards, proper locale detection.

6. **Audit Logging** (Admin, Security) -- Comprehensive event tracking with filters, CSV export, IP tracking, instructor scoping.

7. **Capability-Based RBAC** (Admin, TA) -- 44 capabilities in 13 groups, custom role support, clean separation of concerns.

8. **Rate Limiting** (Security, Job Applicant) -- DB-backed, atomic, exponential backoff, per-IP and per-username.

9. **Token Security** (Security, Job Applicant) -- SHA-256 hashed storage, brute-force lockout, timing-safe comparison.

10. **Real-Time Submission Feedback** (Student, Job Applicant) -- Live polling with queue position, grading progress, status badges.

---

## Priority Action Items

### P0 -- Fix Immediately (Security/Critical)
1. Rotate all leaked credentials (AUTH_SECRET, JUDGE_AUTH_TOKEN, SSH passwords, admin passwords, API keys)
2. Generate a real PostgreSQL password for production (replace `judgekit_prod_change_me`)
3. Set `.env*` file permissions to 600
4. Enforce HTTPS for `AUTH_URL` in production

### P1 -- Fix This Sprint (Critical UX)
5. Add password confirmation field to recruit start form
6. Implement self-service password reset for candidates
7. Add exam session reset/extend for instructors
8. Add bulk score override operations
9. Fix TA sidebar navigation (add TA-aware sidebar items)
10. Grant TAs: score overrides, `community.moderate`, `groups.manage_members`

### P2 -- Fix Next Sprint (High Impact)
11. Add admin dashboard with aggregated metrics
12. Add user list export (CSV)
13. Add bulk user operations (deactivate, role change, class assignment)
14. Convert assignment form dialog to full page
15. Add searchable problem picker in assignment form
16. Make exam timer prominent and sticky
17. Add "Time's up" modal when exam timer expires
18. Show privacy notice once per session, not per page load
19. Add auto-save indicator near code editor

### P3 -- Backlog (Polish)
20. Add mobile card layout for problem list
21. Guard keyboard shortcuts against text input focus
22. Translate runtime error labels and unsaved changes guard
23. Add copy button on sample I/O blocks
24. Add markdown toolbar to problem description editor
25. Wire up inline code commenting (CodeViewer -> CommentSection)
26. Add "needs attention" filters for TA submission review
27. Add cross-group assignment duplication
28. Add scheduled backup mechanism
29. Make hCaptcha mandatory for production sign-up
30. Add common-password check in password validation
31. Make JUDGE_ALLOWED_IPS mandatory in production
32. Add configurable anti-cheat enforcement thresholds

---

## Grade Justification

**B+ overall** reflects a platform with:
- **A-tier**: Security architecture, sandbox hardening, scoring models, audit logging, RBAC
- **B-tier**: Code editor, i18n, exam system, real-time feedback, contest management
- **C-tier**: TA experience, bulk operations, admin dashboard, candidate account management
- **D-tier**: Secret management (operational, not architectural)

The engineering fundamentals are strong. The critical gaps are in **workflow efficiency** (bulk operations, TA navigation, admin dashboard) and **candidate experience** (password management, timer prominence). The security issues are primarily operational (secret management) rather than architectural -- the application-layer security is production-grade.

With the P0/P1 items addressed, this platform would merit an **A-** across all perspectives.
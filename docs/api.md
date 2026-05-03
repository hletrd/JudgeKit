# API Reference

Base URL: `/api/v1`

## Table of Contents

- [Authentication](#authentication)
- [Request & Response Format](#request--response-format)
- [Rate Limiting](#rate-limiting)
- [Pagination](#pagination)
- [Error Codes](#error-codes)
- [Endpoints](#endpoints)
  - [Health & System](#health--system)
  - [Users](#users)
  - [Problems](#problems)
  - [Submissions](#submissions)
  - [Groups](#groups)
  - [Group Members](#group-members)
  - [Assignments](#assignments)
  - [Exam Sessions](#exam-sessions)
  - [Score Overrides](#score-overrides)
  - [Contests](#contests)
  - [Problem Sets](#problem-sets)
  - [Files](#files)
  - [Languages](#languages)
  - [Tags](#tags)
  - [Compiler](#compiler)
  - [Judge Workers](#judge-workers)
  - [Admin: API Keys](#admin-api-keys)
  - [Admin: Settings](#admin-settings)
  - [Admin: Roles](#admin-roles)
  - [Admin: Languages](#admin-languages)
  - [Admin: Tags](#admin-tags)
  - [Admin: Workers](#admin-workers)
  - [Admin: Docker Images](#admin-docker-images)
  - [Admin: Plugins](#admin-plugins)
  - [Admin: Logs](#admin-logs)
  - [Admin: Backup & Restore](#admin-backup--restore)
  - [Admin: Migration](#admin-migration)
  - [Plugins: Chat Widget](#plugins-chat-widget)
  - [Internal](#internal)

---

## Authentication

All API endpoints require authentication unless noted otherwise. Two authentication methods are supported:

### Session Cookie (JWT)

The default method for web browsers. Obtain a session by signing in through the Auth.js credentials flow:

```bash
CSRF_TOKEN="$(curl -s -c cookies.txt "$BASE_URL/api/auth/csrf" | jq -r '.csrfToken')"

curl -s -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF_TOKEN" \
  --data-urlencode "username=$USERNAME" \
  --data-urlencode "password=$PASSWORD" \
  --data-urlencode "callbackUrl=$BASE_URL/dashboard" \
  "$BASE_URL/api/auth/callback/credentials"

# Subsequent requests include the cookie automatically
curl -s -b cookies.txt "$BASE_URL/api/v1/problems?limit=5"
```

### API Key (Bearer Token)

For programmatic access. API keys use the `jk_` prefix and are managed via [Admin: API Keys](#admin-api-keys).

```bash
curl -H "Authorization: Bearer jk_..." "$BASE_URL/api/v1/problems"
```

API key requests skip CSRF validation automatically.

### CSRF Protection

Mutation methods (`POST`, `PUT`, `PATCH`, `DELETE`) require a valid CSRF token header when using session cookie authentication. The CSRF token is obtained from `/api/auth/csrf`.

---

## Request & Response Format

### Success Response

```json
{ "data": <T> }
```

### Error Response

```json
{ "error": "errorCode", "resource": "ResourceName" }
```

The `resource` field is included only for `notFound` errors.

### Paginated Response (Offset)

```json
{ "data": [...], "page": 1, "limit": 20, "total": 100 }
```

### Paginated Response (Cursor)

```json
{ "data": [...], "nextCursor": "string|null" }
```

---

## Rate Limiting

Some endpoints enforce per-user rate limits. When exceeded, the response is:

- **Status:** `429 Too Many Requests`
- **Header:** `Retry-After: <seconds>`

---

## Pagination

### Offset-based

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `page` | number | 1 | 10000 | Page number |
| `limit` | number | 20 | 100 | Items per page |

### Cursor-based

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `cursor` | string | — | — | Opaque cursor from `nextCursor` |
| `limit` | number | 20 | 100 | Items per page |

---

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `unauthorized` | 401 | Missing or invalid authentication |
| `forbidden` | 403 | Insufficient permissions |
| `notFound` | 404 | Resource not found |
| `invalidJson` | 400 | Request body is not valid JSON |
| `validationError` | 400 | Request body failed Zod validation |
| `internalServerError` | 500 | Unhandled server error |

---

## Endpoints

### Health & System

#### `GET /api/health`

Health check endpoint. No authentication required, but callers whose role resolves to the `system.settings` capability see extended diagnostics.

**Public Response:**
```json
{ "status": "ok" }
```

**Admin Response:**
```json
{
  "status": "ok|degraded|error",
  "checks": { "database": "ok|error", "auditEvents": "ok|degraded" },
  "uptimeSeconds": 3600,
  "responseTimeMs": 12,
  "appVersion": "1.2.3",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "details": { "auditEvents": { "failedWrites": 0, "lastFailureAt": null } }
}
```

Returns `503` if database is unreachable (detailed view only).

---

#### `GET /api/metrics`

Prometheus-style metrics endpoint. Accessible to:
- authenticated callers whose role resolves to the `system.settings` capability, or
- requests with `Authorization: Bearer $CRON_SECRET`

**Response:** `text/plain; version=0.0.4`

Exports gauges for:
- overall health status
- database / audit pipeline checks
- judge worker counts by status
- submission queue depth and limit
- uptime and health probe latency
- failed audit-event writes

Returns `401 Unauthorized` to anonymous callers and to callers whose bearer token does not match `CRON_SECRET`. The response body is the generic `{"error":"Unauthorized"}`; the `CRON_SECRET` env-var name is never disclosed (the missing-config branch is logged server-side via `console.warn` so operators see the gap, but the wire response is identical to a wrong-token response).

---

#### `GET /api/v1/time`

Returns the server's current timestamp. No authentication required.

**Response:**
```json
{ "timestamp": 1704067200000 }
```

---

### Users

#### `GET /api/v1/users`

List all users. **Admin only.**

| Query Param | Type | Description |
|-------------|------|-------------|
| `page` | number | Page number |
| `limit` | number | Items per page |
| `role` | string | Filter: `student`, `instructor`, `admin`, `super_admin` |

**Response:** Paginated list of users.

```json
{
  "data": [
    {
      "id": "string",
      "username": "string",
      "name": "string",
      "email": "string|null",
      "className": "string|null",
      "role": "string",
      "isActive": true,
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601"
    }
  ],
  "page": 1, "limit": 20, "total": 100
}
```

---

#### `POST /api/v1/users`

Create a user. **Admin only.** Rate limit: `users:create`.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string | Yes | 1-50 chars, unique |
| `name` | string | Yes | 1-100 chars |
| `email` | string | No | Valid email, unique |
| `className` | string | No | Max 100 chars |
| `password` | string | No | Auto-generated if omitted |
| `role` | string | No | Default: `student` |

**Response (201):**
```json
{
  "data": {
    "user": { ... },
    "passwordGenerated": true
  }
}
```

---

#### `GET /api/v1/users/:id`

Get a user by ID. Admin or the user themselves.

**Response:** Single user object.

---

#### `PATCH /api/v1/users/:id`

Update a user. Rate limit: `users:update`.

- **Admin:** Can change all fields including `username`, `email`, `role`, `isActive`, `password`.
- **Self:** Can change `name`, `className` only.

**Request Body (all optional):**
| Field | Type | Notes |
|-------|------|-------|
| `name` | string | 1-100 chars |
| `username` | string | Admin only, 1-50 chars |
| `email` | string\|null | Admin only |
| `className` | string\|null | Max 100 chars |
| `role` | string | Admin only |
| `isActive` | boolean | Admin only, cannot deactivate self |
| `password` | string | Admin only, cannot reset own password |

**Response:** Updated user object.

---

#### `DELETE /api/v1/users/:id`

Delete or deactivate a user. **Admin only.** Rate limit: `users:delete`.

| Query Param | Type | Description |
|-------------|------|-------------|
| `permanent` | boolean | `true` for permanent deletion |

For permanent deletion, the request body must include `confirmUsername` matching the user's username.

Cannot delete self or super_admin accounts.

---

#### `POST /api/v1/users/bulk`

Bulk create users. **Admin or Instructor.** Rate limit: `users:bulk-create`.

Instructors can only create students.

**Request Body:**
```json
{
  "users": [
    { "username": "string", "name": "string", "email": "string?", "className": "string?", "role": "string?" }
  ]
}
```

**Response (201):**
```json
{
  "data": {
    "created": [{ "username": "string", "name": "string", "generatedPassword": "string" }],
    "failed": [{ "username": "string", "reason": "string" }],
    "createdCount": 5,
    "failedCount": 1
  }
}
```

---

### Problems

#### `GET /api/v1/problems`

List problems with access-controlled visibility.

| Query Param | Type | Description |
|-------------|------|-------------|
| `page` | number | Page number |
| `limit` | number | Items per page |
| `visibility` | string | `public`, `private`, `hidden` |

- **Admin:** Sees all problems.
- **Others:** See public problems + authored problems + problems via group enrollment.

---

#### `POST /api/v1/problems`

Create a problem. **Instructor or above.** Rate limit: `problems:create`.

**Request Body:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `title` | string | — | 1-200 chars, required |
| `description` | string | — | Markdown content |
| `timeLimitMs` | number | 2000 | 100-30000 |
| `memoryLimitMb` | number | 256 | 16-1024 |
| `visibility` | string | `private` | `public`, `private`, `hidden` |
| `showCompileOutput` | boolean | — | Show compile output to students |
| `showDetailedResults` | boolean | — | Show per-test-case results |
| `showRuntimeErrors` | boolean | — | Show runtime errors |
| `allowAiAssistant` | boolean | — | Enable AI chat for this problem |
| `comparisonMode` | string | `exact` | `exact` or `float` |
| `floatAbsoluteError` | number | — | 0-1, for float mode |
| `floatRelativeError` | number | — | 0-1, for float mode |
| `difficulty` | number | — | 0-10 |
| `testCases` | array | — | Test case objects |
| `tags` | array | — | Max 20 tags |

**Response (201):** Problem object with test cases.

---

#### `GET /api/v1/problems/:id`

Get a problem. Access-controlled. Test cases are only returned to the problem author or admin.

---

#### `PATCH /api/v1/problems/:id`

Update a problem. **Author or Admin.** Rate limit: `problems:update`.

Same fields as POST (all optional). Test cases are locked after submissions exist unless `allowLockedTestCases: true` and the user is an admin (returns `409` otherwise).

---

#### `DELETE /api/v1/problems/:id`

Delete a problem. **Author or Admin.** Rate limit: `problems:delete`.

Returns `409` if submissions or assignments reference it. Admin can force delete with `?force=true`.

---

### Submissions

#### `GET /api/v1/submissions`

List submissions. Students see only their own.

Supports both offset and cursor pagination.

| Query Param | Type | Description |
|-------------|------|-------------|
| `problemId` | string | Filter by problem |
| `status` | string | Filter by status |
| `cursor` | string | Cursor pagination |
| `page` | number | Offset pagination |
| `limit` | number | Items per page |

---

#### `POST /api/v1/submissions`

Submit code for judging. Rate limit: `submissions:create`.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `problemId` | string | Yes | Problem to submit against |
| `language` | string | Yes | Must be a supported language |
| `sourceCode` | string | Yes | UTF-8, max size configurable |
| `assignmentId` | string | No | Associate with assignment |

Rate limits enforced: per-user per-minute, pending submission count, and global queue depth. Returns `429` or `503` when limits are exceeded.

**Response (201):** Submission object.

---

#### `GET /api/v1/submissions/:id`

Get a submission. Source code is only returned to the owner or users with `submissions.view_source` capability.

---

#### `POST /api/v1/submissions/:id/rejudge`

Rejudge a submission. **Instructor or above.** Rate limit: `submissions.rejudge`.

Resets the submission to `pending` status, deletes all existing test case results, and clears execution metrics.

---

#### `GET /api/v1/submissions/:id/comments`

List comments on a submission. Requires access to the submission.

---

#### `POST /api/v1/submissions/:id/comments`

Add a comment. **Instructor or above.** Rate limit: `comments:add`.

**Request Body:**
```json
{ "content": "HTML string (sanitized on store)" }
```

**Response (201):** Comment object with author info.

---

#### `GET /api/v1/submissions/:id/events`

**Server-Sent Events** stream for real-time submission status updates.

Rate limit: `submissions:events`. Max 500 global SSE connections with a configurable per-user cap.

**Event Types:**
| Event | Data | Description |
|-------|------|-------------|
| `status` | `{ status }` | Periodic update while judging |
| `result` | Full submission | Sent when judging completes |
| `timeout` | `{}` | Connection timeout reached |

If the submission is already in a terminal state, the result is sent immediately and the stream closes.

---

### Groups

#### `GET /api/v1/groups`

List groups. Role-based filtering:
- **Admin:** All groups.
- **Instructor:** Groups they own.
- **Student:** Enrolled groups.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 25 | Items per page |

Emails are hidden from non-admin/non-instructor users.

---

#### `POST /api/v1/groups`

Create a group. **Instructor or above.** Rate limit: `groups:create`.

**Request Body:**
```json
{ "name": "string", "description": "string?" }
```

**Response (201):** Group object.

---

#### `GET /api/v1/groups/:id`

Get a group with first 50 enrollments. Requires group access.

---

#### `PATCH /api/v1/groups/:id`

Update a group. **Admin or group instructor.** Rate limit: `groups:update`.

**Request Body (all optional):**
```json
{ "name": "string", "description": "string", "isArchived": true }
```

---

#### `DELETE /api/v1/groups/:id`

Delete a group. **Admin only.** Rate limit: `groups:delete`.

Returns `409` if the group has assignments with submissions.

---

### Group Members

#### `GET /api/v1/groups/:id/members`

List all members of a group. Requires group access.

---

#### `POST /api/v1/groups/:id/members`

Add a member. Must be able to manage group resources. Rate limit: `members:add`.

**Request Body:**
```json
{ "userId": "string" }
```

The user must be an active student not already enrolled. Returns `409` otherwise.

---

#### `DELETE /api/v1/groups/:id/members/:userId`

Remove a member. Rate limit: `members:remove`. Returns `409` if the member has submissions in group assignments.

---

#### `POST /api/v1/groups/:id/members/bulk`

Bulk add members. Rate limit: `members:bulk-add`. Combined `userIds` + `usernames` capped at 500 per call.

**Request Body** (one of, or both, the two arrays):
```json
{
  "userIds": ["id1", "id2"],
  "usernames": ["alice", "bob", "charlie"]
}
```

The route resolves each `usernames[i]` to a user row, deduplicates against
`userIds`, and reports unresolved + non-student usernames so the operator
can correct the input.

**Response:**
```json
{
  "data": {
    "enrolled": 5,
    "skipped": 2,
    "unresolvedUsernames": ["typo-name"],
    "nonStudentUsernames": ["existing-instructor"]
  }
}
```

---

### Assignments

#### `GET /api/v1/groups/:id/assignments`

List all assignments for a group with associated problems. Requires group access.

---

#### `POST /api/v1/groups/:id/assignments`

Create an assignment. Must be able to manage group resources. Rate limit: `assignments:create`.

**Request Body:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `title` | string | — | Required |
| `description` | string | — | Optional |
| `startsAt` | timestamp | — | Start time |
| `deadline` | timestamp | — | Deadline |
| `lateDeadline` | timestamp | — | Late deadline |
| `latePenalty` | number | 0 | Penalty for late submissions |
| `examMode` | string | `none` | `none` or exam mode |
| `examDurationMinutes` | number | — | Exam duration |
| `scoringModel` | string | `ioi` | Scoring model |
| `enableAntiCheat` | boolean | false | Enable anti-cheat monitoring |
| `problems` | array | — | `[{ problemId, points }]` |

**Response (201):** Assignment with problems.

---

#### `GET /api/v1/groups/:id/assignments/:assignmentId`

Get an assignment. Requires group access.

---

#### `PATCH /api/v1/groups/:id/assignments/:assignmentId`

Update an assignment. Rate limit: `assignments:update`.

Returns `409` if contest is active or problems are locked (unless admin with `allowLockedProblems`).

---

#### `DELETE /api/v1/groups/:id/assignments/:assignmentId`

Delete an assignment. Rate limit: `assignments:delete`. Returns `409` if submissions exist.

---

#### `GET /api/v1/groups/:id/assignments/:assignmentId/export`

Export assignment grades as CSV. **Instructor or above.**

Returns a CSV file with columns: Student Name, Username, Class, Status, Score, Submitted At. Includes UTF-8 BOM for Excel compatibility.

---

### Exam Sessions

#### `POST /api/v1/groups/:id/assignments/:assignmentId/exam-session`

Start an exam session. Rate limit: `exam-session:start`. Returns existing session if already started.

**Response (201):**
```json
{ "data": { "startedAt": "ISO8601", "personalDeadline": "ISO8601" } }
```

---

#### `GET /api/v1/groups/:id/assignments/:assignmentId/exam-session`

Get an exam session. Group owners/admins can query other users via `?userId=...`.

---

#### `GET /api/v1/groups/:id/assignments/:assignmentId/exam-sessions`

List all exam sessions for an assignment. Must be able to manage group resources.

---

### Score Overrides

#### `GET /api/v1/groups/:id/assignments/:assignmentId/overrides`

List all score overrides for an assignment. Must be able to manage group resources.

---

#### `POST /api/v1/groups/:id/assignments/:assignmentId/overrides`

Create or update a score override. Rate limit: `overrides:upsert`.

**Request Body:**
```json
{
  "problemId": "string",
  "userId": "string",
  "overrideScore": 100,
  "reason": "string?"
}
```

Score is capped to the problem's max points. User must be enrolled in the group.

---

#### `DELETE /api/v1/groups/:id/assignments/:assignmentId/overrides`

Remove a score override. Rate limit: `overrides:delete`.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `problemId` | string | Yes | Problem ID |
| `userId` | string | Yes | User ID |

---

### Contests

#### `POST /api/v1/contests/join`

Join a contest via access code. Rate limit: `contest:join`.

**Request Body:**
```json
{ "code": "string" }
```

**Response:**
```json
{ "data": { "assignmentId": "string", "groupId": "string", "alreadyEnrolled": false } }
```

---

#### `GET /api/v1/contests/:assignmentId/leaderboard`

View the contest leaderboard. Rate limit: `leaderboard`.

- **Instructor/Admin:** Full access with real names.
- **Student:** Must be enrolled or have a contest access token. Leaderboard may be anonymized.

**Response:**
```json
{
  "data": {
    "scoringModel": "string",
    "frozen": false,
    "frozenAt": null,
    "startsAt": "ISO8601",
    "problems": [...],
    "entries": [
      {
        "userId": "string",
        "username": "string",
        "name": "string",
        "className": "string",
        "rank": 1,
        "isCurrentUser": false,
        "problems": [...]
      }
    ]
  }
}
```

---

#### `GET /api/v1/contests/:assignmentId/analytics`

Get contest analytics. **Instructor or above.** Rate limit: `analytics`. Results cached (60s TTL).

---

#### `GET /api/v1/contests/:assignmentId/export`

Export contest results. **Instructor or above.** Rate limit: `export`.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `format` | string | `csv` | `csv` or `json` |

CSV includes anti-cheat event counts and IP addresses.

---

#### `POST /api/v1/contests/:assignmentId/anti-cheat`

Log an anti-cheat event. Rate limit: `anti-cheat:log`.

**Request Body:**
```json
{
  "eventType": "tab_switch|copy|paste|blur|contextmenu|ip_change|code_similarity|heartbeat",
  "details": "string?"
}
```

Heartbeat events throttled to once per 60 seconds. Contest must be active.

---

#### `GET /api/v1/contests/:assignmentId/anti-cheat`

List anti-cheat events. **Instructor or above.**

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `userId` | string | — | Filter by user |
| `eventType` | string | — | Filter by type |
| `limit` | number | 100 | Max 500 |
| `offset` | number | 0 | Pagination offset |

**Response:**
```json
{ "data": { "events": [...], "total": 42, "limit": 100, "offset": 0 } }
```

---

#### `GET /api/v1/contests/:assignmentId/access-code`

Get the current access code. **Contest manager.**

---

#### `POST /api/v1/contests/:assignmentId/access-code`

Generate a new access code. **Contest manager.** Returns `201`.

---

#### `DELETE /api/v1/contests/:assignmentId/access-code`

Revoke the access code. **Contest manager.**

---

#### `GET /api/v1/contests/:assignmentId/invite`

Search users to invite. **Contest manager.**

| Query Param | Type | Description |
|-------------|------|-------------|
| `q` | string | Search by username or name (max 10 results) |

---

#### `POST /api/v1/contests/:assignmentId/invite`

Invite a user by username. **Contest manager.** Auto-enrolls in the group.

**Request Body:**
```json
{ "username": "string" }
```

---

#### `POST /api/v1/contests/:assignmentId/similarity-check`

Run code similarity analysis. **Instructor or above.** Rate limit: `similarity-check`.

30-second timeout. Returns `504` on timeout.

**Response:**
```json
{ "data": { "flaggedPairs": 5 } }
```

---

### Problem Sets

#### `GET /api/v1/problem-sets`

List all problem sets with nested problems and group access. **Instructor or above.**

---

#### `POST /api/v1/problem-sets`

Create a problem set. **Instructor or above.** Rate limit: `problem-sets:create`.

---

#### `GET /api/v1/problem-sets/:id`

Get a problem set. **Instructor or above.**

---

#### `PATCH /api/v1/problem-sets/:id`

Update a problem set. Rate limit: `problem-sets:update`. Instructors can only edit their own.

---

#### `DELETE /api/v1/problem-sets/:id`

Delete a problem set. Rate limit: `problem-sets:delete`. Instructors can only delete their own.

---

#### `POST /api/v1/problem-sets/:id/groups`

Assign a problem set to groups. Rate limit: `problem-sets:assign`.

**Request Body:**
```json
{ "groupIds": ["id1", "id2"] }
```

---

#### `DELETE /api/v1/problem-sets/:id/groups`

Remove a problem set from a group. Rate limit: `problem-sets:unassign`.

**Request Body:**
```json
{ "groupId": "string" }
```

---

### Files

#### `POST /api/v1/files`

Upload a file. Rate limit: `files:upload`. Requires `files.upload` capability.

**Request:** `multipart/form-data` with a `file` field.

- Images are resized and optimized automatically.
- File size limits configured via system settings.

**Response (201):**
```json
{
  "data": {
    "id": "string",
    "url": "/api/v1/files/{id}",
    "originalName": "string",
    "mimeType": "string",
    "sizeBytes": 1024,
    "category": "image|attachment",
    "width": 800,
    "height": 600
  }
}
```

---

#### `GET /api/v1/files`

List files. Requires `files.manage` or `files.upload` capability.

| Query Param | Type | Description |
|-------------|------|-------------|
| `page` | number | Page number |
| `limit` | number | Items per page |
| `category` | string | `image`, `attachment`, or `all` |
| `search` | string | Search by filename |

Users without `files.manage` only see their own uploads.

---

#### `GET /api/v1/files/:id`

Serve a file. Returns binary content with appropriate headers.

- Images: `Content-Disposition: inline`
- Others: `Content-Disposition: attachment`
- Cached with `Cache-Control: public, max-age=31536000, immutable`
- Supports `ETag`/`If-None-Match` for `304 Not Modified`

---

#### `DELETE /api/v1/files/:id`

Delete a file. Rate limit: `files:delete`. Requires `files.manage` or ownership with `files.upload`.

---

#### `POST /api/v1/files/bulk-delete`

Bulk delete files. Rate limit: `files:bulk_delete`. Requires `files.manage`.

**Request Body:**
```json
{ "ids": ["id1", "id2"] }
```

**Response:**
```json
{ "data": { "deleted": 3 } }
```

---

### Languages

#### `GET /api/v1/languages`

List enabled judge languages. **No authentication required.** Response is cached for 5 minutes.

**Response:**
```json
{
  "data": [
    {
      "id": "string",
      "language": "string",
      "displayName": "string",
      "standard": "string",
      "extension": "string"
    }
  ]
}
```

---

### Tags

#### `GET /api/v1/tags`

Search tags. Requires authentication.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `q` | string | — | Search query (case-insensitive) |
| `limit` | number | 50 | Max 100 |

---

### Compiler

#### `POST /api/v1/compiler/run`

Execute code in a sandboxed Docker container. Rate limit: `compiler:run`. Requires `content.submit_solutions` capability.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `language` | string | Yes | Language identifier |
| `sourceCode` | string | Yes | 1-65536 chars |
| `stdin` | string | No | Max 65536 chars |

**Response:**
```json
{
  "data": {
    "stdout": "string",
    "stderr": "string",
    "exitCode": 0,
    "executionTimeMs": 42,
    "memoryUsedBytes": 8192
  }
}
```

---

### Judge Workers

These endpoints are authenticated via judge authorization (not user sessions). Used by judge worker processes.

#### `POST /api/v1/judge/register`

Register a new judge worker.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hostname` | string | Yes | 1-255 chars |
| `concurrency` | number | Yes | 1-64 |
| `version` | string | No | Max 64 chars |
| `labels` | string[] | No | Max 32 labels, 64 chars each |

**Response:**
```json
{
  "data": {
    "workerId": "string",
    "workerSecret": "string",
    "heartbeatIntervalMs": 30000,
    "staleClaimTimeoutMs": 300000
  }
}
```

---

#### `POST /api/v1/judge/heartbeat`

Send worker heartbeat. Validates per-worker secret.

**Request Body:**
```json
{
  "workerId": "string",
  "workerSecret": "string",
  "activeTasks": 2,
  "availableSlots": 2,
  "uptimeSeconds": 3600
}
```

---

#### `POST /api/v1/judge/claim`

Claim a pending submission for judging. Uses atomic SQL for race-condition-free claiming. Returns `null` when no submissions are available.

**Response:** Full submission object with test cases, language config, and Docker image info.

---

#### `POST /api/v1/judge/poll`

Report judging progress or final results.

**Request Body:**
```json
{
  "submissionId": "string",
  "claimToken": "string",
  "status": "string",
  "compileOutput": "string?",
  "results": [{ "status": "string" }]
}
```

For final statuses, the score and execution metrics are computed from results.

---

#### `POST /api/v1/judge/deregister`

Deregister a worker. Sets status to `offline` and clears active tasks.

---

### Admin: API Keys

#### `GET /api/v1/admin/api-keys`

List all API keys. **Admin only.**

---

#### `POST /api/v1/admin/api-keys`

Create an API key. **Admin only.** Rate limit: `api-keys:create`.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | 1-100 chars |
| `role` | string | Yes | Must be a valid role |
| `expiresAt` | string | No | ISO datetime, nullable |

Privilege escalation check: cannot create a key with higher privileges than your own.

**Response (201):**
```json
{
  "data": {
    "id": "string",
    "name": "string",
    "keyPrefix": "jk_xxxxx",
    "key": "jk_full_key_shown_once"
  }
}
```

---

#### `PATCH /api/v1/admin/api-keys/:id`

Update an API key. **Admin only.**

**Request Body (all optional):**
```json
{ "name": "string", "role": "string", "isActive": true, "expiresAt": "ISO8601|null" }
```

---

#### `DELETE /api/v1/admin/api-keys/:id`

Delete an API key. **Admin only.**

---

### Admin: Settings

#### `GET /api/v1/admin/settings`

Get system settings. **Admin only.**

---

#### `PUT /api/v1/admin/settings`

Update system settings. **Admin only.**

**Request Body (all optional):**
```json
{
  "siteTitle": "string",
  "siteDescription": "string",
  "timeZone": "string",
  "aiAssistantEnabled": true,
  "allowedHosts": ["string"]
}
```

Invalidates the settings cache on update.

---

### Admin: Roles

#### `GET /api/v1/admin/roles`

List all roles with user counts. Requires `users.manage_roles` capability.

---

#### `POST /api/v1/admin/roles`

Create a custom role. Requires `users.manage_roles` capability.

**Request Body:**
```json
{
  "name": "string",
  "displayName": "string",
  "description": "string?",
  "level": 50,
  "capabilities": ["problems.create", "submissions.view_all"]
}
```

Built-in role names are reserved.

---

#### `GET /api/v1/admin/roles/:id`

Get a single role with user count.

---

#### `PATCH /api/v1/admin/roles/:id`

Update a role. Cannot reduce `super_admin` capabilities or change built-in role levels.

---

#### `DELETE /api/v1/admin/roles/:id`

Delete a custom role. Cannot delete built-in roles or roles with assigned users.

---

### Admin: Languages

#### `GET /api/v1/admin/languages`

List all language configurations. **Admin only.**

---

#### `POST /api/v1/admin/languages`

Add a new language. **Admin only.** Rate limit: `languages:create`.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `language` | string | Yes | 1-50 chars, alphanumeric + underscore |
| `displayName` | string | Yes | 1-100 chars |
| `standard` | string | No | Max 50 chars |
| `extension` | string | Yes | 1-20 chars |
| `dockerImage` | string | Yes | 1-200 chars |
| `compiler` | string | No | Max 100 chars |
| `compileCommand` | string | No | Max 500 chars |
| `runCommand` | string | Yes | 1-500 chars |
| `dockerfile` | string | No | Max 10000 chars |

---

#### `GET /api/v1/admin/languages/:language`

Get a single language configuration. **Admin only.**

---

#### `PATCH /api/v1/admin/languages/:language`

Update a language. **Admin only.**

**Request Body (all optional):**
```json
{
  "dockerImage": "string",
  "compileCommand": "string|null",
  "runCommand": "string",
  "dockerfile": "string|null",
  "isEnabled": true
}
```

---

### Admin: Tags

#### `GET /api/v1/admin/tags`

List all tags with problem counts. **Admin only.**

---

#### `POST /api/v1/admin/tags`

Create a tag. **Admin only.** Rate limit: `tags:create`.

**Request Body:**
```json
{ "name": "string", "color": "string?" }
```

---

#### `PATCH /api/v1/admin/tags/:id`

Update a tag. **Admin only.**

---

#### `DELETE /api/v1/admin/tags/:id`

Delete a tag. **Admin only.**

---

### Admin: Workers

#### `GET /api/v1/admin/workers`

List all judge workers with status. Requires `system.settings` capability.

**Response fields per worker:** `id`, `hostname`, `alias`, `ipAddress`, `concurrency`, `activeTasks`, `version`, `labels`, `status` (`online`/`stale`/`offline`), `registeredAt`, `lastHeartbeatAt`, `deregisteredAt`.

---

#### `PATCH /api/v1/admin/workers/:id`

Update worker alias. Requires `system.settings` capability.

**Request Body:**
```json
{ "alias": "string|null" }
```

---

#### `DELETE /api/v1/admin/workers/:id`

Remove a worker. Requires `system.settings` capability. Automatically reclaims in-flight submissions back to pending status.

---

#### `GET /api/v1/admin/workers/stats`

Aggregated worker statistics. Requires `system.settings` capability.

**Response:**
```json
{
  "data": {
    "workersOnline": 3,
    "workersStale": 0,
    "workersOffline": 1,
    "queueDepth": 5,
    "activeJudging": 2,
    "totalConcurrency": 12
  }
}
```

---

### Admin: Docker Images

#### `GET /api/v1/admin/docker/images`

List Docker images. **Admin or Super Admin.**

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `filter` | string | `judge-*` | Image filter pattern |

Returns images, disk usage info, and stale image detection.

---

#### `POST /api/v1/admin/docker/images`

Pull a Docker image. **Super Admin only.**

**Request Body:**
```json
{ "imageTag": "judge-python:latest" }
```

Only `judge-*` images are allowed.

---

#### `DELETE /api/v1/admin/docker/images`

Remove a Docker image. **Super Admin only.**

**Request Body:**
```json
{ "imageTag": "judge-python:latest" }
```

---

#### `POST /api/v1/admin/docker/images/build`

Build a Docker image for a language. **Admin or Super Admin.**

**Request Body:**
```json
{ "language": "python3" }
```

---

#### `POST /api/v1/admin/docker/images/prune`

Remove stale images (where Dockerfile is newer than the built image). **Super Admin only.**

**Response:**
```json
{ "data": { "removed": ["judge-python:latest"], "errors": [], "removedCount": 1 } }
```

---

### Admin: Plugins

#### `GET /api/v1/admin/plugins`

List all plugins. **Admin only.**

---

#### `GET /api/v1/admin/plugins/:id`

Get a plugin with its default config. **Admin only.**

---

#### `PATCH /api/v1/admin/plugins/:id`

Update plugin config or enable/disable. **Admin only.**

**Request Body (all optional):**
```json
{ "enabled": true, "config": { ... } }
```

Config is validated against the plugin's Zod schema. Sensitive keys are redacted in audit logs.

---

### Admin: Logs

#### `GET /api/v1/admin/audit-logs`

Query audit events. **Admin only.**

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 50 | 1-100 |
| `resource` | string | — | Filter by resource type |
| `search` | string | — | Search action, resourceId, label, summary |
| `actorId` | string | — | Filter by actor |

Valid resource types: `system_settings`, `user`, `problem`, `group`, `group_member`, `assignment`, `submission`, `api_key`, `role`, `tag`, `language_config`, `plugin`.

---

#### `GET /api/v1/admin/login-logs`

Query login events. **Admin only.**

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 50 | 1-100 |
| `outcome` | string | — | `success`, `invalid_credentials`, `rate_limited`, `policy_denied` |
| `search` | string | — | Search identifier, username, name, IP |

---

#### `GET /api/v1/admin/chat-logs`

Query AI chat sessions and messages. **Admin only.**

| Query Param | Type | Description |
|-------------|------|-------------|
| `userId` | string | Filter by user |
| `sessionId` | string | Get messages for a specific session |
| `page` | number | Page number |

When `sessionId` is provided, returns messages. Otherwise returns session list.

---

### Admin: Backup & Restore

#### `POST /api/v1/admin/backup`

Create a database backup. Requires the `system.backup` capability. Rate limit: `admin:backup`.

**Request Body:**
```json
{ "password": "string" }
```

Password re-confirmation required for security. Returns a streamed JSON export for the PostgreSQL runtime.

**Query params:**
- `includeFiles=true` — return a ZIP archive containing `database.json` plus uploaded files
- omitted / `false` — return a JSON export only

---

#### `POST /api/v1/admin/restore`

Restore from backup. Requires the `system.backup` capability. Rate limit: `admin:restore`.

**Request:** `multipart/form-data` with `file` and `password` fields. Max 100 MB.

Accepts either a JudgeKit JSON export or a ZIP backup archive (`database.json` + `uploads/`). ZIP backups include a checksum manifest and are integrity-checked before import.

Portable sanitized exports are rejected here. Use a full-fidelity backup for disaster recovery restores.

---

### Admin: Migration

#### `POST /api/v1/admin/migrate/validate`

Validate a JudgeKit export file. Requires the `system.backup` capability.

Accepts `application/json` or `multipart/form-data`.

**Response:**
```json
{
  "data": {
    "valid": true,
    "sourceDialect": "postgresql",
    "exportedAt": "ISO8601",
    "redactionMode": "full-fidelity",
    "restorable": true,
    "tableCount": 15,
    "totalRows": 1000,
    "tables": { "users": 50, "problems": 30 }
  }
}
```

---

#### `POST /api/v1/admin/migrate/export`

Export the entire database as JSON. Requires the `system.backup` capability. Rate limit: `admin:migrate-export`.

**Request Body:**
```json
{ "password": "string" }
```

Password re-confirmation required. Returns a JSON file download.

Sanitized exports include `redactionMode: "sanitized"` metadata and are intended for sharing or migration testing, not disaster-recovery restore.

---

#### `POST /api/v1/admin/migrate/import`

Import a JudgeKit export. Requires the `system.backup` capability. Rate limit: `admin:migrate-import`. Max 100 MB.

**Response:**
```json
{
  "data": {
    "success": true,
    "tablesImported": 15,
    "totalRowsImported": 1000,
    "tableResults": { ... }
  }
}
```

---

### Plugins: Chat Widget

#### `POST /api/v1/plugins/chat-widget/chat`

Send a message to the AI assistant. Session auth only (no API keys). Rate limited per provider configuration.

**Request Body:**
```json
{
  "messages": [{ "role": "user|assistant", "content": "string" }],
  "context": {
    "problemId": "string?",
    "assignmentId": "string?",
    "editorCode": "string?",
    "editorLanguage": "string?",
    "sessionId": "string?"
  }
}
```

Messages max 50, content max 10000 chars, editor code max 100KB.

Requires AI assistant to be enabled globally and per-problem (if problem context provided).
Only the authoritative latest user message and the server-generated assistant reply are persisted.

**Response:** Streaming `text/plain` with `X-Chat-Session-Id` header.

---

#### `POST /api/v1/plugins/chat-widget/test-connection`

Test an AI provider connection. **Admin or Super Admin.**

**Request Body:**
```json
{ "provider": "openai|claude|gemini", "apiKey": "string", "model": "string" }
```

**Response:**
```json
{ "data": { "success": true } }
```

---

### Internal

#### `POST /api/internal/cleanup`

Internal cleanup cron endpoint. Requires `CRON_SECRET` bearer token (not user auth).

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "$BASE_URL/api/internal/cleanup"
```

Returns `401 Unauthorized` for any request without a valid bearer token. As with `/api/metrics`, the missing-config branch is silent on the wire (logged server-side only) so anonymous probers do not learn the env-var name.

---

#### `POST /api/v1/test/seed`

E2E test seeding endpoint. Only available when `PLAYWRIGHT_AUTH_TOKEN` is set. Returns `404` otherwise.

**Actions:** `create_user` (prefix: `e2e-`), `create_problem` (prefix: `[E2E]`), `cleanup`.

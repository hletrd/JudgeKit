# Integration Tests

Integration tests exercise the full API request pipeline with a real database, without a browser.

## Key Characteristics

- Use a real **PostgreSQL** database (the production runtime) — or SQLite for lightweight local iteration where PG is unavailable
- Call Next.js route handlers directly via crafted `NextRequest` objects
- Assert on both HTTP response status/body and database state
- Each test suite gets a fresh database (created in `beforeAll`, torn down in `afterAll`)
- Support utilities provide seed helpers for users, problems, test cases, submissions, groups, enrollments, assignments, and more

## Running

```bash
npm run test:integration
```

Set `hasPostgresIntegrationSupport` (from `tests/integration/support/`) to run Postgres-specific tests when a local PG instance is available.

## Structure

```
tests/integration/
  README.md              # this file
  support/               # shared DB helpers (createTestDb, seed*, etc.)
  api/
    health.test.ts       # DB schema & basic CRUD
  db/
    submission-lifecycle.test.ts  # submission create, status transitions, results
    user-crud.test.ts             # user lifecycle (CRUD)
```

## Database Setup Pattern

```typescript
import { createTestDb } from "../support";

let testDb: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  testDb = await createTestDb();
});

afterAll(async () => {
  await testDb.cleanup();
});
```

Each `createTestDb()` call returns a fresh isolated database instance with the full Drizzle schema applied.

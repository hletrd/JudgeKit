# Integration Tests

Integration tests exercise the full API request pipeline with a real SQLite database, without a browser.

## Key Characteristics

- Use a real SQLite database (not mocks) — either in-memory (`:memory:`) or a temp file
- Call Next.js route handlers directly via crafted `NextRequest` objects
- Assert on both HTTP response status/body and database state
- Each test suite gets a fresh database (created in `beforeAll`, torn down in `afterAll`)

## Running

```bash
npm run test:integration
```

## Structure

```
tests/integration/
  README.md          # this file
  setup.ts           # shared DB helpers (createTestDb, seedUser, etc.)
  api/
    health.test.ts   # GET /api/health
  submissions.test.ts
  users.test.ts
```

## Database Setup Pattern

```typescript
import { createTestDb } from "../setup";

let db: ReturnType<typeof createTestDb>;

beforeAll(() => {
  db = createTestDb();
});

afterAll(() => {
  db.sqlite.close();
});
```

Each `createTestDb()` call returns a fresh in-memory SQLite instance with the full Drizzle schema applied via migrations.

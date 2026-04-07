import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted mocks ──────────────────────────────────────────────────────────────
const {
  getApiUserMock,
  csrfForbiddenMock,
  consumeApiRateLimitMock,
  recordAuditEventMock,
  isUsernameTakenMock,
  isEmailTakenMock,
  validateAndHashPasswordMock,
  dbSelectMock,
  dbInsertMock,
  dbUpdateMock,
  dbDeleteMock,
  dbQueryUsersFindFirstMock,
  resolveCapabilitiesMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  csrfForbiddenMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  isUsernameTakenMock: vi.fn(),
  isEmailTakenMock: vi.fn(),
  validateAndHashPasswordMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbDeleteMock: vi.fn(),
  dbQueryUsersFindFirstMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: csrfForbiddenMock,
  unauthorized: () =>
    new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
  forbidden: () =>
    new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
  notFound: (resource: string) =>
    new Response(JSON.stringify({ error: "notFound", resource }), {
      status: 404,
    }),
  isAdmin: (role: string) =>
    role === "admin" || role === "super_admin",
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/users/core", () => ({
  isUsernameTaken: isUsernameTakenMock,
  isEmailTaken: isEmailTakenMock,
  validateAndHashPassword: validateAndHashPasswordMock,
  validateRoleChange: vi.fn(() => null),
}));

vi.mock("nanoid", () => ({
  nanoid: () => "test-nanoid-id",
}));

vi.mock("@/lib/security/password-hash", () => ({
  hashPassword: vi.fn(() => Promise.resolve("hashed-password")),
}));

vi.mock("@/lib/auth/generated-password", () => ({
  generateSecurePassword: vi.fn(() => "Generated@Password1"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

// Build a chainable drizzle-like mock for select queries
function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    then: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.offset.mockReturnValue(rows);
  // Allow .then() chaining (Promise-like)
  chain.then.mockImplementation((cb: (v: unknown) => unknown) =>
    Promise.resolve(cb(rows))
  );
  return chain;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    insert: dbInsertMock,
    update: dbUpdateMock,
    delete: dbDeleteMock,
    query: {
      users: {
        findFirst: dbQueryUsersFindFirstMock,
      },
    },
  },
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
  invalidateRoleCache: vi.fn(),
  getRoleLevel: vi.fn().mockResolvedValue(0),
  isValidRole: vi.fn().mockResolvedValue(true),
}));

beforeEach(() => {
  resolveCapabilitiesMock.mockImplementation(async (role: string) => {
    const { DEFAULT_ROLE_CAPABILITIES } = await import("@/lib/capabilities/defaults");
    const caps = DEFAULT_ROLE_CAPABILITIES[role as keyof typeof DEFAULT_ROLE_CAPABILITIES];
    return new Set(caps ?? []);
  });
});

// ── Fixtures ───────────────────────────────────────────────────────────────────

const adminUser = {
  id: "admin-id",
  username: "admin",
  role: "admin" as const,
  email: "admin@example.com",
  name: "Admin User",
  className: null,
  mustChangePassword: false,
};

const superAdminUser = {
  id: "superadmin-id",
  username: "superadmin",
  role: "super_admin" as const,
  email: "superadmin@example.com",
  name: "Super Admin",
  className: null,
  mustChangePassword: false,
};

const studentUser = {
  id: "student-id",
  username: "student1",
  role: "student" as const,
  email: "student@example.com",
  name: "Student One",
  className: "Class A",
  mustChangePassword: false,
};

const safeUser = {
  id: "student-id",
  username: "student1",
  role: "student" as const,
  email: "student@example.com",
  name: "Student One",
  className: "Class A",
  isActive: true,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

function makeRequest(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
) {
  return new NextRequest(url, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": "valid-csrf",
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

// ── Tests: GET /api/v1/users ───────────────────────────────────────────────────

describe("GET /api/v1/users", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    csrfForbiddenMock.mockReturnValue(null);
    consumeApiRateLimitMock.mockReturnValue(null);
    validateAndHashPasswordMock.mockResolvedValue({ hash: "hashed" });
    isUsernameTakenMock.mockResolvedValue(false);
    isEmailTakenMock.mockResolvedValue(false);

    ({ GET } = await import("@/app/api/v1/users/route"));
  });

  it("returns user list for admin", async () => {
    getApiUserMock.mockResolvedValue(adminUser);

    // First select call → count, second → results
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([{ count: 2 }]))
      .mockReturnValueOnce(makeSelectChain([safeUser]));

    const req = makeRequest("http://localhost:3000/api/v1/users");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ username: "student1" }),
      ]),
      page: 1,
      total: 2,
    });
  });

  it("rejects non-admin with 403", async () => {
    getApiUserMock.mockResolvedValue(studentUser);

    const req = makeRequest("http://localhost:3000/api/v1/users");
    const res = await GET(req);

    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    getApiUserMock.mockResolvedValue(null);

    const req = makeRequest("http://localhost:3000/api/v1/users");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("pagination works correctly — respects page and limit params", async () => {
    getApiUserMock.mockResolvedValue(adminUser);

    const countChain = makeSelectChain([{ count: 50 }]);
    const resultsChain = makeSelectChain([safeUser]);
    dbSelectMock
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(resultsChain);

    const req = makeRequest(
      "http://localhost:3000/api/v1/users?page=3&limit=10"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.page).toBe(3);
    expect(body.limit).toBe(10);
    expect(body.total).toBe(50);
    // offset = (3-1)*10 = 20 — chain.offset was called with 20
    expect(resultsChain.offset).toHaveBeenCalledWith(20);
  });

  it("rejects invalid role filter with 400", async () => {
    getApiUserMock.mockResolvedValue(adminUser);

    const req = makeRequest(
      "http://localhost:3000/api/v1/users?role=hacker"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("invalidRole");
  });
});

// ── Tests: POST /api/v1/users ──────────────────────────────────────────────────

describe("POST /api/v1/users", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    csrfForbiddenMock.mockReturnValue(null);
    consumeApiRateLimitMock.mockReturnValue(null);
    validateAndHashPasswordMock.mockResolvedValue({ hash: "hashed" });
    isUsernameTakenMock.mockResolvedValue(false);
    isEmailTakenMock.mockResolvedValue(false);

    ({ POST } = await import("@/app/api/v1/users/route"));
  });

  it("creates user with valid data and returns 201", async () => {
    getApiUserMock.mockResolvedValue(adminUser);

    const insertChain = {
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([safeUser]),
      }),
    };
    dbInsertMock.mockReturnValue(insertChain);

    const req = makeRequest("http://localhost:3000/api/v1/users", {
      method: "POST",
      body: {
        username: "newstudent",
        name: "New Student",
        role: "student",
      },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data).toMatchObject({
      user: expect.objectContaining({ username: "student1" }),
    });
    expect(dbInsertMock).toHaveBeenCalled();
    expect(recordAuditEventMock).toHaveBeenCalled();
  });

  it("rejects duplicate username with 409", async () => {
    getApiUserMock.mockResolvedValue(adminUser);
    isUsernameTakenMock.mockResolvedValue(true);

    const req = makeRequest("http://localhost:3000/api/v1/users", {
      method: "POST",
      body: {
        username: "existinguser",
        name: "Existing User",
        role: "student",
      },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("usernameInUse");
  });

  it("rejects duplicate email with 409", async () => {
    getApiUserMock.mockResolvedValue(adminUser);
    isUsernameTakenMock.mockResolvedValue(false);
    isEmailTakenMock.mockResolvedValue(true);

    const req = makeRequest("http://localhost:3000/api/v1/users", {
      method: "POST",
      body: {
        username: "uniqueuser",
        name: "Unique User",
        email: "taken@example.com",
        role: "student",
      },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("emailInUse");
  });

  it("rejects non-admin with 403", async () => {
    getApiUserMock.mockResolvedValue(studentUser);

    const req = makeRequest("http://localhost:3000/api/v1/users", {
      method: "POST",
      body: { username: "newuser", name: "New", role: "student" },
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("rejects missing CSRF with 403", async () => {
    csrfForbiddenMock.mockReturnValue(
      new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })
    );

    const req = makeRequest("http://localhost:3000/api/v1/users", {
      method: "POST",
      body: { username: "newuser", name: "New", role: "student" },
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});

// ── Tests: GET /api/v1/users/[id] ─────────────────────────────────────────────

describe("GET /api/v1/users/[id]", () => {
  let GET: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    csrfForbiddenMock.mockReturnValue(null);
    consumeApiRateLimitMock.mockReturnValue(null);

    ({ GET } = await import("@/app/api/v1/users/[id]/route"));
  });

  const makeCtx = (id: string) => ({
    params: Promise.resolve({ id }),
  });

  it("returns user detail for admin", async () => {
    getApiUserMock.mockResolvedValue(adminUser);
    dbSelectMock.mockReturnValue(makeSelectChain([safeUser]));

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/student-id"
    );
    const res = await GET(req, makeCtx("student-id"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ username: "student1" });
  });

  it("allows user to fetch their own record", async () => {
    getApiUserMock.mockResolvedValue(studentUser);
    dbSelectMock.mockReturnValue(makeSelectChain([safeUser]));

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/student-id"
    );
    const res = await GET(req, makeCtx("student-id"));

    expect(res.status).toBe(200);
  });

  it("returns 403 when non-admin fetches another user", async () => {
    getApiUserMock.mockResolvedValue(studentUser);

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/other-user-id"
    );
    const res = await GET(req, makeCtx("other-user-id"));

    expect(res.status).toBe(403);
  });

  it("returns 404 when user not found", async () => {
    getApiUserMock.mockResolvedValue(adminUser);
    dbSelectMock.mockReturnValue(makeSelectChain([]));

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/nonexistent-id"
    );
    const res = await GET(req, makeCtx("nonexistent-id"));

    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    getApiUserMock.mockResolvedValue(null);

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/student-id"
    );
    const res = await GET(req, makeCtx("student-id"));

    expect(res.status).toBe(401);
  });
});

// ── Tests: PATCH /api/v1/users/[id] ───────────────────────────────────────────

describe("PATCH /api/v1/users/[id]", () => {
  let PATCH: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    csrfForbiddenMock.mockReturnValue(null);
    consumeApiRateLimitMock.mockReturnValue(null);
    isUsernameTakenMock.mockResolvedValue(false);
    isEmailTakenMock.mockResolvedValue(false);
    validateAndHashPasswordMock.mockResolvedValue({ hash: "new-hashed" });

    ({ PATCH } = await import("@/app/api/v1/users/[id]/route"));
  });

  const makeCtx = (id: string) => ({
    params: Promise.resolve({ id }),
  });

  it("admin can update user name", async () => {
    getApiUserMock.mockResolvedValue(adminUser);

    const updatedUser = { ...safeUser, name: "Updated Name" };
    // First select → findSafeUserById (found), second → after update
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([safeUser]))
      .mockReturnValueOnce(makeSelectChain([updatedUser]));

    const updateChain = { set: vi.fn() };
    updateChain.set.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    dbUpdateMock.mockReturnValue(updateChain);

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/student-id",
      { method: "PATCH", body: { name: "Updated Name" } }
    );
    const res = await PATCH(req, makeCtx("student-id"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ name: "Updated Name" });
    expect(recordAuditEventMock).toHaveBeenCalled();
  });

  it("admin can update username", async () => {
    getApiUserMock.mockResolvedValue(adminUser);
    isUsernameTakenMock.mockResolvedValue(false);

    const updatedUser = { ...safeUser, username: "renameduser" };
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([safeUser]))
      .mockReturnValueOnce(makeSelectChain([updatedUser]));

    const updateChain = {
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    };
    dbUpdateMock.mockReturnValue(updateChain);

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/student-id",
      { method: "PATCH", body: { username: "renameduser" } }
    );
    const res = await PATCH(req, makeCtx("student-id"));

    expect(res.status).toBe(200);
  });

  it("rejects username change attempted by non-admin", async () => {
    getApiUserMock.mockResolvedValue(studentUser);
    dbSelectMock.mockReturnValue(makeSelectChain([safeUser]));

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/student-id",
      { method: "PATCH", body: { username: "hackedname" } }
    );
    const res = await PATCH(req, makeCtx("student-id"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("usernameChangeNotAllowed");
  });

  it("returns 409 when new username is already taken", async () => {
    getApiUserMock.mockResolvedValue(adminUser);
    isUsernameTakenMock.mockResolvedValue(true);
    dbSelectMock.mockReturnValue(makeSelectChain([safeUser]));

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/student-id",
      { method: "PATCH", body: { username: "takenname" } }
    );
    const res = await PATCH(req, makeCtx("student-id"));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("usernameInUse");
  });

  it("returns 404 when target user not found", async () => {
    getApiUserMock.mockResolvedValue(adminUser);
    dbSelectMock.mockReturnValue(makeSelectChain([]));

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/ghost-id",
      { method: "PATCH", body: { name: "Ghost" } }
    );
    const res = await PATCH(req, makeCtx("ghost-id"));

    expect(res.status).toBe(404);
  });

  it("admin can clear mustChangePassword for a user", async () => {
    getApiUserMock.mockResolvedValue(adminUser);

    const updatedUser = { ...safeUser, mustChangePassword: false };
    dbSelectMock
      .mockReturnValueOnce(makeSelectChain([{ ...safeUser, mustChangePassword: true }]))
      .mockReturnValueOnce(makeSelectChain([updatedUser]));

    const whereMock = vi.fn().mockResolvedValue(undefined);
    const setMock = vi.fn(() => ({ where: whereMock }));
    dbUpdateMock.mockReturnValue({ set: setMock });

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/student-id",
      { method: "PATCH", body: { mustChangePassword: false } }
    );
    const res = await PATCH(req, makeCtx("student-id"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.mustChangePassword).toBe(false);
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({
      mustChangePassword: false,
      tokenInvalidatedAt: expect.any(Date),
    }));
  });

  it("rejects CSRF-less mutation", async () => {
    csrfForbiddenMock.mockReturnValue(
      new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })
    );

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/student-id",
      { method: "PATCH", body: { name: "Attacker" } }
    );
    const res = await PATCH(req, makeCtx("student-id"));

    expect(res.status).toBe(403);
  });
});

// ── Tests: DELETE /api/v1/users/[id] ──────────────────────────────────────────

describe("DELETE /api/v1/users/[id]", () => {
  let DELETE: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    csrfForbiddenMock.mockReturnValue(null);
    consumeApiRateLimitMock.mockReturnValue(null);

    ({ DELETE } = await import("@/app/api/v1/users/[id]/route"));
  });

  const makeCtx = (id: string) => ({
    params: Promise.resolve({ id }),
  });

  it("soft-deletes (deactivates) user for admin", async () => {
    getApiUserMock.mockResolvedValue(adminUser);
    dbSelectMock.mockReturnValue(makeSelectChain([safeUser]));

    const updateChain = {
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    };
    dbUpdateMock.mockReturnValue(updateChain);

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/student-id",
      { method: "DELETE" }
    );
    const res = await DELETE(req, makeCtx("student-id"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ id: "student-id", isActive: false });
    expect(dbUpdateMock).toHaveBeenCalled();
    expect(recordAuditEventMock).toHaveBeenCalled();
  });

  it("permanently deletes with ?permanent=true and username confirmation", async () => {
    getApiUserMock.mockResolvedValue(superAdminUser);
    dbSelectMock.mockReturnValue(makeSelectChain([safeUser]));

    const deleteChain = { where: vi.fn().mockResolvedValue(undefined) };
    dbDeleteMock.mockReturnValue(deleteChain);

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/student-id?permanent=true",
      {
        method: "DELETE",
        body: { confirmUsername: "student1" },
      }
    );
    const res = await DELETE(req, makeCtx("student-id"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ id: "student-id", deleted: true });
    expect(dbDeleteMock).toHaveBeenCalled();
    expect(recordAuditEventMock).toHaveBeenCalled();
  });

  it("rejects permanent delete without username confirmation", async () => {
    getApiUserMock.mockResolvedValue(superAdminUser);
    dbSelectMock.mockReturnValue(makeSelectChain([safeUser]));

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/student-id?permanent=true",
      {
        method: "DELETE",
        body: { confirmUsername: "wrongname" },
      }
    );
    const res = await DELETE(req, makeCtx("student-id"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("confirmUsernameRequired");
  });

  it("returns 403 when admin tries to delete themselves", async () => {
    const selfAdmin = { ...adminUser, id: "self-admin-id" };
    getApiUserMock.mockResolvedValue(selfAdmin);
    dbSelectMock.mockReturnValue(
      makeSelectChain([{ ...safeUser, id: "self-admin-id", username: "admin" }])
    );

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/self-admin-id",
      { method: "DELETE" }
    );
    const res = await DELETE(req, makeCtx("self-admin-id"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("cannotDeactivateSelf");
  });

  it("returns 403 when deleting a super_admin", async () => {
    getApiUserMock.mockResolvedValue(adminUser);
    dbSelectMock.mockReturnValue(
      makeSelectChain([{ ...safeUser, id: "sa-id", role: "super_admin", username: "sa" }])
    );

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/sa-id",
      { method: "DELETE" }
    );
    const res = await DELETE(req, makeCtx("sa-id"));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("cannotDeactivateSuperAdmin");
  });

  it("returns 403 for non-admin", async () => {
    getApiUserMock.mockResolvedValue(studentUser);

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/other-id",
      { method: "DELETE" }
    );
    const res = await DELETE(req, makeCtx("other-id"));

    expect(res.status).toBe(403);
  });

  it("returns 404 when user not found", async () => {
    getApiUserMock.mockResolvedValue(adminUser);
    dbSelectMock.mockReturnValue(makeSelectChain([]));

    const req = makeRequest(
      "http://localhost:3000/api/v1/users/ghost-id",
      { method: "DELETE" }
    );
    const res = await DELETE(req, makeCtx("ghost-id"));

    expect(res.status).toBe(404);
  });
});

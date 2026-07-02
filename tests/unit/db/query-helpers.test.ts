import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Query Helpers", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("nowMs returns the PostgreSQL expression", async () => {
    vi.doMock("@/lib/db/index", () => ({ pool: null }));
    const { nowMs } = await import("@/lib/db/queries");
    expect(nowMs()).toBe("(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint");
  });

  it("deterministicOrder defaults to the id column", async () => {
    vi.doMock("@/lib/db/index", () => ({ pool: null }));
    const { deterministicOrder } = await import("@/lib/db/queries");
    expect(deterministicOrder()).toBe("id ASC");
  });

  it("deterministicOrder uses a custom column name when provided", async () => {
    vi.doMock("@/lib/db/index", () => ({ pool: null }));
    const { deterministicOrder } = await import("@/lib/db/queries");
    expect(deterministicOrder("submission_id")).toBe("submission_id ASC");
  });

  it("countTablesQuery targets PostgreSQL information_schema", async () => {
    vi.doMock("@/lib/db/index", () => ({ pool: null }));
    const { countTablesQuery } = await import("@/lib/db/queries");
    expect(countTablesQuery()).toContain("information_schema.tables");
    expect(countTablesQuery()).toContain("table_schema = 'public'");
  });

  it("rawQueryOne converts named params to positional parameters", async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [{ id: "1" }] });
    vi.doMock("@/lib/db/index", () => ({ pool: { query: mockQuery }, transactionContext: { getStore: () => undefined } }));
    const { rawQueryOne } = await import("@/lib/db/queries");
    const result = await rawQueryOne("SELECT * FROM users WHERE id = @id", { id: "1" });
    expect(mockQuery).toHaveBeenCalledWith("SELECT * FROM users WHERE id = $1", ["1"]);
    expect(result).toEqual({ id: "1" });
  });

  it("rawQueryOne reuses the same positional index for repeated named params", async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [{ id: "1" }] });
    vi.doMock("@/lib/db/index", () => ({ pool: { query: mockQuery }, transactionContext: { getStore: () => undefined } }));
    const { rawQueryOne } = await import("@/lib/db/queries");
    await rawQueryOne("SELECT * FROM users WHERE id = @id OR manager_id = @id", { id: "1" });
    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT * FROM users WHERE id = $1 OR manager_id = $1",
      ["1"]
    );
  });

  it("rawQueryOne skips parameter replacement inside string literals with escaped quotes", async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [{ id: "1" }] });
    vi.doMock("@/lib/db/index", () => ({ pool: { query: mockQuery }, transactionContext: { getStore: () => undefined } }));
    const { rawQueryOne } = await import("@/lib/db/queries");
    await rawQueryOne("SELECT * FROM users WHERE name = 'it''s @email here' AND id = @id", { id: "1" });
    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT * FROM users WHERE name = 'it''s @email here' AND id = $1",
      ["1"]
    );
  });

  it("rawQueryOne routes through the transaction client when inside execTransaction", async () => {
    const txExecute = vi.fn().mockResolvedValue({ rows: [{ id: "1" }] });
    const tx = { execute: txExecute };
    vi.doMock("@/lib/db/index", () => ({ pool: null, transactionContext: { getStore: () => tx } }));
    const { rawQueryOne } = await import("@/lib/db/queries");
    const result = await rawQueryOne("SELECT * FROM users WHERE id = @id", { id: "1" });
    expect(txExecute).toHaveBeenCalledOnce();
    expect(result).toEqual({ id: "1" });
    // Ensure the global pool was not used
    expect(txExecute).not.toHaveBeenCalledWith("SELECT * FROM users WHERE id = $1", ["1"]);
  });

  it("rawQueryOne does not use the pool when a transaction client is active", async () => {
    const mockQuery = vi.fn();
    const txExecute = vi.fn().mockResolvedValue({ rows: [{ id: "1" }] });
    const tx = { execute: txExecute };
    vi.doMock("@/lib/db/index", () => ({ pool: { query: mockQuery }, transactionContext: { getStore: () => tx } }));
    const { rawQueryOne } = await import("@/lib/db/queries");
    await rawQueryOne("SELECT * FROM users WHERE id = @id", { id: "1" });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rawQueryOne fails closed when a named SQL parameter is missing", async () => {
    const mockQuery = vi.fn();
    vi.doMock("@/lib/db/index", () => ({ pool: { query: mockQuery }, transactionContext: { getStore: () => undefined } }));
    const { rawQueryOne } = await import("@/lib/db/queries");

    await expect(rawQueryOne("SELECT * FROM users WHERE id = @id AND role = @role", { id: "1" })).rejects.toThrow(
      "Missing SQL parameter: role"
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rawQueryOne throws when the PostgreSQL pool is missing and no transaction is active", async () => {
    vi.doMock("@/lib/db/index", () => ({ pool: null, transactionContext: { getStore: () => undefined } }));
    const { rawQueryOne } = await import("@/lib/db/queries");
    await expect(rawQueryOne("SELECT 1")).rejects.toThrow("PostgreSQL pool not available");
  });

  it("rawQueryAll returns all rows for PostgreSQL", async () => {
    const rows = [{ id: "1" }, { id: "2" }];
    const mockQuery = vi.fn().mockResolvedValue({ rows });
    vi.doMock("@/lib/db/index", () => ({ pool: { query: mockQuery }, transactionContext: { getStore: () => undefined } }));
    const { rawQueryAll } = await import("@/lib/db/queries");
    const result = await rawQueryAll("SELECT * FROM users WHERE team_id = @teamId", { teamId: "t-1" });
    expect(mockQuery).toHaveBeenCalledWith("SELECT * FROM users WHERE team_id = $1", ["t-1"]);
    expect(result).toEqual(rows);
  });

  it("rawQueryAll routes through the transaction client when inside execTransaction", async () => {
    const txExecute = vi.fn().mockResolvedValue({ rows: [{ id: "1" }, { id: "2" }] });
    const tx = { execute: txExecute };
    vi.doMock("@/lib/db/index", () => ({ pool: null, transactionContext: { getStore: () => tx } }));
    const { rawQueryAll } = await import("@/lib/db/queries");
    const result = await rawQueryAll("SELECT * FROM users WHERE team_id = @teamId", { teamId: "t-1" });
    expect(txExecute).toHaveBeenCalledOnce();
    expect(result).toEqual([{ id: "1" }, { id: "2" }]);
  });

  it("rawQueryAll fails closed when a named SQL parameter is missing", async () => {
    const mockQuery = vi.fn();
    vi.doMock("@/lib/db/index", () => ({ pool: { query: mockQuery }, transactionContext: { getStore: () => undefined } }));
    const { rawQueryAll } = await import("@/lib/db/queries");

    await expect(rawQueryAll("SELECT * FROM users WHERE team_id = @teamId AND role = @role", { teamId: "t-1" })).rejects.toThrow(
      "Missing SQL parameter: role"
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("getActiveDialect always returns postgresql", async () => {
    vi.doMock("@/lib/db/index", () => ({ pool: null }));
    const { getActiveDialect } = await import("@/lib/db/queries");
    expect(getActiveDialect()).toBe("postgresql");
  });
});

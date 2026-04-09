import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "judge-worker-rs/src/main.rs"), "utf8");

describe("judge worker runtime loops", () => {
  it("does not hard-code a 30 second heartbeat sleep", () => {
    expect(source).not.toContain("tokio::time::sleep(std::time::Duration::from_secs(30))");
    expect(source).toContain("tokio::time::sleep(heartbeat_interval)");
  });

  it("uses elapsed-time cleanup scheduling instead of an idle-loop counter", () => {
    expect(source).not.toContain("cleanup_counter");
    expect(source).toContain("last_cleanup_at.elapsed() >= cleanup_interval");
  });
});

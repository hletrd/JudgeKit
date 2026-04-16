import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const RUNNER_PATH = join(process.cwd(), "docker/output-only/runner.mjs");

function runRunner(mode: string, source: string, extension: string) {
  const dir = mkdtempSync(join(tmpdir(), "judge-output-runner-"));
  const sourcePath = join(dir, `solution${extension}`);

  try {
    writeFileSync(sourcePath, source, "utf8");
    return spawnSync(process.execPath, [RUNNER_PATH, mode, sourcePath], {
      encoding: "utf8",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("output-only judge runner", () => {
  it("echoes plaintext submissions verbatim", () => {
    const result = runRunner("plaintext", "hello\njudgekit", ".txt");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("hello\njudgekit");
    expect(result.stderr).toBe("");
  });

  it("extracts literal Verilog $display and $write output while ignoring comments", () => {
    const result = runRunner(
      "verilog",
      `// $display("ignored");
module solution;
initial begin
  $write("Hello");
  /* $display("still ignored"); */
  $display(", world!");
end
endmodule
`,
      ".v"
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("Hello, world!\n");
  });

  it("supports SystemVerilog through the same literal display extraction", () => {
    const result = runRunner(
      "systemverilog",
      `module solution;
initial begin
  $display("sum=3");
  $strobe("done");
end
endmodule
`,
      ".sv"
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("sum=3\ndone\n");
  });

  it("extracts literal VHDL report output", () => {
    const result = runRunner(
      "vhdl",
      `architecture beh of solution is
begin
  process
  begin
    -- report "ignored";
    report "Hello";
    report " ""JudgeKit"" ";
    wait;
  end process;
end architecture;
`,
      ".vhd"
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("Hello\n \"JudgeKit\" \n");
  });

  it("fails clearly when no supported HDL output statement is present", () => {
    const result = runRunner(
      "verilog",
      `module solution;
initial begin
  $monitor("not supported");
end
endmodule
`,
      ".v"
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("literal $display/$write/$strobe");
  });
});

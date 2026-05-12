export interface CompilerRunOptions {
  /** Source code to compile/run */
  sourceCode: string;
  /** Stdin to feed to the program */
  stdin: string;
  /** Language config from DB */
  language: {
    extension: string;
    dockerImage: string;
    compileCommand: string | null;
    runCommand: string;
  };
  /** Override time limit (ms). Defaults to system setting. */
  timeLimitMs?: number;
}

export interface CompilerRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTimeMs: number;
  timedOut: boolean;
  oomKilled: boolean;
  /** Non-null when compilation fails */
  compileOutput: string | null;
}

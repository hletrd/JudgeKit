# User-injected TODO (automated security review)

## Insecure File Permissions / Overly Permissive Workspace

- **Status:** Resolved in cycle 2 plan `plan/cycle-2-2026-06-30-worker-register-remediation.md` by removing the broad workspace/source permission fallback from the Node compiler path and Rust worker paths.
- **File:** `src/lib/compiler/execute.ts`
- **Severity:** Medium
- **Source:** automated security review (security-guidance@claude-code-plugins)
- **Description:** The compiler workspace falls back to world-writable permissions (`0o777` for directory, `0o666` for source file) when `chown` to the sandbox user fails. This is overly permissive.
- **Suggested fix:** Use group-based sharing instead of world-writable permissions. Run the compiler and sandbox under a common group, chown the workspace/source to sandboxUid:compilerGid, and set directory mode `0o770` / file mode `0o640`. If chown fails, fail closed (reject the submission) rather than falling back to `0o777`/`0o666`.
- **Exit criterion:** Remove this TODO when the workspace permission fallback is hardened or explicitly deferred per repo policy.

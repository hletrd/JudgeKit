/**
 * Re-compute AI-use signature flags ({{signature: token}}) of existing
 * submissions. Same work as POST /api/v1/admin/submissions/signature-flags.
 *
 *   npm run signature-flags:recompute                      # every submission that can carry a flag
 *   npm run signature-flags:recompute -- --problem <id>    # one problem (+ contests that include it)
 *   npm run signature-flags:recompute -- --assignment <id> # one assignment / contest
 */
import "./load-env";

async function main() {
  const args = process.argv.slice(2);
  const valueOf = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const problemId = valueOf("--problem");
  const assignmentId = valueOf("--assignment");

  const flags = await import("../src/lib/submissions/ai-signature-flags");
  const result = problemId
    ? await flags.recomputeSignatureFlagsForProblem(problemId)
    : assignmentId
      ? await flags.recomputeSignatureFlagsForAssignment(assignmentId)
      : await flags.recomputeAllSignatureFlags();

  console.log(JSON.stringify({ scope: problemId ? { problemId } : assignmentId ? { assignmentId } : "all", ...result }));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

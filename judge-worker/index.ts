import { getJudgeAuthToken, getJudgeClaimUrl, getJudgePollIntervalMs, getJudgePollUrl } from "./config";
import type { Submission } from "./executor";

const CLAIM_URL = getJudgeClaimUrl();
const POLL_URL = getJudgePollUrl();
const POLL_INTERVAL = getJudgePollIntervalMs();
const AUTH_TOKEN = getJudgeAuthToken();

for (const url of [CLAIM_URL, POLL_URL]) {
  if (url.startsWith("http://") && !url.startsWith("http://localhost") && !url.startsWith("http://127.0.0.1") && !url.startsWith("http://[::1]")) {
    console.warn(
      "WARNING: Judge URL uses unencrypted HTTP for a non-localhost address. " +
      "This exposes the auth token and submission data in transit. Use HTTPS in production."
    );
    break;
  }
}

let isPolling = false;

async function pollForSubmissions() {
  if (isPolling) {
    return;
  }

  isPolling = true;

  try {
    const response = await fetch(CLAIM_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    if (!response.ok) {
      console.error(`Poll failed: ${response.status}`);
      return;
    }

    const payload = (await response.json()) as { data: Submission | null };
    const submission = payload.data;

    if (submission) {
      console.log(`Processing submission ${submission.id}`);
      const { executeSubmission } = await import("./executor");
      await executeSubmission(submission);
    }
  } catch (error) {
    console.error("Poll error:", error);
  } finally {
    isPolling = false;
    setTimeout(pollForSubmissions, POLL_INTERVAL);
  }
}

async function main() {
  console.log("Judge worker started");
  console.log(`Claim URL: ${CLAIM_URL}, Report URL: ${POLL_URL}, interval: ${POLL_INTERVAL}ms`);

  await pollForSubmissions();
}

main().catch((error) => {
  console.error("Judge worker failed to start:", error);
  process.exit(1);
});

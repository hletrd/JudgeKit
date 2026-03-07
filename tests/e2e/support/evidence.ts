import type { Page, TestInfo } from "@playwright/test";

function toEvidenceFileName(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function captureEvidence(page: Page, testInfo: TestInfo, label: string) {
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`${toEvidenceFileName(label)}.png`),
  });
}

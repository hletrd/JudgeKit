import { NextRequest } from "next/server";
import { stat } from "fs/promises";
import { join } from "path";
import { createApiHandler } from "@/lib/api/handler";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { getDockerManagementCapabilities, listDockerImages, inspectDockerImage, removeDockerImages } from "@/lib/docker/client";
import { isAllowedJudgeDockerImage } from "@/lib/judge/docker-image-validation";
import { recordAuditEvent } from "@/lib/audit/events";
import { logger } from "@/lib/logger";

export const POST = createApiHandler({
  auth: { capabilities: ["system.settings"] },
  handler: async (req: NextRequest, { user }) => {
    const capabilities = getDockerManagementCapabilities();
    if (!capabilities.canPrune) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "docker_image.prune_rejected",
        resourceType: "docker_image",
        resourceId: "bulk_prune",
        summary: "Rejected stale Docker image prune because Docker management is unavailable",
        details: { reason: capabilities.reason ?? "dockerManagementUnavailable" },
        request: req,
      });
      return apiError(capabilities.reason ?? "dockerManagementUnavailable", 409);
    }

    const images = await listDockerImages("judge-*");

    // Find stale images: Dockerfile mtime > image creation time
    const staleTags: string[] = [];

    await Promise.all(images.map(async (img) => {
      if (img.repository === "<none>") return;
      if (!isAllowedJudgeDockerImage(img.repository)) {
        logger.debug(
          { repository: img.repository },
          "[docker:prune] skipping image with disallowed repository"
        );
        return;
      }
      const tag = `${img.repository}:${img.tag}`;
      const dockerfilePath = join("docker", `Dockerfile.${img.repository}`);

      try {
        const [fileStat, info] = await Promise.all([
          stat(dockerfilePath),
          inspectDockerImage(tag),
        ]);
        if (!info) return;

        const imageCreated = new Date(info.Created as string).getTime();
        if (fileStat.mtimeMs > imageCreated) {
          staleTags.push(tag);
        }
      } catch (err) {
        // Dockerfile doesn't exist or inspect failed - skip
        logger.debug({ err, tag, dockerfilePath }, "[docker:prune] stale check failed for image, skipping");
      }
    }));

    const result = await removeDockerImages(staleTags);

    if (result.removed.length > 0) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "docker_image.pruned",
        resourceType: "docker_image",
        resourceId: "bulk_prune",
        summary: `Pruned ${result.removed.length} stale Docker images: ${result.removed.join(", ")}`,
        request: req,
      });
    }

    if (result.errors.length > 0) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "docker_image.prune_failed",
        resourceType: "docker_image",
        resourceId: "bulk_prune",
        summary: `Failed to prune ${result.errors.length} stale Docker images`,
        details: { errors: result.errors },
        request: req,
      });
    }

    return apiSuccess({
      removed: result.removed,
      errors: result.errors,
      removedCount: result.removed.length,
    });
  },
});

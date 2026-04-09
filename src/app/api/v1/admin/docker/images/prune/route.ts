import { NextRequest } from "next/server";
import { stat } from "fs/promises";
import { join } from "path";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { listDockerImages, inspectDockerImage, removeDockerImages } from "@/lib/docker/client";
import { recordAuditEvent } from "@/lib/audit/events";

export const POST = createApiHandler({
  auth: { capabilities: ["system.settings"] },
  handler: async (req: NextRequest, { user }) => {
    const images = await listDockerImages("judge-*");

    // Find stale images: Dockerfile mtime > image creation time
    const staleTags: string[] = [];

    await Promise.all(images.map(async (img) => {
      if (img.repository === "<none>") return;
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
      } catch {
        // Dockerfile doesn't exist or inspect failed - skip
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

    return apiSuccess({
      removed: result.removed,
      errors: result.errors,
      removedCount: result.removed.length,
    });
  },
});

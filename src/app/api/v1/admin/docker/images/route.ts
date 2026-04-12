import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { stat } from "fs/promises";
import { join } from "path";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { listDockerImages, inspectDockerImage, pullDockerImage, removeDockerImage, getDiskUsage } from "@/lib/docker/client";
import { recordAuditEvent } from "@/lib/audit/events";
import { isAllowedJudgeDockerImage } from "@/lib/judge/docker-image-validation";

/** Check if Docker images are stale (Dockerfile modified after image was built) */
async function getStaleImages(images: { repository: string; tag: string }[]): Promise<Set<string>> {
  const stale = new Set<string>();

  await Promise.all(images.map(async (img) => {
    const tag = `${img.repository}:${img.tag}`;
    const dockerfilePath = join("docker", `Dockerfile.${img.repository}`);

    try {
      const [fileStat, info] = await Promise.all([
        stat(dockerfilePath),
        inspectDockerImage(tag),
      ]);
      if (!info) return;

      const imageCreated = new Date(info.Created as string).getTime();
      const dockerfileMtime = fileStat.mtimeMs;

      if (dockerfileMtime > imageCreated) {
        stale.add(tag);
      }
    } catch {
      // Dockerfile doesn't exist or inspect failed - not stale
    }
  }));

  return stale;
}

export const GET = createApiHandler({
  auth: { capabilities: ["system.settings"] },
  handler: async (req: NextRequest) => {
    const filter = req.nextUrl.searchParams.get("filter") ?? "judge-*";
    // Validate filter to prevent unexpected Docker CLI behavior
    if (!/^[a-zA-Z0-9*][a-zA-Z0-9._\-/*:]*$/.test(filter)) {
      return NextResponse.json({ error: "invalidFilter" }, { status: 400 });
    }
    const [images, disk] = await Promise.all([
      listDockerImages(filter),
      getDiskUsage(),
    ]);

    const staleSet = await getStaleImages(images);

    return apiSuccess({
      images,
      disk,
      staleImages: [...staleSet],
    });
  },
});

const pullSchema = z.object({
  imageTag: z.string().min(1).max(256),
});

export const POST = createApiHandler({
  auth: { capabilities: ["system.settings"] },
  schema: pullSchema,
  handler: async (req: NextRequest, { body, user }) => {
    if (!isAllowedJudgeDockerImage(body.imageTag)) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "docker_image.pull_rejected",
        resourceType: "docker_image",
        resourceId: body.imageTag,
        summary: `Rejected Docker image pull for ${body.imageTag}`,
        details: { reason: "imageTagMustStartWithJudge" },
        request: req,
      });
      return NextResponse.json(
        { error: "imageTagMustStartWithJudge", message: "Only judge-* images are allowed" },
        { status: 400 }
      );
    }
    const result = await pullDockerImage(body.imageTag);
    if (!result.success) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "docker_image.pull_failed",
        resourceType: "docker_image",
        resourceId: body.imageTag,
        summary: `Failed Docker image pull for ${body.imageTag}`,
        details: { error: result.error ?? "pullFailed" },
        request: req,
      });
      return NextResponse.json(
        { error: result.error ?? "pullFailed" },
        { status: 500 }
      );
    }
    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "docker_image.pulled",
      resourceType: "docker_image",
      resourceId: body.imageTag,
      summary: `Pulled Docker image ${body.imageTag}`,
      request: req,
    });
    return apiSuccess({ pulled: body.imageTag });
  },
});

const deleteSchema = z.object({
  imageTag: z.string().min(1).max(256),
});

export const DELETE = createApiHandler({
  auth: { capabilities: ["system.settings"] },
  schema: deleteSchema,
  handler: async (req: NextRequest, { body, user }) => {
    if (!isAllowedJudgeDockerImage(body.imageTag)) {
      return NextResponse.json(
        { error: "imageTagMustStartWithJudge", message: "Only judge-* images can be removed" },
        { status: 400 }
      );
    }
    const result = await removeDockerImage(body.imageTag);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "removeFailed" },
        { status: 500 }
      );
    }
    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "docker_image.removed",
      resourceType: "docker_image",
      resourceId: body.imageTag,
      summary: `Removed Docker image ${body.imageTag}`,
      request: req,
    });
    return apiSuccess({ removed: body.imageTag });
  },
});

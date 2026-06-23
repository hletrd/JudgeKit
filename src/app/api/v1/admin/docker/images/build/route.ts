import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { access } from "fs/promises";
import { join } from "path";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { buildDockerImage, getDockerManagementCapabilities } from "@/lib/docker/client";
import { recordAuditEvent } from "@/lib/audit/events";
import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isAllowedJudgeDockerImage, isLocalJudgeDockerImage } from "@/lib/judge/docker-image-validation";
import { logger } from "@/lib/logger";

const buildSchema = z.object({
  language: z.string().min(1).max(64),
});

export const POST = createApiHandler({
  auth: { capabilities: ["system.settings"] },
  schema: buildSchema,
  handler: async (req: NextRequest, { body, user }) => {
    const capabilities = getDockerManagementCapabilities();
    if (!capabilities.canBuild) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "docker_image.build_rejected",
        resourceType: "docker_image",
        resourceId: body.language,
        summary: `Rejected Docker image build for unavailable Docker management: ${body.language}`,
        details: { reason: capabilities.reason ?? "dockerManagementUnavailable" },
        request: req,
      });
      return NextResponse.json(
        { error: capabilities.reason ?? "dockerManagementUnavailable" },
        { status: 409 }
      );
    }

    // Look up the language config to find the docker image name
    const [langConfig] = await db
      .select({ dockerImage: languageConfigs.dockerImage })
      .from(languageConfigs)
      .where(eq(languageConfigs.language, body.language))
      .limit(1);

    if (!langConfig) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "docker_image.build_rejected",
        resourceType: "docker_image",
        resourceId: body.language,
        summary: `Rejected Docker image build for unknown language ${body.language}`,
        details: { reason: "languageNotFound" },
        request: req,
      });
      return NextResponse.json({ error: "languageNotFound" }, { status: 404 });
    }

    if (!isAllowedJudgeDockerImage(langConfig.dockerImage)) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "docker_image.build_rejected",
        resourceType: "docker_image",
        resourceId: langConfig.dockerImage,
        summary: `Rejected Docker image build for ${langConfig.dockerImage}`,
        details: { reason: "imageTagMustStartWithJudge", language: body.language },
        request: req,
      });
      return NextResponse.json(
        { error: "imageTagMustStartWithJudge" },
        { status: 400 }
      );
    }
    if (!isLocalJudgeDockerImage(langConfig.dockerImage)) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "docker_image.build_rejected",
        resourceType: "docker_image",
        resourceId: langConfig.dockerImage,
        summary: `Rejected Docker image build for non-local image ${langConfig.dockerImage}`,
        details: { reason: "imageTagMustBeLocalJudge", language: body.language },
        request: req,
      });
      return NextResponse.json(
        { error: "imageTagMustBeLocalJudge" },
        { status: 400 }
      );
    }

    // Derive dockerfile path from docker image name (e.g. "judge-python:latest" -> "docker/Dockerfile.judge-python")
    const imageName = langConfig.dockerImage.split(":")[0];
    const dockerfilePath = join("docker", `Dockerfile.${imageName}`);

    try {
      await access(dockerfilePath);
    } catch (err) {
      logger.info({ err, dockerfilePath }, "[docker] Dockerfile not found for build request");
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "docker_image.build_rejected",
        resourceType: "docker_image",
        resourceId: langConfig.dockerImage,
        summary: `Rejected Docker image build for missing Dockerfile ${dockerfilePath}`,
        details: { reason: "dockerfileNotFound", language: body.language, dockerfilePath },
        request: req,
      });
      return NextResponse.json(
        { error: "dockerfileNotFound" },
        { status: 404 },
      );
    }

    const result = await buildDockerImage(langConfig.dockerImage, dockerfilePath);

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: result.success ? "docker_image.built" : "docker_image.build_failed",
      resourceType: "docker_image",
      resourceId: langConfig.dockerImage,
      summary: result.success
        ? `Built Docker image ${langConfig.dockerImage}`
        : `Failed to build Docker image ${langConfig.dockerImage}`,
      details: result.success ? undefined : { error: result.error ?? "buildFailed" },
      request: req,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "buildFailed" },
        { status: 500 },
      );
    }

    return apiSuccess({ built: langConfig.dockerImage, logs: result.logs });
  },
});

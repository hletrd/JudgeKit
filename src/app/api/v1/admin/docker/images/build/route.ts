import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { access } from "fs/promises";
import { join } from "path";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { buildDockerImage } from "@/lib/docker/client";
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
    // Look up the language config to find the docker image name
    const [langConfig] = await db
      .select()
      .from(languageConfigs)
      .where(eq(languageConfigs.language, body.language))
      .limit(1);

    if (!langConfig) {
      return NextResponse.json({ error: "Language not found" }, { status: 404 });
    }

    if (!isAllowedJudgeDockerImage(langConfig.dockerImage)) {
      return NextResponse.json(
        { error: "imageTagMustStartWithJudge", message: "Only judge-* images are allowed" },
        { status: 400 }
      );
    }
    if (!isLocalJudgeDockerImage(langConfig.dockerImage)) {
      return NextResponse.json(
        { error: "imageTagMustBeLocalJudge", message: "Only local judge-* images can be built" },
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
      return NextResponse.json(
        { error: `Dockerfile not found: ${dockerfilePath}` },
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

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { existsSync } from "fs";
import { join } from "path";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { buildDockerImage } from "@/lib/docker/client";
import { recordAuditEvent } from "@/lib/audit/events";
import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const buildSchema = z.object({
  language: z.string().min(1).max(64),
});

export const POST = createApiHandler({
  auth: { roles: ["admin", "super_admin"] },
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

    // Derive dockerfile path from docker image name (e.g. "judge-python:latest" -> "docker/Dockerfile.judge-python")
    const imageName = langConfig.dockerImage.split(":")[0];
    const dockerfilePath = join("docker", `Dockerfile.${imageName}`);

    if (!existsSync(dockerfilePath)) {
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

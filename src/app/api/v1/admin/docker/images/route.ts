import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { listDockerImages, pullDockerImage, removeDockerImage, getDiskUsage } from "@/lib/docker/client";
import { recordAuditEvent } from "@/lib/audit/events";

export const GET = createApiHandler({
  auth: { roles: ["admin", "super_admin"] },
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
    return apiSuccess({ images, disk });
  },
});

const pullSchema = z.object({
  imageTag: z.string().min(1).max(256),
});

export const POST = createApiHandler({
  auth: { roles: ["super_admin"] },
  schema: pullSchema,
  handler: async (_req: NextRequest, { body }) => {
    // Only allow images with the judge- prefix to prevent supply chain attacks
    if (!body.imageTag.startsWith("judge-") && !body.imageTag.includes("/judge-")) {
      return NextResponse.json(
        { error: "imageTagMustStartWithJudge", message: "Only judge-* images are allowed" },
        { status: 400 }
      );
    }
    const result = await pullDockerImage(body.imageTag);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "pullFailed" },
        { status: 500 }
      );
    }
    return apiSuccess({ pulled: body.imageTag });
  },
});

const deleteSchema = z.object({
  imageTag: z.string().min(1).max(256),
});

export const DELETE = createApiHandler({
  auth: { roles: ["super_admin"] },
  schema: deleteSchema,
  handler: async (req: NextRequest, { body, user }) => {
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

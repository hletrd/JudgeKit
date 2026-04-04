import { NextRequest } from "next/server";
import { createApiHandler, isAdmin } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { getAllPluginStates } from "@/lib/plugins/data";

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

    const states = await getAllPluginStates();

    const data = states.map((s) => ({
      id: s.id,
      enabled: s.enabled,
      config: s.config,
      nameKey: s.definition.nameKey,
      descriptionKey: s.definition.descriptionKey,
      updatedAt: s.updatedAt,
    }));

    return apiSuccess(data);
  },
});

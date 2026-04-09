import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { getAllPluginStates } from "@/lib/plugins/data";

export const GET = createApiHandler({
  auth: { capabilities: ["system.plugins"] },
  handler: async () => {
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

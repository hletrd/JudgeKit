import type { MetadataRoute } from "next";
import { getAuthUrlObject } from "@/lib/security/env";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getAuthUrlObject()?.origin;

  return {
    host: siteUrl,
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api",
        "/dashboard",
        "/workspace",
        "/login",
        "/signup",
        "/change-password",
        "/recruit",
        "/community/new",
        "/submissions",
      ],
    },
    sitemap: siteUrl ? `${siteUrl}/sitemap.xml` : undefined,
  };
}

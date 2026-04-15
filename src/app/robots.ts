import type { MetadataRoute } from "next";
import { getAuthUrlObject } from "@/lib/security/env";

const DISALLOWED_PATHS = [
  "/api",
  "/dashboard",
  "/workspace",
  "/control",
  "/login",
  "/signup",
  "/change-password",
  "/recruit",
  "/community/new",
] as const;

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getAuthUrlObject();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...DISALLOWED_PATHS],
    },
    host: siteUrl?.origin,
    sitemap: siteUrl ? `${siteUrl.origin}/sitemap.xml` : undefined,
  };
}

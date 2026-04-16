import type { MetadataRoute } from "next";
import { buildAbsoluteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = buildAbsoluteUrl("/").replace(/\/$/, "");
  const sitemapUrl = buildAbsoluteUrl("/sitemap.xml");

  return {
    host: siteUrl,
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api",
        "/dashboard",
        "/workspace",
        "/control",
        "/login",
        "/signup",
        "/change-password",
        "/recruit",
        "/community/new",
        "/submissions",
      ],
    },
    sitemap: sitemapUrl,
  };
}

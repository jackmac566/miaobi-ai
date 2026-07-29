import type { MetadataRoute } from "next";

const SITE_URL = "https://ai-copywriting-assistant.maxc565.chatgpt.site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date("2026-07-26T00:00:00+08:00"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/updates`,
      lastModified: new Date("2026-07-26T00:00:00+08:00"),
      changeFrequency: "weekly",
      priority: 0.6,
    },
  ];
}

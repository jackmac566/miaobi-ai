import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "妙笔AI｜AI 文案全能助手",
    short_name: "妙笔AI",
    description: "覆盖 43 个场景、强调真实素材与事实边界的中文文案创作工具。",
    start_url: "/",
    display: "standalone",
    background_color: "#fffaf5",
    theme_color: "#ff6257",
    lang: "zh-CN",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };
}

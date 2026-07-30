import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://ai-copywriting-assistant.maxc565.chatgpt.site"),
  title: "妙笔AI｜AI 文案全能助手",
  description: "覆盖朋友圈、小红书、短视频、职场、校园与商业营销场景的 AI 中文文案创作和文本处理工具。",
  keywords: ["AI文案", "文案生成", "小红书文案", "朋友圈文案", "短视频脚本", "简历优化", "妙笔AI"],
  applicationName: "妙笔AI",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "妙笔AI｜AI 文案全能助手",
    description: "43 个专业场景，基于真实素材生成更自然、更可信的中文文案。",
    type: "website",
    locale: "zh_CN",
    url: "/",
    siteName: "妙笔AI",
    images: [{ url: "/og-image.png", width: 1200, height: 630, type: "image/png", alt: "妙笔AI 文案全能助手" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "妙笔AI｜AI 文案全能助手",
    description: "43 个专业场景，基于真实素材生成更自然、更可信的中文文案。",
    images: ["/og-image.png"],
  },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fffaf5",
  colorScheme: "light",
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "妙笔AI",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "zh-CN",
  url: "https://ai-copywriting-assistant.maxc565.chatgpt.site",
  description: "覆盖 43 个场景、强调真实素材与事实边界的中文文案创作工具。",
  offers: [
    { "@type": "Offer", name: "免费版", price: "0", priceCurrency: "CNY" },
    { "@type": "Offer", name: "月度会员", price: "19.9", priceCurrency: "CNY" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
        {children}
      </body>
    </html>
  );
}

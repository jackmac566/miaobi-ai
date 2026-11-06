/**
 * 妙笔AI 本地演示预览（V1.5.3）
 *
 * 用途：部署前在本地浏览器验收最新界面，不访问 Cloudflare、不上线。
 * 用法：
 *   npm run build:cloudflare
 *   node scripts/local-preview.mjs
 * 然后打开 http://127.0.0.1:5188/
 *
 * 说明：/api/* 全部由本文件内的演示数据模拟（非真实后端），
 * 登录页输入任意邮箱 + 任意 10 位以上密码即可进入运营后台，
 * 模型设置面板展示全部八家提供商，可模拟切换/保存/测试/同步。
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DIST = join(ROOT, "cloudflare", "dist");
const PORT = Number(process.env.MIAOBI_PREVIEW_PORT || 5188);
const RELEASE = "V1.5.3";

const PROVIDERS = [
  { id: "deepseek", label: "DeepSeek", shortLabel: "DeepSeek", defaultModel: "deepseek-v4-flash", docsUrl: "https://api-docs.deepseek.com/", syncable: true, models: [
    { id: "deepseek-v4-flash", label: "V4 Flash · 速度/成本优先" },
    { id: "deepseek-v4-pro", label: "V4 Pro · 质量优先" },
    { id: "deepseek-chat", label: "DeepSeek Chat · 通用对话" },
    { id: "deepseek-reasoner", label: "DeepSeek Reasoner · 深度推理" },
  ] },
  { id: "openai", label: "OpenAI GPT", shortLabel: "GPT", defaultModel: "gpt-4o-mini", docsUrl: "https://platform.openai.com/docs/", syncable: true, models: [
    { id: "gpt-4o-mini", label: "GPT-4o mini · 快/省" },
    { id: "gpt-4o", label: "GPT-4o · 均衡" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    { id: "gpt-4.1", label: "GPT-4.1" },
  ] },
  { id: "claude", label: "Anthropic Claude", shortLabel: "Claude", defaultModel: "claude-sonnet-4-20250514", docsUrl: "https://docs.anthropic.com/", syncable: false, models: [
    { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 · 推荐" },
    { id: "claude-haiku-4-20250514", label: "Claude Haiku 4 · 快/省" },
    { id: "claude-opus-4-20250514", label: "Claude Opus 4 · 最强" },
  ] },
  { id: "qwen", label: "通义千问", shortLabel: "千问", defaultModel: "qwen-plus", docsUrl: "https://help.aliyun.com/zh/model-studio/", syncable: false, models: [
    { id: "qwen-turbo", label: "Qwen Turbo · 快/省" },
    { id: "qwen-plus", label: "Qwen Plus · 均衡" },
    { id: "qwen-max", label: "Qwen Max · 强" },
    { id: "qwen-long", label: "Qwen Long · 长文" },
  ] },
  { id: "doubao", label: "豆包（火山方舟）", shortLabel: "豆包", defaultModel: "doubao-seed-1-6-250615", docsUrl: "https://www.volcengine.com/docs/82379", syncable: false, models: [
    { id: "doubao-seed-1-6-250615", label: "Doubao Seed 1.6 · 推荐" },
    { id: "doubao-1-5-pro-32k-250115", label: "Doubao 1.5 Pro 32K" },
    { id: "doubao-lite-32k-240828", label: "Doubao Lite · 快/省" },
  ] },
  { id: "minimax", label: "MiniMax", shortLabel: "MiniMax", defaultModel: "MiniMax-Text-01", docsUrl: "https://platform.minimaxi.com/document/", syncable: false, models: [
    { id: "MiniMax-Text-01", label: "MiniMax-Text-01 · 推荐" },
  ] },
  { id: "glm", label: "智谱 GLM", shortLabel: "GLM", defaultModel: "glm-4.5", docsUrl: "https://open.bigmodel.cn/dev/api", syncable: false, models: [
    { id: "glm-4.5", label: "GLM-4.5 · 推荐" },
    { id: "glm-4.5-air", label: "GLM-4.5 Air · 快/省" },
    { id: "glm-4-plus", label: "GLM-4 Plus" },
  ] },
  { id: "gemini", label: "Google Gemini", shortLabel: "Gemini", defaultModel: "gemini-2.5-flash", docsUrl: "https://ai.google.dev/gemini-api/docs", syncable: false, models: [
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash · 快" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro · 强" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ] },
];

const state = {
  activeProvider: "deepseek",
  activeModel: "deepseek-v4-flash",
  hasKeys: { deepseek: true, openai: false, claude: false, qwen: false, doubao: false, minimax: false, glm: false, gemini: false },
  loggedIn: false,
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

function json(data, status = 200, extra = {}) {
  return {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
    body: JSON.stringify(data),
  };
}

const body = async request => {
  try { return await request.json(); } catch { return {}; }
};

async function handleApi(request, url) {
  const path = url.pathname;
  const method = request.method;
  const payload = await body(request);

  if (path === "/api/health" && method === "GET") {
    return json({ ok: true, release: RELEASE, database: true, deepSeekConfigured: true, provider: state.activeProvider, providerLabel: PROVIDERS.find(item => item.id === state.activeProvider)?.label || "DeepSeek", model: state.activeModel, freeLimit: 10, windowHours: 24 });
  }

  if (path === "/api/account" && method === "GET") {
    return state.loggedIn
      ? json({ signedIn: true, name: "预览站长", remaining: 100, resetsAt: Date.now() + 86_400_000, isAdmin: true, isMember: true, plan: "monthly", planExpiresAt: Date.now() + 30 * 86_400_000, aiConfigured: true, aiOperational: true, aiProvider: state.activeProvider, aiProviderLabel: PROVIDERS.find(item => item.id === state.activeProvider)?.shortLabel || "DeepSeek", aiModel: state.activeModel, generationMode: state.activeProvider, signInPath: null })
      : json({ signedIn: false, name: "访客", remaining: 10, resetsAt: Date.now() + 86_400_000, isAdmin: false, isMember: false, aiConfigured: true, aiOperational: true, aiProvider: state.activeProvider, aiProviderLabel: PROVIDERS.find(item => item.id === state.activeProvider)?.shortLabel || "DeepSeek", aiModel: state.activeModel, generationMode: state.activeProvider, signInPath: "/login" });
  }

  if (path === "/api/account" && method === "DELETE") {
    state.loggedIn = false;
    return json({ ok: true, deleted: true });
  }

  if (["/api/auth/login", "/api/auth/register"].includes(path) && method === "POST") {
    state.loggedIn = true;
    return json({ ok: true, role: "admin", sessionToken: "preview-token" }, 200, {
      "Set-Cookie": "miaobi_session=preview-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400",
    });
  }
  if (path === "/api/auth/logout" && method === "POST") {
    state.loggedIn = false;
    return json({ ok: true });
  }

  if (path === "/api/generate" && method === "POST") {
    const topic = String(payload?.topic || "本地预览演示文案");
    return json({
      results: [
        `【版本一】${topic}——把真实素材写成有节奏的中文表达，事实边界保留原样。`,
        `【版本二】换个角度起笔：从读者最关心的一点切入，再补上细节与行动收尾。`,
        `【版本三】短句、留白、克制：不堆形容词，用具体的时间地点把画面立起来。`,
      ],
      remaining: 99,
      resetsAt: Date.now() + 86_400_000,
      model: state.activeModel,
    });
  }

  if (path === "/api/admin/overview" && method === "GET") {
    if (!state.loggedIn) return json({ error: "请先以站长身份登录" }, 401);
    const provider = PROVIDERS.find(item => item.id === state.activeProvider);
    return json({
      release: RELEASE,
      currentUser: { email: "preview@example.com", role: "admin" },
      cards: { users: 3, activeMembers: 1, rollingGenerations: 12, siteRemaining: 488, promptTokens: 12345, completionTokens: 67890, revenueFen: 1990, memberConversion: 33.3 },
      systems: { deepSeekConfigured: true, provider: state.activeProvider, providerLabel: provider?.label || "DeepSeek", providerShortLabel: provider?.shortLabel || "DeepSeek", providerKeyConfigured: Boolean(state.hasKeys[state.activeProvider]), model: state.activeModel, database: true, rollingWindowHours: 24, freeLimit: 10, memberLimit: 100, siteLimit: 500 },
      users: [
        { email: "member@example.com", display_name: "演示会员", plan: "monthly", plan_expires_at: Date.now() + 30 * 86_400_000, last_seen_at: Date.now() - 3_600_000 },
        { email: "free@example.com", display_name: "演示用户", plan: "free", plan_expires_at: null, last_seen_at: Date.now() - 86_400_000 },
      ],
      orders: [{ id: "preview-1", user_email: "member@example.com", product: "月度会员", amount_fen: 1990, status: "paid", provider_trade_no: "manual_wechat:preview", created_at: Date.now() - 86_400_000, paid_at: Date.now() - 86_400_000 }],
      audit: [{ actor_email: "preview@example.com", action: "model_change", target: "deepseek-v4-flash", detail: "后台切换生成模型（本地预览演示数据）", created_at: Date.now() - 60_000 }],
    });
  }

  if (path === "/api/admin/members" && method === "POST") {
    if (!state.loggedIn) return json({ error: "请先以站长身份登录" }, 401);
    return json({ ok: true, message: "（本地预览演示数据）已模拟开通会员，请部署后在线上核对真实到账。" });
  }

  if (path === "/api/admin/ai-settings" && method === "GET") {
    if (!state.loggedIn) return json({ error: "请先以站长身份登录" }, 401);
    return json({ providers: PROVIDERS, activeProvider: state.activeProvider, activeModel: state.activeModel, hasKeys: state.hasKeys, source: "本地预览演示数据" });
  }

  if (path === "/api/admin/ai-settings" && method === "POST") {
    if (!state.loggedIn) return json({ error: "请先以站长身份登录" }, 401);
    const action = String(payload?.action || "");
    if (action === "set_provider") {
      const provider = PROVIDERS.find(item => item.id === payload?.provider);
      if (!provider) return json({ error: "未知的模型提供商" }, 400);
      state.activeProvider = provider.id;
      state.activeModel = provider.defaultModel;
      return json({ ok: true, provider: provider.id, defaultModel: provider.defaultModel, label: provider.label });
    }
    if (action === "set_model") {
      state.activeModel = String(payload?.model || "");
      return json({ ok: true, model: state.activeModel });
    }
    if (action === "save_key") {
      state.hasKeys[String(payload?.provider || "")] = Boolean(payload?.apiKey);
      return json({ ok: true, configured: Boolean(payload?.apiKey) });
    }
    if (action === "verify") {
      return json({ ok: true, resolvedModel: String(payload?.model || state.activeModel) });
    }
    if (action === "sync_models") {
      const provider = PROVIDERS.find(item => item.id === payload?.provider);
      return json({ ok: true, models: provider?.models || [] });
    }
    return json({ error: "不支持的操作" }, 400);
  }

  return json({ error: "接口不存在（本地预览演示数据）" }, 404);
}

function serveStatic(url, response) {
  let pathname = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  if (pathname === "" ) pathname = "index.html";
  if (pathname === "login" || pathname === "admin" || !extname(pathname)) pathname = "index.html";
  const filePath = join(DIST, pathname);
  if (!filePath.startsWith(DIST) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    const fallback = join(DIST, "index.html");
    const stream = createReadStream(fallback);
    response.writeHead(200, { "Content-Type": MIME[".html"] });
    stream.pipe(response);
    return;
  }
  const type = MIME[extname(filePath)] || "application/octet-stream";
  response.writeHead(200, { "Content-Type": type });
  createReadStream(filePath).pipe(response);
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(request, url)
      .then(apiResponse => {
        response.writeHead(apiResponse.status, apiResponse.headers);
        response.end(apiResponse.body);
      })
      .catch(() => {
        response.writeHead(500, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "本地预览内部错误" }));
      });
    return;
  }
  serveStatic(url, response);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("妙笔AI V1.5.3 本地演示预览已启动（演示数据，非线上）");
  console.log(`  首页：       http://127.0.0.1:${PORT}/`);
  console.log(`  登录：       http://127.0.0.1:${PORT}/login （任意邮箱 + 任意 10 位以上密码）`);
  console.log(`  运营后台：   http://127.0.0.1:${PORT}/admin （模型设置 + 检查更新）`);
  console.log(`  会员弹窗：   首页右上角“会员”按钮，可查看居中的微信支付按钮`);
  console.log("  按 Ctrl+C 停止预览。");
  console.log("");
});

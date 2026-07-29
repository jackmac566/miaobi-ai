export const AI_PROVIDER_IDS = ["deepseek"] as const;

export type AIProviderId = typeof AI_PROVIDER_IDS[number];
export type AIProviderCategory = "china";
export type AIModelOption = { id: string; label: string };
export type AIProvider = {
  id: AIProviderId;
  label: string;
  shortLabel: string;
  category: AIProviderCategory;
  description: string;
  endpoint: string;
  modelsEndpoint: string;
  defaultModel: string;
  models: readonly AIModelOption[];
  modelHint: string;
  docsUrl: string;
  auth: "bearer";
  tokenField: "max_tokens";
};

export const AI_PROVIDERS: readonly AIProvider[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    shortLabel: "DeepSeek",
    category: "china",
    description: "官方直连接口；正式站、国内版与小程序统一使用服务端调用。",
    endpoint: "https://api.deepseek.com/chat/completions",
    modelsEndpoint: "https://api.deepseek.com/models",
    defaultModel: "deepseek-v4-flash",
    models: [
      { id: "deepseek-v4-flash", label: "V4 Flash・速度/成本优先" },
      { id: "deepseek-v4-pro", label: "V4 Pro・质量优先" },
    ],
    modelHint: "从当前 DeepSeek API Key 实际可见的模型中选择",
    docsUrl: "https://api-docs.deepseek.com/updates/",
    auth: "bearer",
    tokenField: "max_tokens",
  },
];

export function isAIProviderId(value: unknown): value is AIProviderId {
  return value === "deepseek";
}

export function getAIProvider(value?: unknown): AIProvider {
  void value;
  return AI_PROVIDERS[0];
}

export type AIChatMessage = { role: "system" | "user" | "assistant"; content: string };

function providerHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

export async function fetchAIChat(options: {
  provider: AIProviderId;
  apiKey: string;
  model: string;
  messages: AIChatMessage[];
  maxTokens: number;
  temperature?: number;
}) {
  const provider = getAIProvider(options.provider);
  return fetch(provider.endpoint, {
    method: "POST",
    headers: providerHeaders(options.apiKey),
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      stream: false,
      max_tokens: options.maxTokens,
      ...(typeof options.temperature === "number" ? { temperature: options.temperature } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });
}

export async function fetchAIModels(options: { provider: AIProviderId; apiKey: string }) {
  const provider = getAIProvider(options.provider);
  const response = await fetch(provider.modelsEndpoint, {
    method: "GET",
    headers: providerHeaders(options.apiKey),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(await providerErrorMessage(provider.id, response));
  const payload = await response.json() as {
    data?: Array<{ id?: string; name?: string }>;
    models?: Array<{ id?: string; name?: string }>;
  };
  const raw = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
  const models = raw
    .map(item => ({ id: String(item.id || item.name || "").trim(), label: String(item.name || item.id || "").trim() }))
    .filter(item => /^[a-zA-Z0-9._:~/-]{2,180}$/.test(item.id))
    .filter((item, index, all) => all.findIndex(candidate => candidate.id === item.id) === index)
    .slice(0, 100);
  if (!models.length) throw new Error("DeepSeek 未返回可识别的文本模型列表");
  return { models, source: "account_api" as const };
}

export async function providerErrorMessage(providerId: AIProviderId, response: Response) {
  const provider = getAIProvider(providerId);
  let detail = "";
  try {
    const data = await response.clone().json() as { error?: { message?: string; code?: string } | string; message?: string };
    detail = typeof data.error === "string" ? data.error : data.error?.message || data.message || data.error?.code || "";
  } catch { detail = ""; }
  if (response.status === 401) return "DeepSeek 未接受该 API Key，请确认密钥有效且已经替换聊天中暴露过的旧密钥";
  if (response.status === 402) return "DeepSeek 账户余额不足，请充值后重试";
  if (response.status === 403) return "DeepSeek 拒绝访问，请检查模型权限、地域或账户状态";
  if (response.status === 404) return "DeepSeek 找不到该模型，请从账号模型列表中重新选择";
  if (response.status === 429) return "DeepSeek 请求过于频繁或额度已用完，请稍后重试";
  return detail ? `${provider.label} 返回：${detail.slice(0, 160)}` : `${provider.label} 返回错误（${response.status}）`;
}

export async function readAIChatResponse(response: Response) {
  const data = await response.json() as {
    model?: string;
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const raw = data.choices?.[0]?.message?.content;
  const content = typeof raw === "string"
    ? raw.trim()
    : Array.isArray(raw)
      ? raw.map(part => part.text || "").join("").trim()
      : "";
  const withoutCompleteReasoning = content
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<analysis\b[^>]*>[\s\S]*?<\/analysis>/gi, "");
  const lastThinkClose = withoutCompleteReasoning.toLowerCase().lastIndexOf("</think>");
  const lastAnalysisClose = withoutCompleteReasoning.toLowerCase().lastIndexOf("</analysis>");
  const lastReasoningClose = Math.max(lastThinkClose, lastAnalysisClose);
  const publicContent = (lastReasoningClose >= 0
    ? withoutCompleteReasoning.slice(lastReasoningClose + (lastThinkClose === lastReasoningClose ? 8 : 11))
    : withoutCompleteReasoning)
    .replace(/<\/?(?:think|analysis)\b[^>]*>/gi, "")
    .trim();
  return { content: publicContent, usage: data.usage, resolvedModel: data.model?.trim() || null };
}

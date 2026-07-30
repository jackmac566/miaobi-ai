import {
  encryptSetting,
  ensureSchema,
  getAIProviderStatuses,
  getAISettingsForProvider,
  hasAdminAccess,
  isRootAdmin,
  json,
  recordAIProviderCheck,
  requestUser,
  runtimeEnv,
} from "../../../../lib/runtime";
import {
  fetchAIChat,
  fetchAIModels,
  getAIProvider,
  isAIProviderId,
  providerErrorMessage,
  readAIChatResponse,
} from "../../../../lib/ai-providers";

export const dynamic = "force-dynamic";

async function adminContext(request: Request) {
  const user = requestUser(request);
  const config = await runtimeEnv();
  if (!user) return { error: json({ error: "请先登录" }, 401) };
  if (!await hasAdminAccess(user.email, config)) return { error: json({ error: "无权修改站点设置" }, 403) };
  await ensureSchema(config.DB);
  return { config, user };
}

async function testProvider(provider: ReturnType<typeof getAIProvider>, apiKey: string, model: string) {
  const response = await fetchAIChat({
    provider: provider.id,
    apiKey,
    model,
    messages: [
      { role: "system", content: "这是连接可用性测试。请只返回简短纯文本。" },
      { role: "user", content: "只回复：连接成功" },
    ],
    maxTokens: 768,
    timeoutMs: 20_000,
  });
  if (!response.ok) {
    const userMessage = await providerErrorMessage(provider.id, response);
    console.error(`${provider.label} connection test failed`, response.status);
    throw new Error(userMessage);
  }
  const result = await readAIChatResponse(response).catch(() => null);
  if (!result?.content) throw new Error(`${provider.label} 虽返回成功状态，但没有返回可用文本，不能启用`);
  return { resolvedModel: result.resolvedModel || model };
}

export async function GET(request: Request) {
  const context = await adminContext(request);
  if (context.error) return context.error;
  const [settings, providerStatuses] = await Promise.all([
    getAISettingsForProvider(context.config!, "deepseek"),
    getAIProviderStatuses(context.config!),
  ]);
  const current = providerStatuses.find(provider => provider.id === "deepseek");
  const operational = Boolean(settings.apiKey && current?.verified);
  const providers = current ? [{
    ...current,
    selected: true,
    active: operational,
  }] : [];
  return json({
    configured: Boolean(settings.apiKey),
    verified: Boolean(current?.verified),
    operational,
    activeProvider: "deepseek",
    activeProviderLabel: "DeepSeek",
    model: settings.model,
    lastCheckedAt: current?.lastCheckedAt || null,
    resolvedModel: current?.resolvedModel || null,
    source: settings.source,
    providers,
    secureStorageReady: Boolean(context.config!.CONFIG_ENCRYPTION_KEY),
    canManage: isRootAdmin(context.user!.email, context.config!),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "请求来源校验失败" }, 403);
  const context = await adminContext(request);
  if (context.error) return context.error;
  const config = context.config!;
  if (!isRootAdmin(context.user!.email, config)) return json({ error: "只有主管理员可以修改或测试 API Key" }, 403);
  const body = await request.json().catch(() => null) as null | {
    action?: "save" | "test" | "activate" | "remove" | "models";
    provider?: string;
    apiKey?: string;
    model?: string;
  };
  if (body?.provider !== "deepseek" || !isAIProviderId(body.provider)) {
    return json({ error: "当前版本只允许配置 DeepSeek，其他平台不会参与访客生成" }, 400);
  }
  const provider = getAIProvider("deepseek");
  const action = body?.action || "save";
  const current = await getAISettingsForProvider(config, provider.id);
  const model = body?.model?.trim() || current.model || provider.defaultModel;
  if (!/^[a-zA-Z0-9._:~/-]{2,180}$/.test(model)) return json({ error: "模型名称格式不正确" }, 400);

  if (action === "remove") {
    if (current.source === "environment") return json({ error: "该密钥由站点环境变量提供，请在站点环境设置中删除" }, 409);
    await config.DB.batch([
      config.DB.prepare("DELETE FROM secret_settings WHERE key = ?").bind(`ai_api_key:${provider.id}`),
      config.DB.prepare("DELETE FROM app_settings WHERE key = ?").bind(`ai_model:${provider.id}`),
      config.DB.prepare("DELETE FROM ai_provider_checks WHERE provider_id = ?").bind(provider.id),
      config.DB.prepare("INSERT INTO admin_audit (id, actor_email, action, target, detail, created_at) VALUES (?, ?, 'ai_provider_remove', ?, ?, ?)")
        .bind(crypto.randomUUID(), context.user!.email, provider.id, JSON.stringify({ model, source: current.source }), Date.now()),
    ]);
    return json({ ok: true, configured: false, message: `${provider.label} 密钥已安全移除` });
  }

  const apiKey = body?.apiKey?.trim() || current.apiKey;
  if (!apiKey || apiKey.length < 8 || apiKey.length > 500) return json({ error: `请输入有效的 ${provider.label} API Key` }, 400);
  if (action === "save" && current.source === "environment") {
    return json({ error: `${provider.label} 当前由站点环境变量管理；请先删除对应环境变量，再使用后台加密保存` }, 409);
  }

  if (action === "models") {
    try {
      const catalog = await fetchAIModels({ provider: provider.id, apiKey });
      return json({
        ok: true,
        models: catalog.models,
        source: catalog.source,
        message: catalog.source === "account_api"
          ? `已从 ${provider.label} 读取 ${catalog.models.length} 个账号可见模型`
          : `${provider.label} 暂无账号模型列表接口，已加载官方推荐模型；启用前仍会真实调用测试`,
      });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "模型列表同步失败" }, 400);
    }
  }

  let testResult: { resolvedModel: string };
  const testingPersistedConfiguration = !body?.apiKey?.trim() && model === current.model;
  try {
    testResult = await testProvider(provider, apiKey, model);
  } catch (error) {
    if (testingPersistedConfiguration) {
      await recordAIProviderCheck(config.DB, {
        provider: provider.id,
        model,
        ok: false,
        resolvedModel: null,
        detail: error instanceof Error ? error.message : "连接测试失败",
        checkedAt: Date.now(),
      }).catch(checkError => console.error("Unable to record provider test failure", checkError));
    }
    return json({ error: error instanceof Error ? error.message : "连接测试失败" }, 400);
  }

  if (action === "test") {
    if (testingPersistedConfiguration) {
      await recordAIProviderCheck(config.DB, {
        provider: provider.id,
        model,
        ok: true,
        resolvedModel: testResult.resolvedModel,
        detail: "真实对话请求已返回可用文本",
        checkedAt: Date.now(),
      });
    }
    return json({
      ok: true,
      configured: Boolean(current.apiKey),
      verified: true,
      resolvedModel: testResult.resolvedModel,
      message: `${provider.label} 真实请求成功，响应模型：${testResult.resolvedModel}${testingPersistedConfiguration ? "" : "；当前仅测试了未保存配置"}`,
    });
  }
  if (action === "activate") {
    if (!current.apiKey) return json({ error: `请先保存 ${provider.label} API Key` }, 409);
    if (current.source === "environment" && model !== current.model) {
      return json({ error: "该平台模型由环境变量提供，不能在后台改名；请恢复原模型或修改站点环境变量" }, 409);
    }
    const now = Date.now();
    await config.DB.batch([
      ...(current.source !== "environment" ? [
        config.DB.prepare(`INSERT INTO app_settings (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
          .bind(`ai_model:${provider.id}`, model, now),
      ] : []),
      config.DB.prepare(`INSERT INTO app_settings (key, value, updated_at)
        VALUES ('ai_active_provider', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
        .bind(provider.id, now),
      config.DB.prepare("INSERT INTO admin_audit (id, actor_email, action, target, detail, created_at) VALUES (?, ?, 'ai_provider_activate', ?, ?, ?)")
        .bind(crypto.randomUUID(), context.user!.email, provider.id, JSON.stringify({ model }), now),
    ]);
    await recordAIProviderCheck(config.DB, {
      provider: provider.id,
      model,
      ok: true,
      resolvedModel: testResult.resolvedModel,
      detail: "真实对话请求已返回可用文本",
      checkedAt: now,
    });
    const [activeRow, effective] = await Promise.all([
      config.DB.prepare("SELECT value FROM app_settings WHERE key = 'ai_active_provider'").first<{ value: string }>(),
      getAISettingsForProvider(config, "deepseek"),
    ]);
    if (activeRow?.value !== provider.id || effective.provider !== provider.id || effective.model !== model) {
      console.error("AI provider activation readback mismatch", {
        requestedProvider: provider.id,
        storedProvider: activeRow?.value,
        effectiveProvider: effective.provider,
        requestedModel: model,
        effectiveModel: effective.model,
      });
      return json({ error: "切换写入后复核不一致，系统没有冒充成功；请刷新后重试" }, 409);
    }
    return json({
      ok: true,
      configured: true,
      verified: true,
      activeProvider: effective.provider,
      model: effective.model,
      resolvedModel: testResult.resolvedModel,
      message: `已实测并切换到 ${provider.label} · ${model}；故障时会明确提示且不扣次数`,
    });
  }
  if (!config.CONFIG_ENCRYPTION_KEY) return json({ error: "安全存储尚未初始化，请联系站点维护者" }, 503);

  const encrypted = await encryptSetting(apiKey, config.CONFIG_ENCRYPTION_KEY);
  const now = Date.now();
  await config.DB.batch([
    config.DB.prepare(`INSERT INTO secret_settings (key, encrypted_value, iv, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET encrypted_value = excluded.encrypted_value, iv = excluded.iv, updated_at = excluded.updated_at`)
      .bind(`ai_api_key:${provider.id}`, encrypted.encryptedValue, encrypted.iv, now),
    config.DB.prepare(`INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .bind(`ai_model:${provider.id}`, model, now),
    config.DB.prepare(`INSERT INTO app_settings (key, value, updated_at)
      VALUES ('ai_active_provider', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .bind(provider.id, now),
    config.DB.prepare("INSERT INTO admin_audit (id, actor_email, action, target, detail, created_at) VALUES (?, ?, 'ai_provider_save', ?, ?, ?)")
      .bind(crypto.randomUUID(), context.user!.email, provider.id, JSON.stringify({ model, resolvedModel: testResult.resolvedModel }), now),
  ]);
  await recordAIProviderCheck(config.DB, {
    provider: provider.id,
    model,
    ok: true,
    resolvedModel: testResult.resolvedModel,
    detail: "真实对话请求已返回可用文本",
    checkedAt: now,
  });
  const [activeRow, effective] = await Promise.all([
    config.DB.prepare("SELECT value FROM app_settings WHERE key = 'ai_active_provider'").first<{ value: string }>(),
    getAISettingsForProvider(config, "deepseek"),
  ]);
  if (activeRow?.value !== provider.id || effective.provider !== provider.id || effective.model !== model) {
    console.error("AI provider save readback mismatch", {
      requestedProvider: provider.id,
      storedProvider: activeRow?.value,
      effectiveProvider: effective.provider,
      requestedModel: model,
      effectiveModel: effective.model,
    });
    return json({ error: "保存后复核不一致，系统没有冒充启用成功；请刷新后重试" }, 409);
  }
  return json({
    ok: true,
    configured: true,
    verified: true,
    activeProvider: effective.provider,
    model: effective.model,
    resolvedModel: testResult.resolvedModel,
    message: `已加密保存、真实测试并启用 ${provider.label} · ${model}`,
  });
}

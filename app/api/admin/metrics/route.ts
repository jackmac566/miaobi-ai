import {
  chinaDayStart,
  ensureSchema,
  getAIProviderVerification,
  getAISettingsForProvider,
  hasAdminAccess,
  isRootAdmin,
  json,
  requestUser,
  runtimeEnv,
} from "../../../../lib/runtime";
import { latestChangelog } from "../../../../lib/changelog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = requestUser(request);
  const config = await runtimeEnv();
  if (!user) return json({ error: "请先登录" }, 401);
  if (!await hasAdminAccess(user.email, config)) return json({ error: "无权访问运营后台" }, 403);
  await ensureSchema(config.DB);
  const aiSettings = await getAISettingsForProvider(config, "deepseek");
  const verification = aiSettings.apiKey
    ? await getAIProviderVerification(config.DB, aiSettings.provider, aiSettings.model)
    : null;
  const today = chinaDayStart();
  const week = Date.now() - 7 * 86400000;
  const now = Date.now();
  const [
    users,
    generations,
    paid,
    revenue,
    totalUsers,
    activeMembers,
    weekGenerations,
    totalGenerations,
    todayDeepSeek,
    todayLegacy,
    refundedOrders,
    delegatedAdmins,
    rollingDeepSeek,
    rollingTokens,
    totalRevenue,
    popular,
    recent,
    audit,
  ] = await Promise.all([
    config.DB.prepare("SELECT COUNT(*) total FROM users WHERE created_at >= ?").bind(today).first<{ total: number }>(),
    config.DB.prepare("SELECT COUNT(*) total FROM generations WHERE created_at >= ?").bind(today).first<{ total: number }>(),
    config.DB.prepare("SELECT COUNT(*) total FROM orders WHERE status = 'paid' AND paid_at >= ?").bind(today).first<{ total: number }>(),
    config.DB.prepare("SELECT COALESCE(SUM(amount_fen), 0) total FROM orders WHERE status = 'paid' AND paid_at >= ?").bind(today).first<{ total: number }>(),
    config.DB.prepare("SELECT COUNT(*) total FROM users").first<{ total: number }>(),
    config.DB.prepare("SELECT COUNT(*) total FROM users WHERE plan != 'free' AND (plan_expires_at IS NULL OR plan_expires_at > ?)").bind(now).first<{ total: number }>(),
    config.DB.prepare("SELECT COUNT(*) total FROM generations WHERE created_at >= ?").bind(week).first<{ total: number }>(),
    config.DB.prepare("SELECT COUNT(*) total FROM generations").first<{ total: number }>(),
    config.DB.prepare("SELECT COUNT(*) total FROM generations WHERE created_at >= ? AND model LIKE 'deepseek-%'").bind(today).first<{ total: number }>(),
    config.DB.prepare("SELECT COUNT(*) total FROM generations WHERE created_at >= ? AND model NOT LIKE 'deepseek-%'").bind(today).first<{ total: number }>(),
    config.DB.prepare("SELECT COUNT(*) total FROM orders WHERE status = 'refunded'").first<{ total: number }>(),
    config.DB.prepare("SELECT COUNT(*) total FROM site_admins WHERE active = 1").first<{ total: number }>(),
    config.DB.prepare("SELECT COUNT(*) total FROM generations WHERE created_at >= ? AND model LIKE 'deepseek-%'")
      .bind(now - 86_400_000).first<{ total: number }>(),
    config.DB.prepare(`SELECT COALESCE(SUM(prompt_tokens), 0) prompt, COALESCE(SUM(completion_tokens), 0) completion
      FROM generations WHERE created_at >= ? AND model LIKE 'deepseek-%'`)
      .bind(now - 86_400_000).first<{ prompt: number; completion: number }>(),
    config.DB.prepare("SELECT COALESCE(SUM(amount_fen), 0) total FROM orders WHERE status = 'paid'")
      .first<{ total: number }>(),
    config.DB.prepare("SELECT scene, COUNT(*) total FROM generations WHERE created_at >= ? GROUP BY scene ORDER BY total DESC LIMIT 5").bind(week).all(),
    config.DB.prepare("SELECT scene, created_at FROM generations ORDER BY created_at DESC LIMIT 8").all(),
    config.DB.prepare("SELECT actor_email, action, target, created_at FROM admin_audit ORDER BY created_at DESC LIMIT 10")
      .all<{ actor_email: string; action: string; target: string; created_at: number }>(),
  ]);
  const aiOperational = Boolean(aiSettings.apiKey && verification?.ok);
  const secureStorageReady = Boolean(config.CONFIG_ENCRYPTION_KEY);
  const rootAdminReady = Boolean(config.ADMIN_EMAIL?.trim());
  const siteLimit = Math.max(1, Math.min(100_000, Number(config.AI_SITE_DAILY_LIMIT || 500) || 500));
  const rollingUsage = Number(rollingDeepSeek?.total || 0);
  const siteRemaining = Math.max(0, siteLimit - rollingUsage);
  const alerts: Array<{ level: "ok" | "info" | "warning"; title: string; detail: string }> = [];
  if (!secureStorageReady) alerts.push({
    level: "warning",
    title: "模型密钥加密尚未配置",
    detail: "请设置 CONFIG_ENCRYPTION_KEY；未配置前不要在后台保存新的 API Key。",
  });
  if (!rootAdminReady) alerts.push({
    level: "warning",
    title: "主管理员邮箱尚未配置",
    detail: "请设置 ADMIN_EMAIL，避免只有临时或委派管理员能进入后台。",
  });
  if (!aiOperational) alerts.push({
    level: "warning",
    title: "DeepSeek 当前不可提供生成",
    detail: aiSettings.apiKey
      ? "DeepSeek 密钥已保存，但最近一次真实请求没有通过；访客会收到明确错误且不扣次数。"
      : "尚未配置 DeepSeek API Key；访客生成会暂停，不会用低质量备用文本冒充。",
  });
  if (siteRemaining <= Math.max(5, Math.ceil(siteLimit * 0.2))) alerts.push({
    level: siteRemaining === 0 ? "warning" : "info",
    title: siteRemaining === 0 ? "站点 DeepSeek 总额度已用完" : "站点 DeepSeek 总额度接近上限",
    detail: `近 24 小时已使用 ${rollingUsage} / ${siteLimit} 次，剩余 ${siteRemaining} 次。`,
  });
  alerts.push({
    level: "info",
    title: "收款仍为人工核验",
    detail: "扫码不会自动开通；请核对真实到账、用户登录邮箱和金额后再登记会员。",
  });
  if (!alerts.some(item => item.level === "warning")) alerts.unshift({
    level: "ok",
    title: "关键后台配置未发现阻断项",
    detail: "数据库、管理员入口和密钥加密配置均已就绪；仍建议定期运行系统验收。",
  });
  return json({
    updatedAt: Date.now(),
    release: latestChangelog.version,
    currentUser: {
      email: user.email,
      role: isRootAdmin(user.email, config) ? "root" : "admin",
    },
    cards: {
      newUsers: Number(users?.total || 0),
      generations: Number(generations?.total || 0),
      paidOrders: Number(paid?.total || 0),
      revenueFen: Number(revenue?.total || 0),
      totalUsers: Number(totalUsers?.total || 0),
      activeMembers: Number(activeMembers?.total || 0),
      weekGenerations: Number(weekGenerations?.total || 0),
      totalGenerations: Number(totalGenerations?.total || 0),
      todayDeepSeek: Number(todayDeepSeek?.total || 0),
      todayLegacy: Number(todayLegacy?.total || 0),
      refundedOrders: Number(refundedOrders?.total || 0),
      activeAdmins: Number(delegatedAdmins?.total || 0) + (rootAdminReady ? 1 : 0),
      rollingDeepSeek: rollingUsage,
      siteLimit,
      siteRemaining,
      rollingPromptTokens: Number(rollingTokens?.prompt || 0),
      rollingCompletionTokens: Number(rollingTokens?.completion || 0),
      totalRevenueFen: Number(totalRevenue?.total || 0),
      memberConversionRate: Number(totalUsers?.total || 0)
        ? Number(((Number(activeMembers?.total || 0) / Number(totalUsers?.total || 1)) * 100).toFixed(1))
        : 0,
    },
    popular: popular.results,
    recent: recent.results,
    audit: audit.results,
    alerts,
    systems: {
      ai: aiOperational,
      aiConfigured: Boolean(aiSettings.apiKey),
      aiVerifiedAt: verification?.ok ? verification.checkedAt : null,
      provider: aiSettings.provider,
      providerLabel: aiSettings.providerLabel,
      model: aiSettings.model,
      paymentMode: "manual",
      database: true,
      secureStorage: secureStorageReady,
      rootAdmin: rootAdminReady,
    },
  });
}

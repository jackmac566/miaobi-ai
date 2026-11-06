import {
  ensureSchema,
  getAIProviderVerification,
  getAISettingsForProvider,
  hasAdminAccess,
  json,
  readRollingUsage,
  requestUser,
  runtimeEnv,
  touchUser,
  visitorUsageKey,
} from "../../../lib/runtime";
import { capabilitiesFor, hasActiveMembership, MEMBERSHIP_TIERS } from "../../../lib/membership";

export const dynamic = "force-dynamic";
const FREE_TIER = MEMBERSHIP_TIERS.free;
const MEMBER_TIER = MEMBERSHIP_TIERS.member;

export async function GET(request: Request) {
  const config = await runtimeEnv();
  await ensureSchema(config.DB);
  const user = requestUser(request);
  const deepSeek = await getAISettingsForProvider(config, "deepseek");
  const verification = deepSeek.apiKey
    ? await getAIProviderVerification(config.DB, "deepseek", deepSeek.model)
    : null;
  const deepSeekOperational = Boolean(deepSeek.apiKey && verification?.ok);

  if (!user) {
    const userKey = await visitorUsageKey(request);
    const usage = await readRollingUsage(config.DB, userKey);
    return json({
      signedIn: false,
      name: "访客",
      remaining: Math.max(0, FREE_TIER.dailyLimit - usage.used),
      resetsAt: usage.resetsAt,
      isAdmin: false,
      isMember: false,
      aiConfigured: Boolean(deepSeek.apiKey),
      aiOperational: deepSeekOperational,
      aiProvider: "deepseek",
      aiProviderLabel: "DeepSeek",
      aiModel: deepSeek.model,
      generationMode: "deepseek",
      capabilities: capabilitiesFor(false, Boolean(deepSeek.apiKey)),
      signInPath: "/signin-with-chatgpt?return_to=%2F",
    });
  }

  await touchUser(config.DB, user);
  const row = await config.DB.prepare("SELECT plan, plan_expires_at FROM users WHERE email = ?")
    .bind(user.email).first<{ plan: string; plan_expires_at: number | null }>();
  const activePlan = hasActiveMembership(row?.plan, row?.plan_expires_at);
  const isAdmin = await hasAdminAccess(user.email, config);
  const premiumAccess = activePlan || isAdmin;
  const usage = await readRollingUsage(config.DB, user.email);
  const dailyLimit = premiumAccess ? MEMBER_TIER.dailyLimit : FREE_TIER.dailyLimit;

  return json({
    signedIn: true,
    name: user.name,
    plan: activePlan ? row?.plan : "free",
    planExpiresAt: activePlan ? row?.plan_expires_at : null,
    isMember: activePlan,
    remaining: Math.max(0, dailyLimit - usage.used),
    resetsAt: usage.resetsAt,
    isAdmin,
    aiConfigured: Boolean(deepSeek.apiKey),
    aiOperational: deepSeekOperational,
    aiProvider: "deepseek",
    aiProviderLabel: "DeepSeek",
    aiModel: deepSeek.model,
    generationMode: "deepseek",
    capabilities: capabilitiesFor(premiumAccess, Boolean(deepSeek.apiKey)),
    signInPath: "/signin-with-chatgpt?return_to=%2F",
  });
}

/**
 * 注销账号与删除数据：
 * 删除生成记录、每日用量、滚动额度窗口和站内账号信息。
 * 订单记录（财务凭证）与站长审计日志按法规保留，不随注销删除。
 */
export async function DELETE(request: Request) {
  const config = await runtimeEnv();
  await ensureSchema(config.DB);
  const user = requestUser(request);
  if (!user) return json({ error: "请先登录后再注销账号" }, 401);
  if (await hasAdminAccess(user.email, config)) {
    return json({ error: "站长账号不能注销；请先在运营后台更换站长邮箱" }, 403);
  }
  await config.DB.batch([
    config.DB.prepare("DELETE FROM generations WHERE user_email = ?").bind(user.email),
    config.DB.prepare("DELETE FROM daily_usage WHERE user_email = ?").bind(user.email),
    config.DB.prepare("DELETE FROM usage_windows WHERE user_key = ?").bind(user.email),
    config.DB.prepare("DELETE FROM users WHERE email = ?").bind(user.email),
  ]);
  return json({ ok: true, deleted: true });
}

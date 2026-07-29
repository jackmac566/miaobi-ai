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

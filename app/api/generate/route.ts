import {
  ensureSchema,
  getAISettingsForProvider,
  hasAdminAccess,
  json,
  recordAIProviderCheck,
  releaseRollingUsage,
  requestUser,
  reserveRollingUsage,
  runtimeEnv,
  touchUser,
  visitorUsageKey,
} from "../../../lib/runtime";
import { fetchAIChat, providerErrorMessage, readAIChatResponse } from "../../../lib/ai-providers";
import { hasActiveMembership, MEMBERSHIP_TIERS } from "../../../lib/membership";
import { appliedControlSummary } from "../../../lib/writing-controls";
import {
  buildWritingPrompt,
  parseGeneratedVersions,
  unsupportedClaims,
  unsupportedFactInferences,
  unsupportedNumbers,
  WRITING_SYSTEM_PROMPT,
  type WritingOptions,
} from "../../../lib/writing-quality";

export const dynamic = "force-dynamic";
const FREE_TIER = MEMBERSHIP_TIERS.free;
const MEMBER_TIER = MEMBERSHIP_TIERS.member;

const blocked = [
  /(?:诈骗|洗钱|套现|跑分).{0,16}(?:话术|教程|引流|推广|脚本)/i,
  /(?:赌博|博彩|六合彩).{0,16}(?:推广|引流|招募|广告|话术)/i,
  /(?:色情|招嫖|裸聊).{0,16}(?:推广|引流|招募|广告|话术)/i,
  /(?:毒品|冰毒|海洛因).{0,16}(?:制作|配方|贩卖|推广|教程)/i,
  /(?:代写|枪手).{0,12}(?:论文|作业|考试)/i,
];

type RequestBody = {
  scene?: string;
  topic?: string;
  details?: string;
  audience?: string;
  purpose?: string;
  requirements?: string;
  style?: string;
  length?: string;
  tool?: string;
  preference?: string;
  intensity?: "轻度" | "标准" | "深度";
  versionCount?: number;
  options?: Partial<WritingOptions>;
};

function safeResults(content: string, versionCount: number, sourceMaterial: string) {
  return parseGeneratedVersions(content, versionCount)
    .map(item => item.trim())
    .filter(Boolean)
    .filter(item =>
      unsupportedNumbers(item, sourceMaterial).length === 0
      && unsupportedClaims(item, sourceMaterial).length === 0
      && unsupportedFactInferences(item, sourceMaterial).length === 0
    )
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, versionCount);
}

function candidateViolations(content: string, versionCount: number, sourceMaterial: string) {
  const findings = new Set<string>();
  for (const item of parseGeneratedVersions(content, versionCount)) {
    for (const value of unsupportedNumbers(item, sourceMaterial)) findings.add(`新增数字：${value}`);
    for (const value of unsupportedClaims(item, sourceMaterial)) findings.add(`无依据结论：${value}`);
    for (const value of unsupportedFactInferences(item, sourceMaterial)) findings.add(`无依据推断：${value}`);
  }
  return [...findings].slice(0, 12);
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "请求来源校验失败" }, 403);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 64 * 1024) return json({ error: "请求内容过大，请缩短后重试" }, 413);

  const body = await request.json().catch(() => null) as RequestBody | null;
  const topic = body?.topic?.trim() || "";
  const details = body?.details?.trim() || "";
  const audience = body?.audience?.trim() || "";
  const purpose = body?.purpose?.trim() || "";
  const requirements = body?.requirements?.trim() || "";
  const fullMaterial = [topic, details, audience, purpose, requirements].filter(Boolean).join("\n");
  if (!topic || fullMaterial.length > 20_000) return json({ error: "请输入有效内容，全部素材合计不能超过 20,000 字" }, 400);
  if (blocked.some(pattern => pattern.test(fullMaterial))) return json({ error: "该请求不符合内容安全规则，请调整后重试" }, 400);

  const config = await runtimeEnv();
  await ensureSchema(config.DB);
  const user = requestUser(request);
  if (user) await touchUser(config.DB, user);
  const account = user
    ? await config.DB.prepare("SELECT plan, plan_expires_at FROM users WHERE email = ?")
      .bind(user.email).first<{ plan: string; plan_expires_at: number | null }>()
    : null;
  const paid = hasActiveMembership(account?.plan, account?.plan_expires_at);
  const premiumAccess = Boolean(user && (paid || await hasAdminAccess(user.email, config)));
  const dailyLimit = premiumAccess ? MEMBER_TIER.dailyLimit : FREE_TIER.dailyLimit;
  const inputLimit = premiumAccess ? MEMBER_TIER.inputChars : FREE_TIER.inputChars;
  const versionCount = body?.tool
    ? 1
    : premiumAccess
      ? Math.max(FREE_TIER.versions, Math.min(MEMBER_TIER.versions, Number(body?.versionCount) || MEMBER_TIER.versions))
      : FREE_TIER.versions;
  const options: WritingOptions = premiumAccess
    ? {
        emoji: body?.options?.emoji === true,
        autoFormat: body?.options?.autoFormat === true,
        riskGuard: body?.options?.riskGuard === true,
      }
    : { emoji: false, autoFormat: false, riskGuard: true };
  const appliedControls = appliedControlSummary({
    style: body?.style,
    tool: body?.tool,
    preference: body?.preference,
    intensity: body?.intensity,
    length: body?.length,
  });
  if (fullMaterial.length > inputLimit) {
    return json({
      error: premiumAccess
        ? `单次全部素材最多 ${MEMBER_TIER.inputChars} 字`
        : `免费访客单次全部素材最多 ${FREE_TIER.inputChars} 字，请缩短内容或升级会员`,
    }, 400);
  }

  const deepSeek = await getAISettingsForProvider(config, "deepseek");
  if (!deepSeek.apiKey) {
    return json({
      error: "DeepSeek 服务尚未配置，站长设置新 API Key 后即可恢复；本站不会用低质量备用内容冒充 AI 结果",
      code: "DEEPSEEK_NOT_CONFIGURED",
    }, 503);
  }

  const siteDailyLimit = Math.max(1, Math.min(100_000, Number(config.AI_SITE_DAILY_LIMIT || 500) || 500));
  const siteUsage = await config.DB.prepare("SELECT COUNT(*) total FROM generations WHERE created_at >= ? AND model LIKE 'deepseek-%'")
    .bind(Date.now() - 24 * 60 * 60 * 1000)
    .first<{ total: number }>();
  if (Number(siteUsage?.total || 0) >= siteDailyLimit) {
    return json({ error: "站点近 24 小时 DeepSeek 总额度已用完，请稍后再试", code: "SITE_QUOTA_EXCEEDED" }, 503);
  }

  const userKey = user?.email || await visitorUsageKey(request);
  const reservation = await reserveRollingUsage(config.DB, userKey, dailyLimit);
  if (!reservation.reserved) {
    return json({
      error: premiumAccess
        ? "当前 24 小时会员额度已用完，窗口结束后自动恢复"
        : `当前 24 小时 ${FREE_TIER.dailyLimit} 次免费额度已用完`,
      code: "QUOTA_EXCEEDED",
      resetsAt: reservation.resetsAt,
    }, 402);
  }

  const writingPrompt = buildWritingPrompt({
    scene: body?.scene || "通用文案",
    topic,
    details,
    audience,
    purpose,
    requirements,
    style: appliedControls.style,
    length: body?.length,
    tool: body?.tool,
    preference: appliedControls.preference || undefined,
    intensity: appliedControls.intensity || undefined,
    versions: versionCount,
    options,
  });
  let promptTokens = 0;
  let completionTokens = 0;
  let resolvedModel = deepSeek.model;
  let results: string[] = [];

  try {
    const firstResponse = await fetchAIChat({
      provider: "deepseek",
      apiKey: deepSeek.apiKey,
      model: deepSeek.model,
      messages: [
        { role: "system", content: WRITING_SYSTEM_PROMPT },
        { role: "user", content: writingPrompt },
      ],
      maxTokens: body?.tool ? 1800 : versionCount > 3 ? 4200 : 2800,
      temperature: body?.tool ? 0.15 : 0.65,
    });
    if (!firstResponse.ok) {
      const detail = await providerErrorMessage("deepseek", firstResponse);
      await recordAIProviderCheck(config.DB, {
        provider: "deepseek",
        model: deepSeek.model,
        ok: false,
        resolvedModel: null,
        detail,
        checkedAt: Date.now(),
      });
      await releaseRollingUsage(config.DB, reservation.key);
      return json({ error: `${detail}；本次不扣次数`, code: "DEEPSEEK_UNAVAILABLE" }, 503);
    }

    const first = await readAIChatResponse(firstResponse);
    promptTokens += first.usage?.prompt_tokens || 0;
    completionTokens += first.usage?.completion_tokens || 0;
    resolvedModel = first.resolvedModel || deepSeek.model;
    results = safeResults(first.content, versionCount, fullMaterial);

    if (results.length < versionCount) {
      const firstViolations = candidateViolations(first.content, versionCount, fullMaterial);
      const retryResponse = await fetchAIChat({
        provider: "deepseek",
        apiKey: deepSeek.apiKey,
        model: deepSeek.model,
        messages: [
          { role: "system", content: WRITING_SYSTEM_PROMPT },
          {
            role: "user",
            content: `${writingPrompt}

上一次输出未通过完整质量检查。请重新输出完整的 ${versionCount} 个版本：
检测到的具体问题：${firstViolations.length ? firstViolations.join("；") : "输出数量、格式或事实边界未通过"}。
1. 只能使用用户素材中的事实、数字、经历和评价；
2. 不得用“领先、最佳、亲测、保证、显著提升”等无依据结论；
3. 不得新增素材中没有的条件、资格、费用、报名预约、审核、时间流程或因果推断；“现场登记”不能改写成“无需提前报名”；
4. 删除上面列出的具体问题，原文中的绝对日期、时间、数字、地点和专有名词保持原样；
5. 文本处理不得增加“更轻松、更方便、不慌不忙”等主观结果或收尾评价；
6. 各版本必须在角度、开头和句式上明显不同；
7. 只输出最终成品，不解释修改过程。`,
          },
        ],
        maxTokens: body?.tool ? 1800 : versionCount > 3 ? 4200 : 2800,
        temperature: 0.1,
      });
      if (retryResponse.ok) {
        const retry = await readAIChatResponse(retryResponse);
        promptTokens += retry.usage?.prompt_tokens || 0;
        completionTokens += retry.usage?.completion_tokens || 0;
        resolvedModel = retry.resolvedModel || resolvedModel;
        const retryResults = safeResults(retry.content, versionCount, fullMaterial);
        if (retryResults.length > results.length) results = retryResults;
      }
    }

    if (!results.length) {
      await releaseRollingUsage(config.DB, reservation.key);
      return json({ error: "DeepSeek 本次输出未通过事实与质量检查，本次不扣次数，请补充真实素材后重试", code: "QUALITY_REJECTED" }, 422);
    }

    await recordAIProviderCheck(config.DB, {
      provider: "deepseek",
      model: deepSeek.model,
      ok: true,
      resolvedModel,
      detail: "真实生成请求已返回并通过质量检查",
      checkedAt: Date.now(),
    });
  } catch (error) {
    await releaseRollingUsage(config.DB, reservation.key);
    const detail = error instanceof Error ? error.message : "DeepSeek 请求异常";
    await recordAIProviderCheck(config.DB, {
      provider: "deepseek",
      model: deepSeek.model,
      ok: false,
      resolvedModel: null,
      detail,
      checkedAt: Date.now(),
    }).catch(recordError => console.error("Unable to record DeepSeek failure", recordError));
    return json({ error: `DeepSeek 暂时不可用，本次不扣次数：${detail.slice(0, 140)}`, code: "DEEPSEEK_UNAVAILABLE" }, 503);
  }

  const now = Date.now();
  try {
    await config.DB.prepare(`INSERT INTO generations
      (id, user_email, scene, topic, style, result_json, model, prompt_tokens, completion_tokens, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(),
        userKey,
        body?.tool || body?.scene || "通用文案",
        topic.slice(0, 500),
        appliedControls.style,
        JSON.stringify(results),
        resolvedModel,
        promptTokens,
        completionTokens,
        now,
      ).run();
  } catch (error) {
    await releaseRollingUsage(config.DB, reservation.key);
    console.error("Failed to persist DeepSeek generation; quota released", error);
    return json({ error: "生成结果保存失败，本次不扣次数，请稍后重试" }, 503);
  }

  return json({
    results,
    remaining: Math.max(0, dailyLimit - reservation.used),
    resetsAt: reservation.resetsAt,
    model: resolvedModel,
    engine: resolvedModel,
    engineLabel: `DeepSeek · ${resolvedModel}`,
    fallback: false,
    tier: premiumAccess ? "member" : "free",
    versionCount: results.length,
    appliedControls: {
      style: appliedControls.style,
      preference: appliedControls.preference,
      intensity: appliedControls.intensity,
      length: appliedControls.length,
    },
  });
}

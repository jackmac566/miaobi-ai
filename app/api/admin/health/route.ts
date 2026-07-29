import { latestChangelog } from "../../../../lib/changelog";
import { PRODUCT_COUNTS, PRODUCT_MODULES } from "../../../../lib/product-contract";
import {
  ensureSchema,
  getAIProviderVerification,
  getAISettingsForProvider,
  hasAdminAccess,
  isRootAdmin,
  json,
  requestUser,
  runtimeEnv,
} from "../../../../lib/runtime";

export const dynamic = "force-dynamic";

type CheckStatus = "pass" | "fallback" | "manual" | "attention";
type HealthCheck = {
  id: string;
  label: string;
  scope: "live" | "database" | "build" | "manual";
  status: CheckStatus;
  detail: string;
  action?: string;
};

export async function GET(request: Request) {
  const user = requestUser(request);
  const config = await runtimeEnv();
  if (!user) return json({ error: "请先登录" }, 401);
  if (!await hasAdminAccess(user.email, config)) return json({ error: "无权执行整站验收" }, 403);

  await ensureSchema(config.DB);
  const checks: HealthCheck[] = [];

  const databaseTables = [
    "users",
    "generations",
    "orders",
    "app_settings",
    "secret_settings",
    "daily_usage",
    "usage_windows",
    "site_admins",
    "admin_audit",
    "ai_provider_checks",
  ] as const;
  try {
    const tableResults = await Promise.all(databaseTables.map(table =>
      config.DB.prepare(`SELECT COUNT(*) AS total FROM ${table}`).first<{ total: number }>(),
    ));
    const rowTotal = tableResults.reduce((sum, row) => sum + Number(row?.total || 0), 0);
    checks.push({
      id: "database",
      label: "数据库与业务表",
      scope: "database",
      status: "pass",
      detail: `${databaseTables.length} 张关键表均可读取，当前合计 ${rowTotal} 条业务记录。`,
    });
  } catch {
    checks.push({
      id: "database",
      label: "数据库与业务表",
      scope: "database",
      status: "attention",
      detail: "至少一张关键业务表无法读取。",
      action: "先暂停会员开通和模型切换，再检查 D1 数据库绑定与迁移。",
    });
  }

  const aiSettings = await getAISettingsForProvider(config, "deepseek");
  const verification = aiSettings.apiKey
    ? await getAIProviderVerification(config.DB, "deepseek", aiSettings.model)
    : null;
  const externalOperational = Boolean(aiSettings.apiKey && verification?.ok);
  checks.push({
    id: "deepseek",
    label: "DeepSeek 生成服务",
    scope: "live",
    status: externalOperational ? "pass" : "attention",
    detail: externalOperational
      ? `DeepSeek · ${aiSettings.model} 最近一次真实请求验证通过。`
      : aiSettings.apiKey
        ? `DeepSeek · ${aiSettings.model} 未通过最近一次验证；访客请求会明确失败且不扣次数。`
        : "未配置 DeepSeek API Key，当前不能生成；系统不会用备用模板冒充 AI。",
    action: externalOperational ? undefined : "在“DeepSeek 设置”中粘贴新密钥，执行“保存、实测并启用”。",
  });

  const rootAdminReady = Boolean(config.ADMIN_EMAIL?.trim());
  checks.push({
    id: "login",
    label: "用户登录与站长权限",
    scope: "live",
    status: rootAdminReady ? "pass" : "attention",
    detail: rootAdminReady
      ? `当前账号 ${user.email} 已通过安全登录与管理员白名单校验。`
      : `当前账号已获管理员权限，但 ADMIN_EMAIL 尚未配置，主管理员身份缺少固定锚点。`,
    action: rootAdminReady ? undefined : "在站点运行环境中设置 ADMIN_EMAIL。",
  });

  const secureStorageReady = Boolean(config.CONFIG_ENCRYPTION_KEY);
  checks.push({
    id: "secrets",
    label: "API Key 加密存储",
    scope: "live",
    status: secureStorageReady ? "pass" : "attention",
    detail: secureStorageReady
      ? "服务端 AES-256-GCM 加密配置已就绪，前端不会回显已保存密钥。"
      : "CONFIG_ENCRYPTION_KEY 未配置，后台不能安全保存新的模型密钥。",
    action: secureStorageReady ? undefined : "生成 32 字节 Base64 密钥并写入 CONFIG_ENCRYPTION_KEY。",
  });

  checks.push(
    {
      id: "public-modules",
      label: "访客前台模块",
      scope: "build",
      status: "pass",
      detail: `${PRODUCT_COUNTS.writingScenes} 个文案场景、${PRODUCT_COUNTS.textTools} 个文本工具、素材搜索、历史收藏和移动端入口已纳入同源构建测试。`,
    },
    {
      id: "quota-membership",
      label: "额度与会员差异",
      scope: "build",
      status: "pass",
      detail: `访客滚动 24 小时 ${PRODUCT_COUNTS.freeDailyLimit} 次 / ${PRODUCT_COUNTS.freeVersions} 个版本；会员滚动 24 小时 ${PRODUCT_COUNTS.memberDailyLimit} 次 / ${PRODUCT_COUNTS.memberVersions} 个版本，并开放长素材、高级控制与整组导出。`,
    },
    {
      id: "payments",
      label: "微信与支付宝收款",
      scope: "manual",
      status: "manual",
      detail: "两张二维码由构建测试校验原图摘要；当前是个人码人工核验，不能自动判断到账或自动开通。",
      action: "每笔付款先核对真实到账、金额和用户登录邮箱，再在“会员开通”登记。",
    },
    {
      id: "history",
      label: "历史、收藏与本机数据",
      scope: "build",
      status: "pass",
      detail: "生成、编辑、收藏、删除和继续创作均使用浏览器本机存储；不会把访客草稿伪装成云端同步。",
    },
    {
      id: "release",
      label: "公开更新日志与发布版本",
      scope: "build",
      status: "pass",
      detail: `${latestChangelog.version} 为当前公开版本，更新记录从正式产品 V1.0.0 开始，访客可独立访问 /updates。`,
    },
  );

  const summary = {
    total: checks.length,
    passed: checks.filter(item => item.status === "pass").length,
    fallback: checks.filter(item => item.status === "fallback").length,
    manual: checks.filter(item => item.status === "manual").length,
    attention: checks.filter(item => item.status === "attention").length,
  };

  return json({
    checkedAt: Date.now(),
    release: latestChangelog.version,
    currentUser: {
      email: user.email,
      role: isRootAdmin(user.email, config) ? "root" : "admin",
    },
    contract: {
      moduleCount: PRODUCT_MODULES.length,
      modules: PRODUCT_MODULES,
      counts: PRODUCT_COUNTS,
    },
    summary,
    checks,
    note: "整站验收不会向外部模型发送付费请求；外部模型状态采用最近一次真实连接测试结果。",
  });
}

import { json, runtimeEnv } from "../../../lib/runtime";
import { MEMBERSHIP_TIERS } from "../../../lib/membership";
import { VERSION } from "../../../lib/version";

export const dynamic = "force-dynamic";

/** 公开健康检查：前端用于自动检测新版本，不返回任何敏感信息。 */
export async function GET() {
  const config = await runtimeEnv();
  let database = true;
  try {
    await config.DB.prepare("SELECT 1").first();
  } catch {
    database = false;
  }
  return json({
    ok: true,
    release: VERSION,
    database,
    deepSeekConfigured: Boolean(config.DEEPSEEK_API_KEY),
    model: config.DEEPSEEK_MODEL || "deepseek-v4-flash",
    freeLimit: MEMBERSHIP_TIERS.free.dailyLimit,
    windowHours: 24,
  });
}

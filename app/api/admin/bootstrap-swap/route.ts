import { ensureSchema, json, runtimeEnv } from "../../../../lib/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const config = await runtimeEnv();
  const expected = config.ADMIN_SWAP_TOKEN?.trim();
  const supplied = request.headers.get("x-admin-swap-token")?.trim();
  if (!expected || !supplied || supplied !== expected) {
    return json({ error: "迁移入口未启用" }, 404);
  }

  const body = await request.json().catch(() => null) as null | { previousAdmin?: string };
  const previousAdmin = body?.previousAdmin?.trim().toLowerCase() || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(previousAdmin) || previousAdmin.length > 254) {
    return json({ error: "原主管理员邮箱格式不正确" }, 400);
  }
  if (!config.ADMIN_EMAIL || previousAdmin === config.ADMIN_EMAIL.trim().toLowerCase()) {
    return json({ error: "主管理员交换配置不正确" }, 409);
  }

  await ensureSchema(config.DB);
  const now = Date.now();
  await config.DB.prepare(`INSERT INTO site_admins (email, active, created_by, created_at, updated_at)
    VALUES (?, 1, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET active = 1, updated_at = excluded.updated_at`)
    .bind(previousAdmin, config.ADMIN_EMAIL.trim().toLowerCase(), now, now).run();

  return json({ ok: true, message: "主管理员身份交换完成" });
}

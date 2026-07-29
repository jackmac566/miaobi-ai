import {
  ensureSchema,
  hasAdminAccess,
  isRootAdmin,
  json,
  requestUser,
  runtimeEnv,
} from "../../../../lib/runtime";

export const dynamic = "force-dynamic";

async function context(request: Request) {
  const user = requestUser(request);
  const config = await runtimeEnv();
  if (!user) return { error: json({ error: "请先登录" }, 401) };
  if (!await hasAdminAccess(user.email, config)) return { error: json({ error: "无权访问站长管理" }, 403) };
  await ensureSchema(config.DB);
  return { user, config };
}

export async function GET(request: Request) {
  const current = await context(request);
  if (current.error) return current.error;
  const { user, config } = current;
  const delegated = await config.DB.prepare(`SELECT email, active, created_by, created_at, updated_at
    FROM site_admins ORDER BY created_at ASC`).all();
  return json({
    canManage: isRootAdmin(user.email, config),
    currentEmail: user.email,
    root: config.ADMIN_EMAIL ? { email: config.ADMIN_EMAIL.trim().toLowerCase(), active: true, role: "root" } : null,
    delegated: delegated.results.map(row => ({ ...row, role: "admin", active: Number(row.active) === 1 })),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "请求来源校验失败" }, 403);
  const current = await context(request);
  if (current.error) return current.error;
  const { user, config } = current;
  if (!isRootAdmin(user.email, config)) return json({ error: "只有主管理员可以添加、停用或删除其他站长" }, 403);

  const body = await request.json().catch(() => null) as null | {
    action?: "add" | "enable" | "disable" | "remove";
    email?: string;
  };
  const action = body?.action;
  const email = body?.email?.trim().toLowerCase() || "";
  if (!action || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ error: "请输入有效的登录邮箱" }, 400);
  }
  if (isRootAdmin(email, config)) return json({ error: "主管理员身份不能在这里停用或删除" }, 409);

  if (action === "add") {
    const now = Date.now();
    await config.DB.batch([
      config.DB.prepare(`INSERT INTO site_admins (email, active, created_by, created_at, updated_at)
        VALUES (?, 1, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET active = 1, updated_at = excluded.updated_at`)
        .bind(email, user.email, now, now),
      config.DB.prepare("INSERT INTO admin_audit (id, actor_email, action, target, detail, created_at) VALUES (?, ?, 'admin_add', ?, '{}', ?)")
        .bind(crypto.randomUUID(), user.email, email, now),
    ]);
    return json({ ok: true, message: "站长身份已添加" });
  }
  if (action === "remove") {
    const now = Date.now();
    await config.DB.batch([
      config.DB.prepare("DELETE FROM site_admins WHERE email = ?").bind(email),
      config.DB.prepare("INSERT INTO admin_audit (id, actor_email, action, target, detail, created_at) VALUES (?, ?, 'admin_remove', ?, '{}', ?)")
        .bind(crypto.randomUUID(), user.email, email, now),
    ]);
    return json({ ok: true, message: "站长身份及其授权记录已删除" });
  }
  const active = action === "enable" ? 1 : 0;
  const now = Date.now();
  await config.DB.batch([
    config.DB.prepare("UPDATE site_admins SET active = ?, updated_at = ? WHERE email = ?")
      .bind(active, now, email),
    config.DB.prepare("INSERT INTO admin_audit (id, actor_email, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), user.email, active ? "admin_enable" : "admin_disable", email, JSON.stringify({ active: Boolean(active) }), now),
  ]);
  return json({ ok: true, message: active ? "站长身份已恢复" : "站长身份已停用" });
}

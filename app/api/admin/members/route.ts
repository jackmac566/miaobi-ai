import { ensureSchema, hasAdminAccess, isRootAdmin, json, requestUser, runtimeEnv } from "../../../../lib/runtime";

export const dynamic = "force-dynamic";

type MembershipReadback = {
  email: string;
  plan: string;
  plan_expires_at: number | null;
};

async function adminContext(request: Request) {
  const user = requestUser(request);
  const config = await runtimeEnv();
  if (!user) return { error: json({ error: "请先登录" }, 401) };
  if (!await hasAdminAccess(user.email, config)) return { error: json({ error: "无权访问会员管理" }, 403) };
  await ensureSchema(config.DB);
  return { config, user };
}

export async function GET(request: Request) {
  const context = await adminContext(request);
  if (context.error) return context.error;
  const [users, orders] = await Promise.all([
    context.config!.DB.prepare(`SELECT email, display_name, plan, plan_expires_at, created_at, last_seen_at
      FROM users ORDER BY last_seen_at DESC LIMIT 100`).all(),
    context.config!.DB.prepare(`SELECT id, user_email, product, amount_fen, status, provider_trade_no, created_at, paid_at
      FROM orders ORDER BY created_at DESC LIMIT 50`).all(),
  ]);
  return json({
    canManage: isRootAdmin(context.user!.email, context.config!),
    users: users.results,
    orders: orders.results,
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "请求来源校验失败" }, 403);
  const context = await adminContext(request);
  if (context.error) return context.error;
  const config = context.config!;
  const actor = context.user!;
  if (!isRootAdmin(actor.email, config)) return json({ error: "只有主管理员可以开通或撤销会员" }, 403);
  const body = await request.json().catch(() => null) as null | {
    action?: "grant" | "revoke" | "refund";
    email?: string;
    plan?: "monthly" | "yearly" | "student";
    days?: number;
    amountFen?: number;
    paymentMethod?: "wechat" | "alipay" | "complimentary";
    paymentReference?: string;
    requestId?: string;
    orderId?: string;
  };
  const email = body?.email?.trim().toLowerCase() || "";
  if (body?.action !== "refund" && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
    return json({ error: "请输入正确的用户邮箱" }, 400);
  }
  const now = Date.now();

  if (body?.action === "refund") {
    const orderId = body.orderId?.trim() || "";
    if (!/^manual:[a-zA-Z0-9-]{8,80}$/.test(orderId)) return json({ error: "请选择有效的人工收款记录" }, 400);
    const order = await config.DB.prepare("SELECT id, user_email, amount_fen, status FROM orders WHERE id = ?")
      .bind(orderId).first<{ id: string; user_email: string; amount_fen: number; status: string }>();
    if (!order) return json({ error: "没有找到该收款记录" }, 404);
    if (order.status === "refunded") return json({ ok: true, message: "该记录已标记为退款" });
    if (order.status !== "paid") return json({ error: "当前订单状态不能标记退款" }, 409);
    await config.DB.batch([
      config.DB.prepare("UPDATE orders SET status = 'refunded' WHERE id = ? AND status = 'paid'").bind(orderId),
      config.DB.prepare("INSERT INTO admin_audit (id, actor_email, action, target, detail, created_at) VALUES (?, ?, 'manual_refund_marked', ?, ?, ?)")
        .bind(crypto.randomUUID(), actor.email, orderId, JSON.stringify({ userEmail: order.user_email, amountFen: order.amount_fen }), now),
    ]);
    return json({ ok: true, message: "已标记为人工退款；此操作只记录结果，不会自动从微信或支付宝退钱" });
  }

  if (body?.action === "revoke") {
    const before = await config.DB.prepare("SELECT email FROM users WHERE email = ?")
      .bind(email).first<{ email: string }>();
    if (!before) return json({ error: "没有找到该用户，未执行会员撤销" }, 404);
    await config.DB.batch([
      config.DB.prepare("UPDATE users SET plan = 'free', plan_expires_at = NULL WHERE email = ?").bind(email),
      config.DB.prepare("INSERT INTO admin_audit (id, actor_email, action, target, detail, created_at) VALUES (?, ?, 'member_revoke', ?, ?, ?)")
        .bind(crypto.randomUUID(), actor.email, email, JSON.stringify({ plan: "free" }), now),
    ]);
    const readback = await config.DB.prepare("SELECT email, plan, plan_expires_at FROM users WHERE email = ?")
      .bind(email).first<MembershipReadback>();
    if (!readback || readback.plan !== "free" || readback.plan_expires_at !== null) {
      return json({ error: "撤销写入后复核不一致，系统没有冒充成功；请刷新后重试" }, 409);
    }
    return json({
      ok: true,
      membershipActive: false,
      plan: "free",
      planExpiresAt: null,
      message: `已撤销 ${email} 的会员权益，并完成数据库读回确认`,
    });
  }

  const plan = body?.plan || "monthly";
  if (!(["monthly", "yearly", "student"] as const).includes(plan)) return json({ error: "会员套餐不正确" }, 400);
  const defaultDays = plan === "yearly" ? 365 : 30;
  const days = Math.floor(Number(body?.days || defaultDays));
  if (!Number.isFinite(days) || days < 1 || days > 3660) return json({ error: "会员天数必须为 1—3660 天" }, 400);
  const paymentMethod = body?.paymentMethod || "wechat";
  if (!(["wechat", "alipay", "complimentary"] as const).includes(paymentMethod)) return json({ error: "收款方式不正确" }, 400);
  const amountFen = paymentMethod === "complimentary" ? 0 : Math.floor(Number(body?.amountFen));
  if (!Number.isFinite(amountFen) || amountFen < 0 || amountFen > 10_000_000 || (paymentMethod !== "complimentary" && amountFen < 1)) {
    return json({ error: "实收金额必须大于 0 元" }, 400);
  }
  const paymentReference = body?.paymentReference?.trim().slice(0, 80) || "";
  const requestId = body?.requestId?.trim() || "";
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) return json({ error: "本次开通请求标识无效，请刷新后重试" }, 400);
  const orderId = `manual:${requestId}`;
  const orderStatus = paymentMethod === "complimentary" ? "complimentary" : "paid";
  const extension = days * 86_400_000;
  try {
    await config.DB.batch([
      config.DB.prepare(`INSERT INTO users (email, display_name, plan, plan_expires_at, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
          plan = excluded.plan,
          plan_expires_at = CASE
            WHEN users.plan_expires_at IS NOT NULL AND users.plan_expires_at > ? THEN users.plan_expires_at + ?
            ELSE excluded.plan_expires_at
          END`)
        .bind(email, email.split("@")[0], plan, now + extension, now, now, now, extension),
      config.DB.prepare(`INSERT INTO orders
        (id, user_email, product, amount_fen, status, provider_trade_no, created_at, paid_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(orderId, email, plan, amountFen, orderStatus, `manual_${paymentMethod}:${paymentReference || "no-reference"}`, now, now),
      config.DB.prepare("INSERT INTO admin_audit (id, actor_email, action, target, detail, created_at) VALUES (?, ?, 'member_grant', ?, ?, ?)")
        .bind(crypto.randomUUID(), actor.email, email, JSON.stringify({ plan, days, amountFen, paymentMethod, orderId }), now),
    ]);
  } catch (error) {
    const existing = await config.DB.prepare("SELECT id FROM orders WHERE id = ?").bind(orderId).first();
    if (existing) {
      const member = await config.DB.prepare("SELECT email, plan, plan_expires_at FROM users WHERE email = ?")
        .bind(email).first<MembershipReadback>();
      const membershipActive = Boolean(member && member.plan !== "free" && member.plan_expires_at && member.plan_expires_at > now);
      return json({
        ok: true,
        idempotent: true,
        membershipActive,
        plan: member?.plan || "free",
        planExpiresAt: member?.plan_expires_at || null,
        message: membershipActive
          ? "这笔收款已登记过，没有重复延长会员；现有会员状态已读回确认"
          : "这笔收款已登记过，但会员状态异常，请不要重复登记并立即检查该用户",
      }, membershipActive ? 200 : 409);
    }
    console.error("Failed to register manual payment", error);
    return json({ error: "人工收款登记失败，会员没有开通，请稍后重试" }, 503);
  }
  const [member, order] = await Promise.all([
    config.DB.prepare("SELECT email, plan, plan_expires_at FROM users WHERE email = ?")
      .bind(email).first<MembershipReadback>(),
    config.DB.prepare("SELECT id, user_email, product, amount_fen, status FROM orders WHERE id = ?")
      .bind(orderId).first<{ id: string; user_email: string; product: string; amount_fen: number; status: string }>(),
  ]);
  const membershipActive = Boolean(
    member
    && member.email === email
    && member.plan === plan
    && member.plan_expires_at
    && member.plan_expires_at > now,
  );
  const orderConfirmed = Boolean(
    order
    && order.user_email === email
    && order.product === plan
    && order.amount_fen === amountFen
    && order.status === orderStatus,
  );
  if (!membershipActive || !orderConfirmed) {
    console.error("Membership grant readback mismatch", {
      email,
      requestedPlan: plan,
      member,
      orderId,
      order,
    });
    return json({ error: "会员与收款记录写入后复核不一致，系统没有冒充成功；请立即在会员列表中核对" }, 409);
  }
  return json({
    ok: true,
    membershipActive: true,
    plan: member!.plan,
    planExpiresAt: member!.plan_expires_at,
    orderId,
    orderStatus,
    message: `已登记 ¥${(amountFen / 100).toFixed(2)}，并为 ${email} 开通 ${days} 天会员；数据库读回确认有效至 ${new Date(member!.plan_expires_at!).toLocaleDateString("zh-CN")}`,
  });
}

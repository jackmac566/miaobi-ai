import { useEffect, useState } from "react";

type APIResult = { error?: string };

async function api<T extends APIResult = APIResult>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({})) as T;
  if (!response.ok) throw new Error(data.error || "操作失败");
  return data;
}

export function DomesticLogin() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    if (mode === "register" && password !== passwordConfirm) {
      setError("两次输入的密码不一致");
      setBusy(false);
      return;
    }
    try {
      const result = await api<{ error?: string; role: "admin" | "user" }>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const requested = new URLSearchParams(location.search).get("return_to");
      const safeReturn = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/";
      location.href = result.role === "admin" ? "/admin" : safeReturn;
    } catch (next) {
      setError(next instanceof Error ? next.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  return <><a className="skip-link" href="#main-content">跳到登录表单</a><main className="domestic-login-shell" id="main-content">
    <section className="domestic-login-card">
      <button className="domestic-login-brand" type="button" onClick={() => { location.href = "/"; }}><span>✎</span><b>妙笔AI</b></button>
      <div className="domestic-login-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>登录</button>
        <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>注册</button>
      </div>
      <h1>{mode === "login" ? "欢迎回来" : "创建免费账户"}</h1>
      <p>{mode === "login" ? "用户与站长都从这里安全登录。" : "注册后可让站长按此邮箱真实开通会员。"}</p>
      <form onSubmit={submit}>
        <label htmlFor="account-email">邮箱</label>
        <input id="account-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" />
        <label htmlFor="account-password">密码</label>
        <input id="account-password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={10} maxLength={200} required value={password} onChange={event => setPassword(event.target.value)} placeholder="至少 10 位" />
        {mode === "register" && <>
          <label htmlFor="account-password-confirm">再次输入密码</label>
          <input id="account-password-confirm" type="password" autoComplete="new-password" minLength={10} maxLength={200} required value={passwordConfirm} onChange={event => setPasswordConfirm(event.target.value)} placeholder="再次输入，避免注册后无法登录" />
        </>}
        {error && <div className="domestic-login-error" role="alert">{error}</div>}
        <button className="primary" disabled={busy}>{busy ? "正在处理…" : mode === "login" ? "安全登录" : "注册并登录"}</button>
      </form>
      <small>{mode === "register" ? "当前不发送邮箱验证码，邮箱是会员开通与登录标识，请使用本人长期可记住的地址。" : "站长使用部署时配置的主管理员邮箱和密码。"} 密码只在服务端校验，不会写入网页。</small>
    </section>
  </main></>;
}

type Overview = {
  release: string;
  currentUser: { email: string; role: "admin" };
  cards: {
    users: number;
    activeMembers: number;
    rollingGenerations: number;
    siteRemaining: number;
    promptTokens: number;
    completionTokens: number;
    revenueFen: number;
    memberConversion: number;
  };
  systems: { deepSeekConfigured: boolean; model: string; database: boolean; rollingWindowHours: number; freeLimit: number; memberLimit: number; siteLimit: number };
  users: Array<{ email: string; display_name: string | null; plan: string; plan_expires_at: number | null; last_seen_at: number }>;
  orders: Array<{ id: string; user_email: string; product: string; amount_fen: number; status: string; provider_trade_no: string; created_at: number; paid_at: number | null }>;
  audit: Array<{ actor_email: string; action: string; target: string; detail: string; created_at: number }>;
};

export function DomesticAdmin() {
  const [renderedAt] = useState(() => Date.now());
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<"monthly" | "yearly" | "student">("monthly");
  const [days, setDays] = useState(30);
  const [method, setMethod] = useState<"wechat" | "alipay" | "complimentary">("wechat");
  const [amount, setAmount] = useState(19.9);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      setData(await api<Overview & APIResult>("/api/admin/overview"));
      setError("");
    } catch (next) {
      const detail = next instanceof Error ? next.message : "读取后台失败";
      if (detail.includes("登录")) {
        location.href = "/login?return_to=%2Fadmin";
        return;
      }
      setError(detail);
    }
  };

  useEffect(() => {
    const starter = setTimeout(load, 0);
    const timer = setInterval(load, 20000);
    return () => { clearTimeout(starter); clearInterval(timer); };
  }, []);

  const choosePlan = (next: "monthly" | "yearly" | "student") => {
    setPlan(next);
    setDays(next === "yearly" ? 365 : 30);
    setAmount(next === "yearly" ? 99 : next === "student" ? 9.9 : 19.9);
  };

  const changeMember = async (action: "grant" | "revoke", target = email) => {
    if (action === "revoke" && !confirm(`确定撤销 ${target} 的会员权益？`)) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await api<{ error?: string; message: string }>("/api/admin/members", {
        method: "POST",
        body: JSON.stringify({
          action,
          email: target,
          plan,
          days,
          paymentMethod: method,
          amountFen: method === "complimentary" ? 0 : Math.round(amount * 100),
          requestId: crypto.randomUUID(),
        }),
      });
      setMessage(result.message);
      if (action === "grant") setEmail("");
      await load();
    } catch (next) {
      setError(next instanceof Error ? next.message : "会员操作失败");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    location.href = "/";
  };

  const markRefunded = async (orderId: string, targetEmail: string) => {
    if (!confirm(`仅在已完成真实原路退款后继续。确定登记 ${orderId} 已退款？`)) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await api<{ error?: string; message: string }>("/api/admin/members", {
        method: "POST",
        body: JSON.stringify({ action: "refund", email: targetEmail, orderId }),
      });
      setMessage(result.message);
      await load();
    } catch (next) {
      setError(next instanceof Error ? next.message : "退款登记失败");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <main className="domestic-admin-shell" id="main-content"><p className={error ? "domestic-login-error" : ""}>{error || "正在读取真实运营数据…"}</p></main>;
  return <><a className="skip-link" href="#main-content">跳到运营数据</a><main className="domestic-admin-shell" id="main-content">
    <header>
      <div><span>OWNER CONSOLE · {data.release}</span><h1>妙笔AI 国内版运营后台</h1><p>{data.currentUser.email} · 每 20 秒读取一次真实 D1 数据</p></div>
      <div><button type="button" onClick={() => { location.href = "/"; }}>返回网站</button><button onClick={logout}>退出登录</button></div>
    </header>

    {error && <div className="domestic-login-error" role="alert">{error}</div>}
    {message && <div className="domestic-admin-success">✓ {message}</div>}

    <section className="domestic-admin-cards">
      <article><span>注册用户</span><b>{data.cards.users}</b></article>
      <article><span>有效会员</span><b>{data.cards.activeMembers}</b></article>
      <article><span>近 24 小时生成</span><b>{data.cards.rollingGenerations}</b></article>
      <article><span>站点剩余额度</span><b>{data.cards.siteRemaining}</b><small>/ {data.systems.siteLimit}</small></article>
      <article><span>近 24h Token</span><b>{(data.cards.promptTokens + data.cards.completionTokens).toLocaleString("zh-CN")}</b></article>
      <article><span>累计实收</span><b>¥{(data.cards.revenueFen / 100).toFixed(2)}</b></article>
      <article><span>会员转化率</span><b>{data.cards.memberConversion}%</b></article>
      <article><span>DeepSeek</span><b className={data.systems.deepSeekConfigured ? "ok" : "bad"}>{data.systems.deepSeekConfigured ? "已配置" : "未配置"}</b></article>
    </section>

    <section className="domestic-admin-panel">
      <div className="domestic-admin-heading"><div><h2>会员真实开通</h2><p>写入用户权益和人工订单后会立即读回；不一致时不会显示成功。</p></div><span>访客 {data.systems.freeLimit} 次 / 会员 {data.systems.memberLimit} 次 · 滚动 {data.systems.rollingWindowHours} 小时</span></div>
      <form className="domestic-member-form" onSubmit={event => { event.preventDefault(); changeMember("grant"); }}>
        <label>用户登录邮箱<input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="必须与用户登录邮箱完全一致" /></label>
        <label>套餐<select value={plan} onChange={event => choosePlan(event.target.value as typeof plan)}><option value="monthly">月度会员</option><option value="yearly">年度会员</option><option value="student">学生特惠</option></select></label>
        <label>天数<input type="number" min={1} max={3660} value={days} onChange={event => setDays(Number(event.target.value))} /></label>
        <label>方式<select value={method} onChange={event => setMethod(event.target.value as typeof method)}><option value="wechat">微信</option><option value="alipay">支付宝</option><option value="complimentary">赠送 / 补偿</option></select></label>
        <label>实收金额<input type="number" step="0.01" min={method === "complimentary" ? 0 : 0.01} disabled={method === "complimentary"} value={method === "complimentary" ? 0 : amount} onChange={event => setAmount(Number(event.target.value))} /></label>
        <button className="primary" disabled={busy || !email}>{busy ? "正在写入并读回…" : "确认到账并开通"}</button>
      </form>
    </section>

    <section className="domestic-admin-grid">
      <article className="domestic-admin-panel">
        <h2>用户与会员</h2>
        <div className="domestic-user-list">{data.users.length ? data.users.map(user => {
          const active = user.plan !== "free" && Boolean(user.plan_expires_at && user.plan_expires_at > renderedAt);
          return <div key={user.email}><span><b>{user.display_name || user.email.split("@")[0]}</b><small>{user.email}</small></span><em className={active ? "ok" : ""}>{active ? user.plan : "免费"}</em><time>{active && user.plan_expires_at ? new Date(user.plan_expires_at).toLocaleDateString("zh-CN") : "—"}</time>{active ? <button disabled={busy} onClick={() => changeMember("revoke", user.email)}>撤销</button> : <i>—</i>}</div>;
        }) : <p>暂无注册用户</p>}</div>
      </article>
      <article className="domestic-admin-panel">
        <h2>系统状态</h2>
        <dl className="domestic-system-list">
          <div><dt>DeepSeek 模型</dt><dd>{data.systems.model}</dd></div>
          <div><dt>服务端密钥</dt><dd className={data.systems.deepSeekConfigured ? "ok" : "bad"}>{data.systems.deepSeekConfigured ? "已安全配置" : "缺失，生成暂停"}</dd></div>
          <div><dt>D1 数据库</dt><dd className="ok">可读取</dd></div>
          <div><dt>站点总上限</dt><dd>近 24 小时 {data.systems.siteLimit} 次，当前剩余 {data.cards.siteRemaining} 次</dd></div>
          <div><dt>Token 明细</dt><dd>输入 {data.cards.promptTokens.toLocaleString("zh-CN")} / 输出 {data.cards.completionTokens.toLocaleString("zh-CN")}</dd></div>
          <div><dt>额度规则</dt><dd>每个窗口首次使用后 24 小时重置</dd></div>
        </dl>
      </article>
    </section>

    <section className="domestic-admin-panel">
      <div className="domestic-admin-heading"><div><h2>最近人工订单</h2><p>这里只记录站长已经核对的微信、支付宝到账或赠送操作；扫码本身不会自动生成订单。</p></div><span>最近 {data.orders.length} 条</span></div>
      <div className="domestic-order-list">{data.orders.length ? data.orders.map(order => {
        const method = order.provider_trade_no?.includes("wechat") ? "微信" : order.provider_trade_no?.includes("alipay") ? "支付宝" : "赠送 / 补偿";
        const status = order.status === "paid" ? "已核对到账" : order.status === "refunded" ? "已登记退款" : order.status === "complimentary" ? "已赠送" : order.status;
        return <div key={order.id}><span><b>{order.user_email}</b><small>{order.product} · {method}</small></span><strong>¥{(order.amount_fen / 100).toFixed(2)}</strong><em className={order.status === "paid" ? "ok" : ""}>{status}</em><time>{new Date(order.created_at).toLocaleString("zh-CN")}</time>{order.status === "paid" && order.amount_fen > 0 ? <button disabled={busy} onClick={() => markRefunded(order.id, order.user_email)}>登记已退款</button> : <i>—</i>}</div>;
      }) : <p>暂无人工订单；不要根据付款截图预先开通会员。</p>}</div>
    </section>

    <section className="domestic-admin-panel">
      <h2>最近后台操作</h2>
      <div className="domestic-audit-list">{data.audit.length ? data.audit.map((item, index) => <div key={`${item.created_at}-${index}`}><span><b>{item.action === "member_grant" ? "开通会员" : item.action === "member_revoke" ? "撤销会员" : item.action}</b><small>{item.target}</small></span><time>{new Date(item.created_at).toLocaleString("zh-CN")}</time></div>) : <p>暂无操作记录</p>}</div>
    </section>
  </main></>;
}

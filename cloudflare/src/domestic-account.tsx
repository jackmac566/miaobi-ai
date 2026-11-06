import { useEffect, useState } from "react";
import { VERSION } from "../../lib/version";

type APIResult = { error?: string };

type AISettingsPayload = APIResult & {
  providers: Array<{ id: string; label: string; shortLabel: string; defaultModel: string; docsUrl: string; syncable: boolean; models: Array<{ id: string; label: string }> }>;
  activeProvider: string;
  activeModel: string;
  hasKeys: Record<string, boolean>;
  source: string;
};

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
  systems: { deepSeekConfigured: boolean; provider: string; providerLabel: string; providerShortLabel: string; providerKeyConfigured: boolean; model: string; database: boolean; rollingWindowHours: number; freeLimit: number; memberLimit: number; siteLimit: number };
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
  const [ai, setAi] = useState<AISettingsPayload | null>(null);
  const [aiProvider, setAiProvider] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [aiError, setAiError] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");

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

  const loadAI = async () => {
    try {
      const result = await api<AISettingsPayload>("/api/admin/ai-settings");
      setAi(result);
      setAiProvider(result.activeProvider);
      setAiModel(result.activeModel);
      setKeyValue("");
    } catch {
      setAiError("模型设置读取失败，稍后重试");
    }
  };

  useEffect(() => {
    const starter = setTimeout(loadAI, 0);
    return () => clearTimeout(starter);
  }, []);

  const activeProviderInfo = ai?.providers.find(item => item.id === aiProvider) || null;
  const activeProviderModels = activeProviderInfo?.models || [];

  const chooseProvider = (next: string) => {
    setAiProvider(next);
    const info = ai?.providers.find(item => item.id === next);
    setAiModel(info?.defaultModel || "");
    setKeyValue("");
    setAiMessage("");
    setAiError("");
  };

  const saveKey = async () => {
    setAiBusy(true);
    setAiMessage("");
    setAiError("");
    try {
      const result = await api<{ ok?: boolean; error?: string; configured?: boolean }>("/api/admin/ai-settings", {
        method: "POST",
        body: JSON.stringify({ action: "save_key", provider: aiProvider, apiKey: keyValue }),
      });
      setAi(previous => previous ? { ...previous, hasKeys: { ...previous.hasKeys, [aiProvider]: Boolean(result.configured) } } : previous);
      setKeyValue("");
      setAiMessage(result.configured ? `${activeProviderInfo?.label || "该提供商"} 密钥已加密保存。` : "密钥已移除。");
    } catch (next) {
      setAiError(next instanceof Error ? next.message : "保存密钥失败");
    } finally {
      setAiBusy(false);
    }
  };

  const saveModel = async () => {
    setAiBusy(true);
    setAiMessage("");
    setAiError("");
    try {
      const result = await api<{ ok?: boolean; error?: string; model?: string }>("/api/admin/ai-settings", {
        method: "POST",
        body: JSON.stringify({ action: "set_model", model: aiModel }),
      });
      setAiMessage(`已切换到 ${result.model}，生成接口立即生效。`);
    } catch (next) {
      setAiError(next instanceof Error ? next.message : "切换模型失败");
    } finally {
      setAiBusy(false);
    }
  };

  const switchProvider = async () => {
    setAiBusy(true);
    setAiMessage("");
    setAiError("");
    try {
      const result = await api<{ ok?: boolean; error?: string; provider?: string; defaultModel?: string; label?: string }>("/api/admin/ai-settings", {
        method: "POST",
        body: JSON.stringify({ action: "set_provider", provider: aiProvider }),
      });
      setAiMessage(`已切换提供商为 ${result.label || result.provider}，默认模型 ${result.defaultModel}；请确认该提供商密钥已配置。`);
      await load();
      await loadAI();
    } catch (next) {
      setAiError(next instanceof Error ? next.message : "切换提供商失败");
    } finally {
      setAiBusy(false);
    }
  };

  const syncModels = async () => {
    setAiBusy(true);
    setAiMessage("");
    setAiError("");
    try {
      const result = await api<{ ok?: boolean; error?: string; models?: Array<{ id: string; label: string }> }>("/api/admin/ai-settings", {
        method: "POST",
        body: JSON.stringify({ action: "sync_models", provider: aiProvider }),
      });
      if (result.models?.length) {
        setAi(previous => previous ? { ...previous, providers: previous.providers.map(item => item.id === aiProvider ? { ...item, models: result.models || item.models } : item) } : previous);
        setAiMessage(`已同步 ${result.models.length} 个可用模型。`);
      } else {
        setAiMessage("同步完成。");
      }
    } catch (next) {
      setAiError(next instanceof Error ? next.message : "同步模型失败");
    } finally {
      setAiBusy(false);
    }
  };

  const verifyCurrent = async () => {
    setAiBusy(true);
    setAiMessage("");
    setAiError("");
    try {
      const result = await api<{ ok?: boolean; error?: string; resolvedModel?: string }>("/api/admin/ai-settings", {
        method: "POST",
        body: JSON.stringify({ action: "verify", provider: aiProvider, model: aiModel }),
      });
      setAiMessage(`验证通过，接口响应模型 ${result.resolvedModel || aiModel}。`);
    } catch (next) {
      setAiError(next instanceof Error ? next.message : "验证失败");
    } finally {
      setAiBusy(false);
    }
  };

  const checkUpdates = async () => {
    setUpdating(true);
    setUpdateMessage("");
    try {
      const health = await api<{ release?: string; providerLabel?: string; model?: string; error?: string }>("/api/health");
      if (!health.release) throw new Error("未能读取线上版本");
      setUpdateMessage(health.release === VERSION
        ? `已是最新版本 ${VERSION}（线上一致）。`
        : `发现新版本 ${health.release}（本站当前 ${VERSION}），请重新部署后回到本站刷新。`);
    } catch (next) {
      setUpdateMessage(next instanceof Error ? next.message : "检查更新失败，请稍后重试");
    } finally {
      setUpdating(false);
    }
  };

  const applyUpdate = () => {
    try {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistration().then(registration => registration?.update()).catch(() => undefined);
      }
    } catch {
      // 直接刷新同样能拿到最新内容。
    }
    location.reload();
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
      <article><span>{data.systems.providerShortLabel || "模型"}</span><b className={data.systems.providerKeyConfigured ? "ok" : "bad"}>{data.systems.providerKeyConfigured ? "已配置" : "未配置"}</b></article>
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
          <div><dt>{data.systems.providerLabel || "模型"} · 当前模型</dt><dd>{data.systems.model}</dd></div>
          <div><dt>服务端密钥</dt><dd className={data.systems.providerKeyConfigured ? "ok" : "bad"}>{data.systems.providerKeyConfigured ? "已安全配置" : "缺失，生成暂停"}</dd></div>
          <div><dt>D1 数据库</dt><dd className="ok">可读取</dd></div>
          <div><dt>站点总上限</dt><dd>近 24 小时 {data.systems.siteLimit} 次，当前剩余 {data.cards.siteRemaining} 次</dd></div>
          <div><dt>Token 明细</dt><dd>输入 {data.cards.promptTokens.toLocaleString("zh-CN")} / 输出 {data.cards.completionTokens.toLocaleString("zh-CN")}</dd></div>
          <div><dt>额度规则</dt><dd>每个窗口首次使用后 24 小时重置</dd></div>
        </dl>
      </article>
    </section>

    <section className="domestic-admin-panel">
      <div className="domestic-admin-heading"><div><h2>模型设置</h2><p>选择生成模型提供商与模型；密钥只保存在服务端并加密存储。没有密钥的提供商也可以先切换查看，配好密钥后点“测试当前选择”验证即可投入使用。</p></div>{ai && <span>当前：{activeProviderInfo?.label || ai.activeProvider} · {ai.activeModel}</span>}</div>
      {ai ? (
        <div className="domestic-ai-settings">
          <label className="domestic-ai-field">提供商
            <select value={aiProvider} onChange={event => chooseProvider(event.target.value)} aria-label="模型提供商">
              {ai.providers.map(item => <option key={item.id} value={item.id}>{item.label}{ai.hasKeys[item.id] ? " · 已配密钥" : ""}</option>)}
            </select>
          </label>
          <label className="domestic-ai-field">模型
            <select value={aiModel} onChange={event => setAiModel(event.target.value)} aria-label="生成模型">
              {activeProviderModels.map(item => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}
            </select>
          </label>
          <label className="domestic-ai-field grow">API 密钥（留空并保存 = 移除）
            <input type="password" autoComplete="new-password" value={keyValue} onChange={event => setKeyValue(event.target.value)} placeholder={ai.hasKeys[aiProvider] ? "已加密保存，留空表示不更换" : `粘贴 ${activeProviderInfo?.label || "该提供商"} 的 API Key`} />
          </label>
          <div className="domestic-ai-actions">
            <button disabled={aiBusy || !keyValue} onClick={saveKey}>保存密钥</button>
            <button disabled={aiBusy} onClick={switchProvider}>启用此提供商</button>
            <button disabled={aiBusy} onClick={saveModel}>保存并切换模型</button>
            <button disabled={aiBusy} onClick={verifyCurrent}>测试当前选择</button>
            {activeProviderInfo?.syncable && <button disabled={aiBusy} onClick={syncModels}>同步可用模型</button>}
            {activeProviderInfo?.docsUrl && <a className="domestic-docs-link" href={activeProviderInfo.docsUrl} target="_blank" rel="noreferrer">官方文档 ↗</a>}
          </div>
        </div>
      ) : <p>正在读取模型设置…</p>}
      {aiMessage && <p className="domestic-admin-success">✓ {aiMessage}</p>}
      {aiError && <p className="domestic-login-error" role="alert">{aiError}</p>}
      <div className="domestic-update-check">
        <button disabled={updating} onClick={checkUpdates}>{updating ? "正在检查…" : "检查更新"}</button>
        <button disabled={updating} onClick={applyUpdate}>刷新本站</button>
        {updateMessage && <p className="domestic-admin-success">✓ {updateMessage}</p>}
      </div>
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

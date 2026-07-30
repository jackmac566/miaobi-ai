"use client";

import { useEffect, useState } from "react";

type Metrics = {
  updatedAt: number;
  release: string;
  currentUser: { email: string; role: "root" | "admin" };
  cards: {
    newUsers: number;
    generations: number;
    paidOrders: number;
    revenueFen: number;
    totalUsers: number;
    activeMembers: number;
    weekGenerations: number;
    totalGenerations: number;
    todayDeepSeek: number;
    todayLegacy: number;
    refundedOrders: number;
    activeAdmins: number;
    rollingDeepSeek: number;
    siteLimit: number;
    siteRemaining: number;
    rollingPromptTokens: number;
    rollingCompletionTokens: number;
    totalRevenueFen: number;
    memberConversionRate: number;
  };
  popular: Array<{ scene: string; total: number }>;
  recent: Array<{ scene: string; created_at: number }>;
  audit: Array<{ actor_email: string; action: string; target: string; created_at: number }>;
  alerts: Array<{ level: "ok" | "info" | "warning"; title: string; detail: string }>;
  systems: {
    ai: boolean;
    aiConfigured: boolean;
    aiVerifiedAt: number | null;
    provider: string;
    providerLabel: string;
    model: string;
    paymentMode: "manual";
    database: boolean;
    secureStorage: boolean;
    rootAdmin: boolean;
  };
};

type HealthReport = {
  checkedAt: number;
  release: string;
  currentUser: { email: string; role: "root" | "admin" };
  contract: {
    moduleCount: number;
    modules: string[];
    counts: { writingScenes: number; textTools: number; aiProviders: number };
  };
  summary: { total: number; passed: number; fallback: number; manual: number; attention: number };
  checks: Array<{
    id: string;
    label: string;
    scope: "live" | "database" | "build" | "manual";
    status: "pass" | "fallback" | "manual" | "attention";
    detail: string;
    action?: string;
  }>;
  note: string;
};

type ProviderStatus = {
  id: string;
  label: string;
  shortLabel: string;
  category: "china" | "global" | "gateway";
  description: string;
  docsUrl: string;
  models: Array<{ id: string; label: string }>;
  canSyncModels: boolean;
  model: string;
  modelHint: string;
  configured: boolean;
  selected: boolean;
  active: boolean;
  verified: boolean;
  verificationState: "verified" | "failed" | "untested";
  lastCheckedAt: number | null;
  resolvedModel: string | null;
  source: "environment" | "secure_store" | "none";
  updatedAt: number | null;
};

type AISettings = {
  configured: boolean;
  verified: boolean;
  operational: boolean;
  activeProvider: string;
  activeProviderLabel: string;
  model: string;
  lastCheckedAt: number | null;
  resolvedModel: string | null;
  source: "environment" | "secure_store" | "none";
  providers: ProviderStatus[];
  secureStorageReady: boolean;
  canManage: boolean;
};

type AdminAccess = {
  canManage: boolean;
  currentEmail: string;
  root: { email: string; active: true; role: "root" } | null;
  delegated: Array<{ email: string; active: boolean; role: "admin"; created_at: number; updated_at: number }>;
};

type MemberData = {
  canManage: boolean;
  users: Array<{ email: string; display_name: string | null; plan: string; plan_expires_at: number | null; created_at: number; last_seen_at: number }>;
  orders: Array<{ id: string; user_email: string; product: string; amount_fen: number; status: string; provider_trade_no: string | null; created_at: number; paid_at: number | null }>;
};

type APIErrorBody = { error?: string };
type MutationResult = APIErrorBody & {
  message: string;
  models?: Array<{ id: string; label: string }>;
};

async function responseJSON<T>(response: Response): Promise<T & APIErrorBody> {
  return await response.json() as T & APIErrorBody;
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<"overview" | "health" | "ai" | "members" | "admins">("overview");
  const [data, setData] = useState<Metrics | null>(null);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [members, setMembers] = useState<MemberData | null>(null);
  const [admins, setAdmins] = useState<AdminAccess | null>(null);
  const [error, setError] = useState("");

  const loadMetrics = async () => {
    const response = await fetch("/api/admin/metrics", { cache: "no-store" });
    const next = await responseJSON<Metrics>(response);
    if (!response.ok) throw new Error(next.error || "读取失败");
    setData(next); setError("");
  };

  const loadSettings = async () => {
    const response = await fetch("/api/admin/ai-settings", { cache: "no-store" });
    const next = await responseJSON<AISettings>(response);
    if (!response.ok) throw new Error(next.error || "读取设置失败");
    setSettings(next);
  };

  const loadHealth = async () => {
    setHealthBusy(true);
    try {
      const response = await fetch("/api/admin/health", { cache: "no-store" });
      const next = await responseJSON<HealthReport>(response);
      if (!response.ok) throw new Error(next.error || "整站验收失败");
      setHealth(next);
      setError("");
    } catch (next) {
      setError(next instanceof Error ? next.message : "整站验收失败");
      throw next;
    } finally {
      setHealthBusy(false);
    }
  };

  const loadAdmins = async () => {
    const response = await fetch("/api/admin/admins", { cache: "no-store" });
    const next = await responseJSON<AdminAccess>(response);
    if (!response.ok) throw new Error(next.error || "读取站长列表失败");
    setAdmins(next);
  };

  const loadMembers = async () => {
    const response = await fetch("/api/admin/members", { cache: "no-store" });
    const next = await responseJSON<MemberData>(response);
    if (!response.ok) throw new Error(next.error || "读取会员失败");
    setMembers(next);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try { await loadMetrics(); } catch (next) { if (active) setError(next instanceof Error ? next.message : "读取失败"); }
    };
    load(); const timer = setInterval(load, 15000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const openAISettings = () => {
    setTab("ai");
    if (!settings) loadSettings().catch(next => setError(next instanceof Error ? next.message : "读取设置失败"));
  };

  const openHealth = () => {
    setTab("health");
    if (!health) loadHealth().catch(next => setError(next instanceof Error ? next.message : "整站验收失败"));
  };

  const openAdmins = () => {
    setTab("admins");
    if (!admins) loadAdmins().catch(next => setError(next instanceof Error ? next.message : "读取站长列表失败"));
  };

  const openMembers = () => {
    setTab("members");
    if (!members) loadMembers().catch(next => setError(next instanceof Error ? next.message : "读取会员失败"));
  };

  if (error && !data) return <main className="admin-real" id="main-content"><div className="admin-error">{error}</div></main>;
  if (!data) return <main className="admin-real" id="main-content"><div className="admin-loading">正在读取真实数据…</div></main>;

  return <><a className="skip-link" href="#main-content">跳到运营数据</a><main className="admin-real" id="main-content">
    <header><div><span>OWNER CONSOLE · {data.release}</span><h1>妙笔 AI · 运营后台</h1><p>当前：{data.currentUser.email} · {data.currentUser.role === "root" ? "主管理员" : "管理员"}。统计来自真实数据库，模块状态可随时重新验收。</p></div><div className="admin-header-actions"><button type="button" onClick={() => { location.href = "/"; }}>返回网站</button><a href="/signout-with-chatgpt?return_to=%2F">退出登录</a></div></header>
    <nav className="owner-tabs" aria-label="后台栏目">
      <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>数据概览</button>
      <button className={tab === "health" ? "active" : ""} onClick={openHealth}>系统验收</button>
      <button className={tab === "ai" ? "active" : ""} onClick={openAISettings}>AI 模型设置</button>
      <button className={tab === "members" ? "active" : ""} onClick={openMembers}>会员开通</button>
      <button className={tab === "admins" ? "active" : ""} onClick={openAdmins}>站长管理</button>
    </nav>
    {error && <div className="admin-error-inline" role="alert">{error}</div>}
    {tab === "overview" && <Overview data={data} />}
    {tab === "health" && <HealthPanel report={health} busy={healthBusy} reload={loadHealth} />}
    {tab === "ai" && <AISettingsPanel settings={settings} reload={loadSettings} onConnected={loadMetrics} />}
    {tab === "members" && <MemberPanel members={members} reload={loadMembers} />}
    {tab === "admins" && <AdminAccessPanel admins={admins} reload={loadAdmins} />}
  </main></>;
}

function Overview({ data }: { data: Metrics }) {
  const cards = [
    ["今日新增用户", data.cards.newUsers],
    ["今日真实生成", data.cards.generations],
    ["有效会员", data.cards.activeMembers],
    ["今日已付订单", data.cards.paidOrders],
    ["今日实收", `¥ ${(data.cards.revenueFen / 100).toFixed(2)}`],
    ["累计用户", data.cards.totalUsers],
  ];
  return <>
    <section className="real-cards">{cards.map(([label, value]) => <article key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="operations-strip" aria-label="整站关键数据">
      <article><span>近 7 日生成</span><b>{data.cards.weekGenerations}</b></article>
      <article><span>累计生成</span><b>{data.cards.totalGenerations}</b></article>
      <article><span>今日 DeepSeek</span><b>{data.cards.todayDeepSeek}</b></article>
      <article><span>今日旧版记录</span><b>{data.cards.todayLegacy}</b></article>
      <article><span>有效站长</span><b>{data.cards.activeAdmins}</b></article>
      <article><span>累计退款记录</span><b>{data.cards.refundedOrders}</b></article>
      <article><span>24h 站点调用</span><b>{data.cards.rollingDeepSeek} / {data.cards.siteLimit}</b></article>
      <article><span>24h 剩余额度</span><b>{data.cards.siteRemaining}</b></article>
      <article><span>24h Token</span><b>{(data.cards.rollingPromptTokens + data.cards.rollingCompletionTokens).toLocaleString("zh-CN")}</b></article>
      <article><span>会员转化率</span><b>{data.cards.memberConversionRate}%</b></article>
      <article><span>累计实收</span><b>¥ {(data.cards.totalRevenueFen / 100).toFixed(2)}</b></article>
    </section>
    <section className="admin-alerts"><div className="section-title"><h2>运营提醒</h2><span>根据真实配置自动生成</span></div>{data.alerts.map(alert => <article className={alert.level} key={alert.title}><span>{alert.level === "warning" ? "!" : alert.level === "ok" ? "✓" : "i"}</span><div><b>{alert.title}</b><p>{alert.detail}</p></div></article>)}</section>
    <section className="real-grid">
      <article><h2>近 7 日热门功能</h2>{data.popular.length ? data.popular.map((x, i) => <div className="real-row" key={x.scene}><b>{i + 1}</b><span>{x.scene}</span><em>{x.total} 次</em></div>) : <p className="no-data">尚无真实生成记录</p>}</article>
      <article><h2>服务状态</h2><div className="service-row"><span>DeepSeek 生成</span><b className={data.systems.ai ? "ok" : "wait"}>{data.systems.ai ? `${data.systems.model} · 最近真实请求通过` : data.systems.aiConfigured ? "密钥已保存但最近验证未通过 · 生成暂停且不扣次数" : "未配置 · 生成暂停"}</b></div><div className="service-row"><span>订单与会员数据库</span><b className="ok">读取正常</b></div><div className="service-row"><span>密钥加密</span><b className={data.systems.secureStorage ? "ok" : "wait"}>{data.systems.secureStorage ? "AES-256-GCM 已配置" : "未配置 · 暂勿保存密钥"}</b></div><div className="service-row"><span>主管理员</span><b className={data.systems.rootAdmin ? "ok" : "wait"}>{data.systems.rootAdmin ? "固定邮箱已配置" : "ADMIN_EMAIL 未配置"}</b></div><div className="service-row"><span>收款方式</span><b className="wait">微信 / 支付宝个人码 · 人工核验</b></div></article>
    </section>
    <section className="admin-two-column">
      <article className="recent-real"><h2>最近真实活动</h2>{data.recent.length ? data.recent.map((x, i) => <p key={i}><span>完成一次「{x.scene}」</span><time>{new Date(x.created_at).toLocaleString("zh-CN")}</time></p>) : <p className="no-data">网站上线后，真实用户活动会显示在这里。</p>}</article>
      <article className="recent-real"><h2>最近后台操作</h2>{data.audit.length ? data.audit.map((item, i) => <p key={`${item.created_at}-${i}`}><span><b>{auditActionLabel(item.action)}</b><small>{item.actor_email} · {item.target}</small></span><time>{new Date(item.created_at).toLocaleString("zh-CN")}</time></p>) : <p className="no-data">尚无管理员操作记录。</p>}</article>
    </section>
    <footer>最后同步：{new Date(data.updatedAt).toLocaleTimeString("zh-CN")}</footer>
  </>;
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    admin_add: "添加站长",
    admin_enable: "恢复站长",
    admin_disable: "停用站长",
    admin_remove: "删除站长",
    member_grant: "开通会员",
    member_revoke: "撤销会员",
    manual_refund_marked: "登记退款",
    ai_provider_save: "保存并测试模型",
    ai_provider_activate: "切换模型",
    ai_provider_remove: "移除模型密钥",
  };
  return labels[action] || action.replace(/[._-]/g, " ");
}

function HealthPanel({ report, busy, reload }: { report: HealthReport | null; busy: boolean; reload: () => Promise<void> }) {
  const rerun = () => reload().catch(() => undefined);
  if (!report) return <section className="settings-panel"><div className="admin-loading">{busy ? "正在逐项执行整站验收…" : "尚未生成验收结果"}</div></section>;
  const statusLabel = { pass: "通过", fallback: "回退可用", manual: "人工流程", attention: "需要处理" };
  const scopeLabel = { live: "实时执行", database: "数据库", build: "构建测试", manual: "人工核对" };
  return <section className="health-panel">
    <div className="health-heading">
      <div><span>SYSTEM ACCEPTANCE · {report.release}</span><h2>整站功能验收</h2><p>覆盖 {report.contract.moduleCount} 个产品模块；不会为了验收消耗外部模型额度。</p></div>
      <button onClick={rerun} disabled={busy}>{busy ? "正在重新验收…" : "重新运行验收"}</button>
    </div>
    <div className="health-summary">
      <article><span>检查项</span><b>{report.summary.total}</b></article>
      <article className="pass"><span>通过</span><b>{report.summary.passed}</b></article>
      <article className="fallback"><span>回退可用</span><b>{report.summary.fallback}</b></article>
      <article className="manual"><span>人工流程</span><b>{report.summary.manual}</b></article>
      <article className={report.summary.attention ? "attention" : "pass"}><span>需要处理</span><b>{report.summary.attention}</b></article>
    </div>
    <div className="health-list">{report.checks.map(check => <article key={check.id} className={check.status}>
      <div className="health-status"><span>{statusLabel[check.status]}</span><small>{scopeLabel[check.scope]}</small></div>
      <div><h3>{check.label}</h3><p>{check.detail}</p>{check.action && <strong>下一步：{check.action}</strong>}</div>
    </article>)}</div>
    <div className="health-contract"><b>本次覆盖模块</b><p>{report.contract.modules.join("、")}</p><small>{report.note} · 验收时间：{new Date(report.checkedAt).toLocaleString("zh-CN")}</small></div>
  </section>;
}

function AISettingsPanel({ settings, reload, onConnected }: { settings: AISettings | null; reload: () => Promise<void>; onConnected: () => Promise<void> }) {
  const [apiKey, setApiKey] = useState("");
  const initialProvider = settings?.providers[0];
  const [model, setModel] = useState(initialProvider?.model || "deepseek-v4-flash");
  const [catalog, setCatalog] = useState<Array<{ id: string; label: string }>>(initialProvider?.models || []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const selected = settings?.providers[0];

  const submit = async (action: "save" | "test" | "activate" | "remove" | "models") => {
    if (!selected) return;
    if (action === "remove" && !confirm("确定移除 DeepSeek API Key？移除后生成会暂停，直到重新配置有效密钥。")) return;
    setBusy(true); setMessage(""); setFormError("");
    try {
      const response = await fetch("/api/admin/ai-settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, provider: selected.id, apiKey: apiKey || undefined, model }),
      });
      const next = await responseJSON<MutationResult>(response);
      if (!response.ok) throw new Error(next.error || "操作失败");
      if (action === "models" && Array.isArray(next.models)) setCatalog(next.models);
      setMessage(next.message);
      if (action !== "models") setApiKey("");
      if (action !== "models") { await reload(); await onConnected(); }
    } catch (next) { setFormError(next instanceof Error ? next.message : "操作失败"); }
    finally { setBusy(false); }
  };

  if (!settings) return <section className="settings-panel"><div className="admin-loading">正在读取安全设置…</div></section>;
  const statusLabel = (item: ProviderStatus) => item.active
    ? "正在运行"
    : item.selected && item.verificationState === "failed"
      ? "已选中・验证失败"
      : item.selected && item.configured
        ? "已选中・待验证"
        : item.verified
          ? "上次验证通过"
          : item.verificationState === "failed"
            ? "验证失败"
            : item.configured
              ? "已保存・待验证"
              : "未配置";
  const currentText = settings.operational
    ? `当前真实运行：DeepSeek · ${settings.model}`
    : settings.configured
      ? `DeepSeek · ${settings.model} 已保存，但尚未通过最近一次真实验证`
      : "DeepSeek 尚未配置，当前生成已暂停";
  if (!settings.canManage) return <section className="settings-panel"><div className="settings-heading"><div><span className={`connection-dot ${settings.operational ? "on" : ""}`} />{currentText}</div></div><div className="provider-status-grid">{settings.providers.map(item => <article key={item.id} className={item.active ? "active" : item.selected ? "provider-selected" : ""}><b>{item.shortLabel}</b><span>{item.model}</span><em>{statusLabel(item)}</em></article>)}</div><p className="delegated-note">你是普通管理员，可以查看真实连接状态；只有主管理员可以保存、实测、切换或移除 API Key。</p></section>;
  return <section className="settings-panel">
    <div className="settings-heading"><div><span className={`connection-dot ${settings.operational ? "on" : ""}`} />{currentText}</div><small>只有真实请求成功且数据库回读一致，才会标记“正在运行”</small></div>
    <div className="provider-catalog-head">
      <div><b>DeepSeek 官方直连</b><span>正式站、国内版和小程序统一走服务端，密钥不会写入访客前端</span></div>
    </div>
    <div className="provider-status-grid expanded" aria-label="DeepSeek 状态">{selected && <article className={`${selected.active ? "active" : ""} ${selected.verificationState === "failed" ? "failed" : ""}`}><b>DeepSeek</b><span>{selected.model}</span><small>{selected.description}</small><em>{statusLabel(selected)}</em></article>}</div>
    <div className="settings-layout">
      <form onSubmit={event => { event.preventDefault(); submit("save"); }}>
        <div className="selected-provider-title"><div><span>官方直连</span><h2>DeepSeek</h2></div>{selected?.docsUrl && <a href={selected.docsUrl} target="_blank" rel="noreferrer">官方文档 ↗</a>}</div>
        <p className="provider-description">{selected?.description}</p>
        <label htmlFor="provider-key">{selected?.label || "模型平台"} API Key</label>
        <div className="secret-input"><input id="provider-key" type="password" autoComplete="new-password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={selected?.configured ? "已安全保存；留空表示不更换" : `粘贴新的 ${selected?.label || "平台"} API Key`} /><span>加密传输</span></div>
        <p className="field-help">密钥只会发送到本站服务器，并使用 AES-256-GCM 加密保存；保存后不会再次显示明文。</p>
        <div className="model-label-row"><label htmlFor="provider-model">模型名称 / 接入点 ID</label><button type="button" disabled={busy || (!apiKey && !selected?.configured)} onClick={() => submit("models")}>{selected?.canSyncModels ? "同步账号可用模型" : "加载官方推荐模型"}</button></div>
        <input id="provider-model" list={`provider-models-${selected?.id || "default"}`} value={model} onChange={event => setModel(event.target.value)} placeholder={selected?.modelHint || "填写控制台提供的模型名称"} />
        <datalist id={`provider-models-${selected?.id || "default"}`}>{catalog.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</datalist>
        <p className="field-help">{selected?.modelHint || "请使用对应平台控制台中实际开通的模型名称。"}</p>
        {selected?.lastCheckedAt && <p className={`provider-check ${selected.verified ? "ok" : "bad"}`}>{selected.verified ? "最近真实验证通过" : "最近验证失败"}：{new Date(selected.lastCheckedAt).toLocaleString("zh-CN")}{selected.resolvedModel ? ` · 响应模型 ${selected.resolvedModel}` : ""}</p>}
        {formError && <p className="settings-error">{formError}</p>}
        {message && <p className="settings-success">✓ {message}</p>}
        <div className="settings-actions"><button className="save-setting" disabled={busy || (!apiKey && !selected?.configured)}>{busy ? "正在向官方接口实测…" : "保存、实测并启用"}</button><button type="button" disabled={busy || (!apiKey && !selected?.configured)} onClick={() => submit("test")}>仅做真实测试</button>{selected?.configured && !selected.active && <button type="button" disabled={busy} onClick={() => submit("activate")}>实测后切换</button>}{selected?.configured && <button className="danger" type="button" disabled={busy} onClick={() => submit("remove")}>移除密钥</button>}</div>
      </form>
      <aside><h2>真实状态规则</h2><ol><li>“已保存”只代表密钥存在，绝不等于接口可用。</li><li>启用前会向 DeepSeek 官方接口发送一条真实对话请求，并确认返回了非空文本。</li><li>写入后再次读取数据库；模型与密钥状态一致，才显示“正在运行”。</li><li>密钥失效、欠费、限流或网络故障时会明确报错并退还本次额度，不会伪造结果。</li><li>模型列表以该 API Key 从 DeepSeek 官方接口实际读取到的结果为准。</li></ol><div className="security-note"><b>为什么只保留 DeepSeek？</b><p>当前产品要求所有端统一使用同一真实模型，减少切换状态、提示词差异和错误排查成本。</p></div><div className="security-note"><b>安全说明</b><p>不要把 API Key 发到聊天、邮件或前端代码。已经公开过的 Key 必须先在原平台作废，再生成新 Key。</p></div></aside>
    </div>
  </section>;
}

function MemberPanel({ members, reload }: { members: MemberData | null; reload: () => Promise<void> }) {
  const [renderedAt] = useState(() => Date.now());
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<"monthly" | "yearly" | "student">("monthly");
  const [days, setDays] = useState(30);
  const [paymentMethod, setPaymentMethod] = useState<"wechat" | "alipay" | "complimentary">("wechat");
  const [amountYuan, setAmountYuan] = useState(19.9);
  const [paymentReference, setPaymentReference] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");

  const choosePlan = (value: "monthly" | "yearly" | "student") => {
    setPlan(value);
    setDays(value === "yearly" ? 365 : 30);
    setAmountYuan(value === "yearly" ? 99 : value === "student" ? 9.9 : 19.9);
  };

  const mutate = async (action: "grant" | "revoke" | "refund", targetEmail = email, orderId = "") => {
    if (action === "revoke" && !confirm(`确定撤销 ${targetEmail} 的会员权益？`)) return;
    if (action === "refund" && !confirm("请先在微信或支付宝完成实际退款。确定款项已经退回，并把这条记录标记为已退款吗？")) return;
    setBusy(true); setMessage(""); setFormError("");
    try {
      const response = await fetch("/api/admin/members", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          email: targetEmail,
          plan,
          days,
          amountFen: Math.round(amountYuan * 100),
          paymentMethod,
          paymentReference,
          requestId,
          orderId,
        }),
      });
      const next = await responseJSON<MutationResult>(response);
      if (!response.ok) throw new Error(next.error || "操作失败");
      setMessage(next.message);
      if (action === "grant") {
        setEmail("");
        setPaymentReference("");
        setRequestId(crypto.randomUUID());
      }
      await reload();
    } catch (next) { setFormError(next instanceof Error ? next.message : "操作失败"); }
    finally { setBusy(false); }
  };

  if (!members) return <section className="settings-panel"><div className="admin-loading">正在读取真实会员数据…</div></section>;
  return <section className="settings-panel member-panel">
    <div className="settings-heading"><div><span className="connection-dot on" />人工收款后的会员开通</div><small>扫码付款不会自动开通，必须核对凭证后操作</small></div>
    {members.canManage ? <form className="member-grant-form payment-register-form" onSubmit={event => { event.preventDefault(); mutate("grant"); }}>
      <div><label htmlFor="member-email">用户登录邮箱</label><input id="member-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="用户登录本站时使用的邮箱" /></div>
      <div><label htmlFor="member-plan">套餐</label><select id="member-plan" value={plan} onChange={event => choosePlan(event.target.value as "monthly" | "yearly" | "student")}><option value="monthly">月度会员</option><option value="yearly">年度会员</option><option value="student">学生特惠</option></select></div>
      <div><label htmlFor="member-days">开通天数</label><input id="member-days" type="number" min={1} max={3660} value={days} onChange={event => setDays(Number(event.target.value))} /></div>
      <div><label htmlFor="payment-method">收款方式</label><select id="payment-method" value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as "wechat" | "alipay" | "complimentary")}><option value="wechat">微信</option><option value="alipay">支付宝</option><option value="complimentary">赠送 / 补偿</option></select></div>
      <div><label htmlFor="payment-amount">实收金额（元）</label><input id="payment-amount" type="number" min={paymentMethod === "complimentary" ? 0 : 0.01} max={100000} step="0.01" disabled={paymentMethod === "complimentary"} value={paymentMethod === "complimentary" ? 0 : amountYuan} onChange={event => setAmountYuan(Number(event.target.value))} /></div>
      <div><label htmlFor="payment-reference">核对号（可选）</label><input id="payment-reference" maxLength={80} value={paymentReference} onChange={event => setPaymentReference(event.target.value)} placeholder="如付款时间或账单后4位，勿填完整隐私" /></div>
      <button disabled={busy || !email.trim()}>{busy ? "处理中…" : paymentMethod === "complimentary" ? "确认赠送并开通" : "确认到账、登记并开通"}</button>
    </form> : <p className="delegated-note">普通管理员只能查看会员状态，只有主管理员可以开通或撤销权益。</p>}
    {formError && <p className="settings-error">{formError}</p>}
    {message && <p className="settings-success">✓ {message}</p>}
    <div className="member-list"><div className="member-list-head"><span>用户</span><span>当前状态</span><span>到期时间</span><span>操作</span></div>{members.users.length ? members.users.map(user => {
      const active = user.plan !== "free" && (!user.plan_expires_at || user.plan_expires_at > renderedAt);
      return <article key={user.email}><div><b>{user.display_name || user.email.split("@")[0]}</b><small>{user.email}</small></div><span className={active ? "member-active" : "member-free"}>{active ? user.plan : "免费用户"}</span><time>{active && user.plan_expires_at ? new Date(user.plan_expires_at).toLocaleDateString("zh-CN") : "—"}</time>{members.canManage && active ? <button disabled={busy} onClick={() => mutate("revoke", user.email)}>撤销</button> : <span>—</span>}</article>;
    }) : <p className="no-data">暂无真实注册用户</p>}</div>
    <section className="payment-ledger"><div><h2>最近人工收款记录</h2><small>退款必须先在原收款平台完成，这里只登记处理结果</small></div>{members.orders.length ? <div className="payment-ledger-table">{members.orders.map(order => {
      const method = order.provider_trade_no?.startsWith("manual_wechat:") ? "微信" : order.provider_trade_no?.startsWith("manual_alipay:") ? "支付宝" : "赠送 / 补偿";
      const statusLabel = order.status === "refunded" ? "已退款" : order.status === "complimentary" ? "已赠送" : "已收款";
      return <article key={order.id}><div><b>{order.user_email}</b><small>{order.product} · {method}</small></div><strong>¥{(order.amount_fen / 100).toFixed(2)}</strong><time>{new Date(order.paid_at || order.created_at).toLocaleString("zh-CN")}</time><span className={order.status === "refunded" ? "refunded" : order.status === "complimentary" ? "complimentary" : "paid"}>{statusLabel}</span>{members.canManage && order.status === "paid" && order.amount_fen > 0 ? <button disabled={busy} onClick={() => mutate("refund", order.user_email, order.id)}>标记已退款</button> : <i>—</i>}</article>;
    })}</div> : <p className="no-data">还没有登记人工收款。</p>}</section>
  </section>;
}

function AdminAccessPanel({ admins, reload }: { admins: AdminAccess | null; reload: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");

  const mutate = async (action: "add" | "enable" | "disable" | "remove", targetEmail: string) => {
    if (action === "remove" && !confirm(`确定彻底删除 ${targetEmail} 的站长身份？`)) return;
    setBusy(`${action}:${targetEmail}`); setMessage(""); setFormError("");
    try {
      const response = await fetch("/api/admin/admins", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, email: targetEmail }),
      });
      const next = await responseJSON<MutationResult>(response);
      if (!response.ok) throw new Error(next.error || "操作失败");
      setMessage(next.message); setEmail(""); await reload();
    } catch (next) { setFormError(next instanceof Error ? next.message : "操作失败"); }
    finally { setBusy(""); }
  };

  if (!admins) return <section className="settings-panel"><div className="admin-loading">正在读取站长身份…</div></section>;
  return <section className="settings-panel admin-access-panel">
    <div className="settings-heading"><div><span className="connection-dot on" />站长身份与权限</div><small>当前登录：{admins.currentEmail}</small></div>
    {admins.canManage && <form className="admin-add-form" onSubmit={event => { event.preventDefault(); mutate("add", email); }}>
      <div><label htmlFor="admin-email">添加站长邮箱</label><p>填写对方登录 ChatGPT 时使用的邮箱。对方登录本站后即可进入运营后台。</p></div>
      <input id="admin-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" />
      <button disabled={Boolean(busy) || !email.trim()}>{busy.startsWith("add:") ? "添加中…" : "添加站长"}</button>
    </form>}
    {formError && <p className="settings-error">{formError}</p>}
    {message && <p className="settings-success">✓ {message}</p>}
    <div className="admin-identity-list">
      {admins.root && <article><div className="identity-avatar">主</div><div><b>{admins.root.email}</b><p>主管理员 · 永久保留 · 可管理其他站长</p></div><span className="identity-status active">正常</span></article>}
      {admins.delegated.map(item => <article key={item.email}><div className="identity-avatar delegated">管</div><div><b>{item.email}</b><p>普通管理员 · {item.active ? "可以进入后台" : "当前无法进入后台"}</p></div><span className={`identity-status ${item.active ? "active" : "disabled"}`}>{item.active ? "已启用" : "已停用"}</span>{admins.canManage && <div className="identity-actions">{item.active ? <button disabled={Boolean(busy)} onClick={() => mutate("disable", item.email)}>停用</button> : <button disabled={Boolean(busy)} onClick={() => mutate("enable", item.email)}>恢复</button>}<button className="danger" disabled={Boolean(busy)} onClick={() => mutate("remove", item.email)}>删除</button></div>}</article>)}
      {!admins.delegated.length && <p className="no-data admin-empty">还没有添加其他站长。建议只添加你完全信任的人。</p>}
    </div>
    {!admins.canManage && <p className="delegated-note">你是普通管理员，可以查看运营数据；只有主管理员能修改 API Key，以及增删站长身份。</p>}
  </section>;
}

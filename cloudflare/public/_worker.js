const VERSION = "V1.5.0";
const FREE_LIMIT = 10;
const MEMBER_LIMIT = 100;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_BLOCK_MS = 30 * 60 * 1000;
const AUTH_MAX_FAILURES = 8;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "X-Frame-Options": "DENY",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      ...extraHeaders,
    },
  });
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function signingKey(env) {
  const secret = env.SESSION_SECRET;
  if (!secret) return null;
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function createSessionToken(env, email, role) {
  const key = await signingKey(env);
  if (!key) throw new Error("SESSION_SECRET 未配置");
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({
    email,
    role,
    expiresAt: Date.now() + SESSION_MS,
    nonce: crypto.randomUUID(),
  })));
  const signature = base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
  return `${payload}.${signature}`;
}

function cookieValue(request, name) {
  const match = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] || "";
}

async function readSession(request, env) {
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  const token = bearer || cookieValue(request, "miaobi_session");
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const key = await signingKey(env);
  if (!key) return null;
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(signature),
    new TextEncoder().encode(payload),
  ).catch(() => false);
  if (!valid) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (!data.email || !["user", "admin"].includes(data.role) || Number(data.expiresAt) <= Date.now()) return null;
    return { email: String(data.email).toLowerCase(), role: data.role };
  } catch {
    return null;
  }
}

async function passwordHash(password, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 120000 },
    material,
    256,
  ));
}

async function constantTimeTextEqual(left, right) {
  const [a, b] = await Promise.all([sha256(left), sha256(right)]);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index % a.length] || 0) ^ (b[index % b.length] || 0);
  }
  return difference === 0;
}

const schemaReady = new WeakMap();

async function ensureSchema(db) {
  if (schemaReady.has(db)) return schemaReady.get(db);
  const ready = db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      display_name TEXT,
      plan TEXT NOT NULL DEFAULT 'free',
      plan_expires_at INTEGER,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS local_credentials (
      email TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_rate_limits (
      rate_key TEXT PRIMARY KEY,
      failures INTEGER NOT NULL DEFAULT 0,
      window_started_at INTEGER NOT NULL,
      blocked_until INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS usage_windows (
      user_key TEXT PRIMARY KEY,
      used INTEGER NOT NULL DEFAULT 0,
      window_started_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS generations (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      scene TEXT NOT NULL,
      topic TEXT NOT NULL,
      style TEXT NOT NULL,
      result_json TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      product TEXT NOT NULL,
      amount_fen INTEGER NOT NULL,
      status TEXT NOT NULL,
      provider_trade_no TEXT,
      created_at INTEGER NOT NULL,
      paid_at INTEGER
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_audit (
      id TEXT PRIMARY KEY,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS generations_user_created_idx ON generations(user_email, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS generations_model_created_idx ON generations(model, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS generations_created_idx ON generations(created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS users_created_idx ON users(created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS users_plan_expires_idx ON users(plan, plan_expires_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS orders_status_created_idx ON orders(status, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS orders_paid_idx ON orders(status, paid_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit(created_at)"),
  ]);
  schemaReady.set(db, ready);
  try {
    await ready;
  } catch (error) {
    schemaReady.delete(db);
    throw error;
  }
}

async function visitorKey(request) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const agent = request.headers.get("user-agent") || "unknown";
  const language = request.headers.get("accept-language") || "unknown";
  return `guest:${base64Url(await sha256(`miaobi-v1.4|${ip}|${agent}|${language}`)).slice(0, 40)}`;
}

async function readUsage(db, key, now = Date.now()) {
  const row = await db.prepare("SELECT used, window_started_at FROM usage_windows WHERE user_key = ?")
    .bind(key).first();
  if (!row || now - Number(row.window_started_at) >= WINDOW_MS) {
    return { used: 0, resetsAt: now + WINDOW_MS };
  }
  return { used: Math.max(0, Number(row.used || 0)), resetsAt: Number(row.window_started_at) + WINDOW_MS };
}

async function reserveUsage(db, key, limit, now = Date.now()) {
  const threshold = now - WINDOW_MS;
  const current = await db.prepare(`UPDATE usage_windows SET used = used + 1, updated_at = ?
    WHERE user_key = ? AND window_started_at > ? AND used < ? RETURNING used, window_started_at`)
    .bind(now, key, threshold, limit).first();
  if (current) return { reserved: true, used: Number(current.used), resetsAt: Number(current.window_started_at) + WINDOW_MS };
  const reset = await db.prepare(`UPDATE usage_windows SET used = 1, window_started_at = ?, updated_at = ?
    WHERE user_key = ? AND window_started_at <= ? RETURNING used`)
    .bind(now, now, key, threshold).first();
  if (reset) return { reserved: true, used: 1, resetsAt: now + WINDOW_MS };
  try {
    const created = await db.prepare(`INSERT INTO usage_windows (user_key, used, window_started_at, updated_at)
      VALUES (?, 1, ?, ?) RETURNING used`).bind(key, now, now).first();
    return { reserved: Boolean(created), used: 1, resetsAt: now + WINDOW_MS };
  } catch {
    const raced = await db.prepare(`UPDATE usage_windows SET used = used + 1, updated_at = ?
      WHERE user_key = ? AND window_started_at > ? AND used < ? RETURNING used, window_started_at`)
      .bind(now, key, threshold, limit).first();
    return {
      reserved: Boolean(raced),
      used: Number(raced?.used || limit),
      resetsAt: raced ? Number(raced.window_started_at) + WINDOW_MS : now + WINDOW_MS,
    };
  }
}

async function releaseUsage(db, key) {
  await db.prepare("UPDATE usage_windows SET used = MAX(0, used - 1), updated_at = ? WHERE user_key = ?")
    .bind(Date.now(), key).run();
}

function activeMembership(user, now = Date.now()) {
  return Boolean(user && user.plan !== "free" && user.plan_expires_at && Number(user.plan_expires_at) > now);
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function authRateKey(request, email) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  return `auth:${base64Url(await sha256(`${ip}|${String(email || "").toLowerCase()}`)).slice(0, 40)}`;
}

async function authRateStatus(db, key, now = Date.now()) {
  const row = await db.prepare("SELECT failures, window_started_at, blocked_until FROM auth_rate_limits WHERE rate_key = ?")
    .bind(key).first();
  if (!row) return { blocked: false, failures: 0 };
  if (Number(row.blocked_until || 0) > now) {
    return { blocked: true, failures: Number(row.failures || 0), retryAt: Number(row.blocked_until) };
  }
  if (now - Number(row.window_started_at || 0) >= AUTH_WINDOW_MS) return { blocked: false, failures: 0 };
  return { blocked: false, failures: Number(row.failures || 0) };
}

async function recordAuthFailure(db, key, now = Date.now()) {
  const current = await authRateStatus(db, key, now);
  const failures = current.failures + 1;
  const blockedUntil = failures >= AUTH_MAX_FAILURES ? now + AUTH_BLOCK_MS : 0;
  const windowStartedAt = current.failures ? now - Math.min(AUTH_WINDOW_MS - 1, AUTH_WINDOW_MS / 2) : now;
  await db.prepare(`INSERT INTO auth_rate_limits
    (rate_key, failures, window_started_at, blocked_until, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(rate_key) DO UPDATE SET
      failures = excluded.failures,
      window_started_at = CASE
        WHEN auth_rate_limits.window_started_at <= ? THEN excluded.window_started_at
        ELSE auth_rate_limits.window_started_at
      END,
      blocked_until = excluded.blocked_until,
      updated_at = excluded.updated_at`)
    .bind(key, failures, windowStartedAt, blockedUntil, now, now - AUTH_WINDOW_MS).run();
  return { blocked: blockedUntil > now, retryAt: blockedUntil || undefined };
}

async function clearAuthFailures(db, key) {
  await db.prepare("DELETE FROM auth_rate_limits WHERE rate_key = ?").bind(key).run();
}

function parseVersions(content, count) {
  const clean = String(content || "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<analysis\b[^>]*>[\s\S]*?<\/analysis>/gi, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!clean) return [];
  let candidates = [];
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) candidates = parsed;
    else if (parsed && typeof parsed === "object") {
      candidates = parsed.versions || parsed.results || parsed.outputs || [];
    }
  } catch {
    // Fall through to labeled plain text.
  }
  if (!Array.isArray(candidates) || !candidates.length) {
    candidates = clean.split(/\n(?=(?:版本\s*)?\d+[.、：:]|\n-{3,})/);
  }
  const results = [];
  for (const value of candidates) {
    const normalized = String(value || "")
      .replace(/^(?:版本\s*)?\d+[.、：:]\s*/, "")
      .replace(/^\s*(?:当然可以|好的|以下是|下面是)[，,:：\s]*/i, "")
      .trim();
    const fingerprint = canonical(normalized);
    if (normalized.length < 2 || results.some(item => canonical(item) === fingerprint)) continue;
    results.push(normalized);
    if (results.length >= count) break;
  }
  return results;
}

const NEGATED_ACTION_PATTERN =
  /(?:无需|不用|不需要|不必|免于)[^，。！？；\n]{0,12}(报名|预约|付费|缴费|收费|审核|登记|准备|等待|排队|携带|提交|提供|到场|做|注册|登录|购买|下单|联系|填写|申请|领取|使用|操作|参加|加群|进群|下载|安装)/gu;
const GENERIC_NEGATED_CLAUSE_PATTERN =
  /(?:无需|不用|不需要|不必|免于)[^，。！？；\n]{0,20}/gu;
const NOVEL_FACT_PATTERNS = [
  /(?:免费|免单|零费用|不收费)/gu,
  /(?:随时(?:可以|可)?|不限(?:时间|次数|名额)|永久(?:有效|使用)?|当天(?:到账|生效))/gu,
  /(?:任何人都|所有人都|零门槛|无门槛|无需资质)/gu,
  /(?:今天|明天|后天|昨天|本周|下周|这周|这个月|本月|下个月|今年|明年|近期|稍后|随后|届时|当天)/gu,
  /(?:不慌不忙|轻轻松松|更(?:安心|省心|方便|高效|划算|适合|舒服|轻松))/gu,
];

function hasSupportedPattern(material, pattern) {
  for (const match of String(material || "").matchAll(pattern)) {
    const before = String(material || "").slice(Math.max(0, match.index - 18), match.index);
    if (!/(?:不要|禁止|避免|不得|不能|别)(?:再)?(?:写|出现|使用|添加|补充|编造|声称|宣传|承诺)?[^。！？；\n]{0,8}$/u.test(before)) return true;
  }
  return false;
}

function unsupportedFactInferences(output, source) {
  const material = String(source || "");
  const found = new Set();
  const sourceHasExplicitNegation = hasSupportedPattern(
    material,
    new RegExp(GENERIC_NEGATED_CLAUSE_PATTERN.source, "gu"),
  );
  if (!sourceHasExplicitNegation) {
    for (const match of String(output || "").matchAll(GENERIC_NEGATED_CLAUSE_PATTERN)) found.add(match[0]);
  }
  for (const match of String(output || "").matchAll(NEGATED_ACTION_PATTERN)) {
    const action = match[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const supported = hasSupportedPattern(
      material,
      new RegExp(`(?:无需|不用|不需要|不必|免于)[^，。！？；\\n]{0,12}${action}`, "gu"),
    );
    if (!supported) found.add(match[0]);
  }
  for (const pattern of NOVEL_FACT_PATTERNS) {
    for (const match of String(output || "").matchAll(pattern)) {
      const claim = match[0];
      const escaped = claim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!hasSupportedPattern(material, new RegExp(escaped, "gu"))) found.add(claim);
    }
  }
  const findings = [...found];
  return findings.filter(item => !findings.some(other => other !== item && other.includes(item)));
}

function canonical(value) {
  return String(value || "").replace(/[\s，。！？；：、,.!?;:'"“”‘’（）()\[\]【】《》<>-]/g, "").toLowerCase();
}

function sourceNumbers(value, excludeNegated = false) {
  const material = String(value || "")
    .replace(/^\s*\d{1,2}\s*[.、)）:-]\s*/gm, "")
    .replace(/[【[(]?\d{1,2}\s*[-—~至]\s*\d{1,2}\s*(?:秒|分钟)[】)\]]?/g, "");
  const found = new Set();
  for (const match of material.matchAll(/\d+(?:[.,]\d+)?%?/g)) {
    const before = material.slice(Math.max(0, match.index - 18), match.index);
    if (excludeNegated && /(?:不要|禁止|避免|不得|不能|别)(?:再)?(?:写|出现|使用|添加|补充|编造|声称|宣传|承诺)?[^。！？；\n]{0,8}$/u.test(before)) continue;
    found.add(match[0]);
  }
  return found;
}

function unsupportedNumbers(output, source) {
  const allowed = sourceNumbers(source, true);
  return [...sourceNumbers(output)].filter(value => !allowed.has(value));
}

const UNSUPPORTED_CLAIM_PATTERNS = [
  /(?:本人亲测|亲测|亲身体验|我用过|我试过|本人体验|反复回购)/g,
  /(?:顾客都说|客户都说|用户都说|大家都在|很多人都|全网都在)/g,
  /(?:全网第一|行业第一|销量第一|最划算|效果最好|绝对有效|保证有效|立刻见效|永久有效)/g,
  /[一二三四五六七八九十百千万两]+(?:天|周|个月|年|人|次|倍|元|％|%)/g,
];

function unsupportedClaims(output, source) {
  const material = String(source || "");
  const found = new Set();
  for (const pattern of UNSUPPORTED_CLAIM_PATTERNS) {
    for (const match of String(output || "").matchAll(pattern)) {
      if (!canonical(material).includes(canonical(match[0]))) found.add(match[0]);
    }
  }
  return [...found];
}

const STRICT_FACT_RETENTION_TOOLS = new Set([
  "智能润色", "内容改写", "扩写充实", "多语言翻译", "纠错校对", "风格转换", "自然化改写",
]);
const CALL_TO_ACTION_PATTERN =
  /(?:欢迎(?:大家|你|您|朋友们)?(?:前来|来|到店|咨询|联系|报名|参与|体验|关注|点赞(?:关注)?|收藏|转发)|感兴趣(?:的朋友|的话)?(?:可以|欢迎)?(?:前来|来|咨询|联系|报名|参与|体验|关注)|有空(?:来|过来|坐坐)|快来|赶紧|立即(?:购买|下单|报名|咨询|联系|参与)|别错过|期待(?:你|您|大家)?(?:的)?(?:到来|参与))/gu;
const AI_WRITING_TELL_PATTERNS = [
  /(?:作为|身为)(?:一个|一名)?AI/giu,
  /根据你(?:所)?提供的(?:信息|内容|素材)/gu,
  /(?:以下是|下面是)(?:为你|根据|我为你)?(?:整理|生成|改写|润色|创作)/gu,
  /希望(?:以上|这些|这份)?(?:内容|文案|建议|信息)?(?:能够|能|可以)?(?:对你|给你)?(?:有所)?帮助/gu,
  /如有需要(?:我|还)?(?:可以|可)?(?:继续|再)?(?:为你)?(?:修改|调整|补充|优化)/gu,
];

function unsupportedCallsToAction(output, source, tool) {
  if (!tool || !STRICT_FACT_RETENTION_TOOLS.has(tool)) return [];
  const found = new Set();
  for (const match of String(output || "").matchAll(CALL_TO_ACTION_PATTERN)) {
    if (!canonical(source).includes(canonical(match[0]))) found.add(match[0]);
  }
  return [...found];
}

function aiWritingTells(output, source) {
  const found = new Set();
  for (const pattern of AI_WRITING_TELL_PATTERNS) {
    for (const match of String(output || "").matchAll(pattern)) {
      if (!canonical(source).includes(canonical(match[0]))) found.add(match[0]);
    }
  }
  return [...found];
}

function protectedTokens(source) {
  const tokens = new Set(sourceNumbers(source, true));
  for (const match of String(source || "").matchAll(
    /(?:https?:\/\/[^\s，。！？；]+|[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+|#[^#\s，。！？；]{2,30}#?|[A-Za-z][A-Za-z0-9._+/-]{1,80})/g,
  )) tokens.add(match[0]);
  return [...tokens].slice(0, 60);
}

function missingRequiredFacts(output, source, tool) {
  if (!tool || !STRICT_FACT_RETENTION_TOOLS.has(tool)) return [];
  const normalized = canonical(output);
  return protectedTokens(source).filter(token => !normalized.includes(canonical(token)));
}

function validResults(content, count, source, tool) {
  return parseVersions(content, count)
    .filter(item => unsupportedNumbers(item, source).length === 0)
    .filter(item => unsupportedClaims(item, source).length === 0)
    .filter(item => unsupportedFactInferences(item, source).length === 0)
    .filter(item => unsupportedCallsToAction(item, source, tool).length === 0)
    .filter(item => aiWritingTells(item, source).length === 0)
    .filter(item => missingRequiredFacts(item, source, tool).length === 0);
}

function candidateViolations(content, count, source, tool) {
  const findings = new Set();
  for (const item of parseVersions(content, count)) {
    for (const value of unsupportedNumbers(item, source)) findings.add(`新增数字：${value}`);
    for (const value of unsupportedClaims(item, source)) findings.add(`无依据结论：${value}`);
    for (const value of unsupportedFactInferences(item, source)) findings.add(`无依据推断：${value}`);
    for (const value of unsupportedCallsToAction(item, source, tool)) findings.add(`擅自增加行动号召：${value}`);
    for (const value of aiWritingTells(item, source)) findings.add(`AI套话：${value}`);
    for (const value of missingRequiredFacts(item, source, tool)) findings.add(`遗漏原文关键信息：${value}`);
  }
  return [...findings].slice(0, 12);
}

const STYLE_RULES = {
  "自然松弛": "自然口语与长短句交替，少用形容词和总结式升华，不堆网络热词，不写成广告腔。",
  "高级感": "用词准确克制、句子干净，依靠具体细节体现质感；不用顶级、奢华、尊贵等空洞抬高词。",
  "文艺治愈": "围绕真实场景、动作或感受营造温和画面，最多一处自然比喻，不连续排比，不写万能鸡汤。",
  "幽默搞笑": "使用轻微反差、自嘲或意外转折制造笑点；不冒犯群体，不强塞流行梗，不连续使用感叹号。",
  "正式专业": "结论和目的前置，信息按逻辑分层，表达客观准确可执行；不用口头禅、网络梗或Emoji。",
  "简洁有力": "每句话只表达一个重点，优先使用明确动词，删除重复铺垫；保留必要条件与关键事实。",
};

const PREFERENCE_RULES = {
  "综合诊断": "检查事实完整性、逻辑顺序、重复空话、语气适配和风险表达；只指出确实存在的问题，再给完整修改稿。",
  "重点查套话": "标出具体套话或空泛句并用与素材直接相关的具体表达替换。",
  "重点查逻辑": "重点检查前后矛盾、因果倒置、信息缺口与段落衔接，再按清晰顺序重组。",
  "自然流畅": "修复生硬、重复和不顺句，让文字像真人自然说写，同时保留原作者语气。",
  "正式专业": STYLE_RULES["正式专业"],
  "简洁克制": "删除赘词、重复和夸张修饰，用更短、更准确的句子表达同一信息。",
  "口语自然": "改成适合真实对话或口播的表达，允许自然停顿，但不用夸张网络梗。",
  "自然表达": "重新组织句式，让表达自然顺畅；不能只替换同义词，也不能改变事实和立场。",
  "正式表达": STYLE_RULES["正式专业"],
  "口语表达": "改成真人容易说出口的口语，句子不宜过长，保留全部事实与限定条件。",
  "重新组织结构": "可调整段落顺序、合并重复信息并补足衔接，但不得增加素材中没有的事实。",
  "完善结构": "补全开头、主体、转折和结尾之间的结构关系，信息不足处不编造。",
  "补充逻辑": "展开已有观点之间的因果、条件和解释，不新增未经提供的原因或结果。",
  "补充表达细节": "只扩展已有场景、动作和已知特征的表达层次，不虚构人物、案例或数据。",
  "核心摘要": "保留核心结论、依据、条件、数字和例外，压缩成忠于原文的摘要。",
  "一句话总结": "用一句完整的话概括最重要结论；必要限定条件必须保留。",
  "要点列表": "按重要性输出精炼要点列表，每一点不重复，数字和专有名词保持原样。",
  "英文": "翻译为自然准确的英文，保留原文语气、段落、专有名词和所有数字。",
  "日文": "翻译为自然准确的日文，按场景选择得体语体，保留专有名词和所有数字。",
  "韩文": "翻译为自然准确的韩文，按场景选择得体语体，保留专有名词和所有数字。",
  "繁体中文": "转换为符合繁体中文习惯的文本，只做必要用词调整，不改变原意与事实。",
  "修订稿＋修改说明": "先给完整修订稿，再逐条列出确实修改过的问题及原因。",
  "只给修订稿": "只输出校正后的完整文本，不附解释；没有错误的部分尽量保持不变。",
  "自然口语": STYLE_RULES["自然松弛"],
  "温柔真诚": "语气温和直接，把关心落在具体事情上；不替对方下结论，不使用情绪绑架和模板化煽情。",
  "幽默克制": STYLE_RULES["幽默搞笑"],
  "文艺简洁": "使用一处具体画面或意象，句子简洁有留白；不堆砌辞藻，不强行升华。",
  "公众号": "输出10个能被正文兑现的公众号标题，兼顾主题明确和阅读价值，不使用震惊体与虚假悬念。",
  "小红书": "输出10个适合小红书的标题，清楚写出对象或体验价值；不冒充亲测，不使用无依据数字和极限词。",
  "短视频": "输出10个适合视频封面或开场的短标题，前置冲突、问题或收益，但不夸大结果。",
  "电商": "输出10个电商标题，组合真实商品词、属性、规格和适用场景，不堆无关热词。",
  "文章大纲": "输出文章标题与多级章节结构，每个分支职责明确，顺序符合阅读逻辑。",
  "项目拆解": "按目标、任务、依赖、风险和验收拆成可执行层级，不虚构负责人和时间。",
  "学习笔记": "按概念、原理、例子、易错点和复习问题组织层级，只使用原文信息。",
  "演讲提纲": "按开场、核心观点、论据、过渡和结尾组织，节点适合口头表达。",
};

function appliedControls(body) {
  const style = STYLE_RULES[body?.style] ? body.style : "自然松弛";
  const preference = body?.tool
    ? (PREFERENCE_RULES[body?.preference] ? body.preference : "自然表达")
    : null;
  const intensity = body?.tool && ["轻度", "标准", "深度"].includes(body?.intensity) ? body.intensity : body?.tool ? "标准" : null;
  const translation = body?.tool === "多语言翻译";
  const summary = ["缩写提炼", "精简表达"].includes(body?.tool);
  const intensityInstruction = intensity === "轻度"
    ? translation
      ? "采用贴近原句结构的准确翻译，只做目标语言必须的语序调整。"
      : summary
        ? "只删除明显重复和次要铺垫，保留原文大部分结构与细节。"
        : "只修改明确错误、明显重复和不顺的局部；未发现问题的句子与段落顺序保持原样。"
    : intensity === "深度"
      ? translation
        ? "在准确保留全部事实的前提下，按目标语言母语表达重组句式和语序，使成品适合直接发布。"
        : summary
          ? "大幅压缩到核心结论、依据和必要限定条件；允许重组顺序，但所有关键事实必须保留。"
          : "允许重排段落、合并重复信息、拆分长句并重写表达；专有名词、数字、事实、因果和立场必须完整保留。"
      : intensity
        ? translation
          ? "在忠实原意的前提下调整句式，使译文自然流畅并符合指定使用场景。"
          : summary
            ? "压缩重复说明并重排重点，保留核心结论、关键事实、数字和例外条件。"
            : "进行句子级润色并优化段内顺序，必要时合并重复句；整体结构和全部事实保持不变。"
        : null;
  return {
    style,
    styleInstruction: STYLE_RULES[style],
    preference,
    preferenceInstruction: preference ? PREFERENCE_RULES[preference] : null,
    intensity,
    intensityInstruction,
    length: String(body?.length || "标准 · 150—300字"),
  };
}

function writingPrompt(body, count) {
  const controls = appliedControls(body);
  return `你是“妙笔AI”的中文写作编辑。只依据用户给出的真实素材写最终成品，不得虚构数字、销量、排名、亲身经历、用户评价、功效或保证性结论。

任务：${body.tool || body.scene || "通用文案"}
主题/原文：${body.topic || ""}
补充事实：${body.details || "未提供"}
目标受众：${body.audience || "未提供"}
写作目的：${body.purpose || "未提供"}
必须保留/禁用表达：${body.requirements || "未提供"}
风格：${controls.style}
风格执行规则：${controls.styleInstruction}
长度：${controls.length}
${body.tool ? `输出偏好：${controls.preference}\n输出偏好执行规则：${controls.preferenceInstruction}\n处理强度：${controls.intensity}\n处理强度执行规则：${controls.intensityInstruction}` : ""}

要求：
1. 不写“在这个快节奏时代、赋能、引领、重新定义、极致体验”等空泛套话。
2. 信息不足时使用克制表达，不替用户补造事实。
3. ${body.tool ? "只输出 1 个处理结果" : `输出 ${count} 个角度、开头和句式明显不同的版本`}。
4. 所选风格、输出偏好和强度必须真实体现在词汇、句长、语气、结构或格式中，不能只复述选项名称。
5. 文本处理时原文是封闭事实集；不得新增原文没有的否定条件、资格、费用、报名预约、审核、配送、售后、时间流程或因果推断。例如“现场登记”不等于“无需提前报名”。
6. 润色、改写、扩写、翻译、校对和风格转换必须保留原文数字、日期、时间、网址、邮箱和英文专名。
7. 文本处理不得擅自添加“欢迎来、感兴趣可以、有空来坐坐、立即报名”等原文没有的行动号召。
8. 成品不得附加“根据你提供的信息、希望对你有帮助、如有需要可以继续修改”等助手式套话。
9. 只输出合法 JSON 对象 {"versions":["完整成品"]}，不要解释，不要 Markdown 代码块。`;
}

async function accountResponse(request, env) {
  const session = await readSession(request, env);
  const key = session?.email || await visitorKey(request);
  const user = session
    ? await env.DB.prepare("SELECT plan, plan_expires_at FROM users WHERE email = ?").bind(session.email).first()
    : null;
  const member = session?.role === "admin" || activeMembership(user);
  const limit = member ? MEMBER_LIMIT : FREE_LIMIT;
  const usage = await readUsage(env.DB, key);
  return json({
    signedIn: Boolean(session),
    name: session?.email.split("@")[0] || "访客",
    remaining: Math.max(0, limit - usage.used),
    resetsAt: usage.resetsAt,
    isAdmin: session?.role === "admin",
    isMember: member,
    plan: member ? user?.plan || "admin" : "free",
    planExpiresAt: user?.plan_expires_at || null,
    aiConfigured: Boolean(env.DEEPSEEK_API_KEY),
    aiOperational: Boolean(env.DEEPSEEK_API_KEY),
    aiProvider: "deepseek",
    aiProviderLabel: "DeepSeek",
    aiModel: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    generationMode: "deepseek",
    signInPath: session ? null : "/login",
  });
}

async function authRoute(request, env, pathname) {
  if (request.method !== "POST" || !sameOrigin(request)) return json({ error: "请求来源或方法不正确" }, 403);
  if (pathname.endsWith("/logout")) {
    return json({ ok: true }, 200, {
      "Set-Cookie": "miaobi_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    });
  }
  const body = await request.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: "请输入正确的邮箱" }, 400);
  if (password.length < 10 || password.length > 200) return json({ error: "密码需要 10—200 位" }, 400);

  const adminEmail = String(env.ADMIN_EMAIL || "").trim().toLowerCase();
  const rateKey = await authRateKey(request, email);
  if (pathname.endsWith("/login")) {
    const rate = await authRateStatus(env.DB, rateKey);
    if (rate.blocked) {
      const retrySeconds = Math.max(1, Math.ceil((rate.retryAt - Date.now()) / 1000));
      return json({ error: "登录尝试过多，请稍后再试" }, 429, { "Retry-After": String(retrySeconds) });
    }
  }
  if (email === adminEmail) {
    if (!env.ADMIN_PASSWORD || !await constantTimeTextEqual(password, env.ADMIN_PASSWORD)) {
      await recordAuthFailure(env.DB, rateKey);
      return json({ error: "站长邮箱或密码不正确" }, 401);
    }
    await clearAuthFailures(env.DB, rateKey);
    const sessionToken = await createSessionToken(env, email, "admin");
    return json({ ok: true, role: "admin", sessionToken }, 200, {
      "Set-Cookie": `miaobi_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_MS / 1000)}`,
    });
  }

  if (pathname.endsWith("/register")) {
    const existing = await env.DB.prepare("SELECT email FROM local_credentials WHERE email = ?").bind(email).first();
    if (existing) return json({ error: "该邮箱已注册，请直接登录" }, 409);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const passwordDigest = await passwordHash(password, salt);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO local_credentials (email, password_hash, salt, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)`).bind(email, base64Url(passwordDigest), base64Url(salt), now, now),
      env.DB.prepare(`INSERT INTO users (email, display_name, plan, plan_expires_at, created_at, last_seen_at)
        VALUES (?, ?, 'free', NULL, ?, ?)
        ON CONFLICT(email) DO UPDATE SET last_seen_at = excluded.last_seen_at`)
        .bind(email, email.split("@")[0], now, now),
    ]);
    const sessionToken = await createSessionToken(env, email, "user");
    return json({ ok: true, role: "user", sessionToken }, 200, {
      "Set-Cookie": `miaobi_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_MS / 1000)}`,
    });
  }

  const credential = await env.DB.prepare("SELECT password_hash, salt FROM local_credentials WHERE email = ?")
    .bind(email).first();
  if (!credential) {
    await recordAuthFailure(env.DB, rateKey);
    return json({ error: "邮箱或密码不正确" }, 401);
  }
  const actual = await passwordHash(password, fromBase64Url(credential.salt));
  if (!await constantTimeTextEqual(base64Url(actual), credential.password_hash)) {
    await recordAuthFailure(env.DB, rateKey);
    return json({ error: "邮箱或密码不正确" }, 401);
  }
  await clearAuthFailures(env.DB, rateKey);
  await env.DB.prepare("UPDATE users SET last_seen_at = ? WHERE email = ?").bind(Date.now(), email).run();
  const sessionToken = await createSessionToken(env, email, "user");
  return json({ ok: true, role: "user", sessionToken }, 200, {
    "Set-Cookie": `miaobi_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_MS / 1000)}`,
  });
}

async function deployCheckRoute(request, env) {
  if (request.method !== "POST") return json({ error: "接口不存在" }, 404);
  const supplied = request.headers.get("x-miaobi-deploy-check") || "";
  if (!env.DEPLOY_CHECK_SECRET || !supplied || !await constantTimeTextEqual(supplied, env.DEPLOY_CHECK_SECRET)) {
    return json({ error: "接口不存在" }, 404);
  }
  if (!env.DEEPSEEK_API_KEY) return json({ ok: false, error: "DeepSeek 服务端密钥缺失" }, 503);
  const model = env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        thinking: { type: "disabled" },
        messages: [
          { role: "system", content: "只回复：妙笔AI接口正常" },
          { role: "user", content: "执行一次部署连通性检查。" },
        ],
        temperature: 0,
        max_tokens: 128,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return json({ ok: false, error: `DeepSeek 官方接口返回 HTTP ${response.status}` }, 502);
    const payload = await response.json().catch(() => null);
    const content = String(payload?.choices?.[0]?.message?.content || "").trim();
    if (!content) return json({ ok: false, error: "DeepSeek 返回正文为空" }, 502);
    return json({ ok: true, model: payload?.model || model, contentReceived: true });
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error && error.name === "AbortError" ? "DeepSeek 真实请求超时" : "DeepSeek 真实请求失败",
    }, 502);
  } finally {
    clearTimeout(timer);
  }
}

async function generateRoute(request, env) {
  if (request.method !== "POST" || !sameOrigin(request)) return json({ error: "请求来源或方法不正确" }, 403);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 64 * 1024) return json({ error: "请求内容过大，请缩短后重试" }, 413);
  if (!env.DEEPSEEK_API_KEY) {
    return json({
      error: "DeepSeek 服务尚未配置；站长完成安全密钥设置后即可恢复，本次不扣次数",
      code: "DEEPSEEK_NOT_CONFIGURED",
    }, 503);
  }
  const body = await request.json().catch(() => null);
  const topic = String(body?.topic || "").trim();
  const material = [topic, body?.details, body?.audience, body?.purpose, body?.requirements].filter(Boolean).join("\n");
  if (!topic || material.length > 12000) return json({ error: "请输入有效内容，全部素材不能超过 12,000 字" }, 400);
  const blocked = [
    /(?:诈骗|洗钱|套现|跑分).{0,16}(?:话术|教程|引流|推广|脚本)/i,
    /(?:赌博|博彩|六合彩).{0,16}(?:推广|引流|招募|广告|话术)/i,
    /(?:色情|招嫖|裸聊).{0,16}(?:推广|引流|招募|广告|话术)/i,
    /(?:毒品|冰毒|海洛因).{0,16}(?:制作|配方|贩卖|推广|教程)/i,
    /(?:代写|枪手).{0,12}(?:论文|作业|考试)/i,
  ];
  if (blocked.some(pattern => pattern.test(material))) return json({ error: "该请求不符合内容安全规则，请调整后重试" }, 400);
  const session = await readSession(request, env);
  const user = session
    ? await env.DB.prepare("SELECT plan, plan_expires_at FROM users WHERE email = ?").bind(session.email).first()
    : null;
  const member = session?.role === "admin" || activeMembership(user);
  const limit = member ? MEMBER_LIMIT : FREE_LIMIT;
  const inputLimit = member ? 12000 : 4000;
  if (material.length > inputLimit) return json({ error: `当前账户单次最多输入 ${inputLimit.toLocaleString()} 字` }, 400);
  const siteLimit = Math.max(1, Math.min(100000, Number(env.AI_SITE_DAILY_LIMIT || 500) || 500));
  const siteUsage = await env.DB.prepare("SELECT COUNT(*) total FROM generations WHERE created_at >= ? AND model LIKE 'deepseek-%'")
    .bind(Date.now() - WINDOW_MS).first();
  if (Number(siteUsage?.total || 0) >= siteLimit) {
    return json({ error: "站点近 24 小时 DeepSeek 总额度已用完，请稍后再试", code: "SITE_QUOTA_EXCEEDED" }, 503);
  }
  const key = session?.email || await visitorKey(request);
  const reservation = await reserveUsage(env.DB, key, limit);
  if (!reservation.reserved) return json({
    error: `当前滚动 24 小时 ${limit} 次额度已用完`,
    code: "QUOTA_EXCEEDED",
    resetsAt: reservation.resetsAt,
  }, 402);

  const count = body?.tool ? 1 : member ? Math.min(6, Math.max(3, Number(body?.versionCount) || 6)) : 3;
  const controls = appliedControls(body);
  const model = env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  const basePrompt = writingPrompt(body, count);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 38000);
  let response;
  try {
    response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你是严谨的中文写作编辑。严格遵守事实边界，只输出最终成品。" },
          { role: "user", content: basePrompt },
        ],
        temperature: body?.tool ? 0.15 : 0.65,
        max_tokens: body?.tool ? 1800 : count > 3 ? 4200 : 2800,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    await releaseUsage(env.DB, key);
    return json({ error: `DeepSeek 请求失败，本次不扣次数：${error instanceof Error ? error.message : "网络异常"}`, code: "DEEPSEEK_UNAVAILABLE" }, 503);
  }
  clearTimeout(timer);
  if (!response.ok) {
    await releaseUsage(env.DB, key);
    const detail = (await response.text()).slice(0, 240);
    return json({ error: `DeepSeek 未通过真实调用（HTTP ${response.status}），本次不扣次数：${detail}`, code: "DEEPSEEK_UNAVAILABLE" }, 503);
  }
  const payload = await response.json().catch(() => null);
  const content = payload?.choices?.[0]?.message?.content;
  let results = validResults(content, count, material, body?.tool);
  let resolvedModel = payload?.model || model;
  if (results.length < count) {
    const findings = candidateViolations(content, count, material, body?.tool);
    const retryController = new AbortController();
    const retryTimer = setTimeout(() => retryController.abort(), 38000);
    try {
      const retryResponse = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "你是严谨的中文写作编辑。严格遵守事实边界，只输出最终成品。" },
            {
              role: "user",
              content: `${basePrompt}

上一次输出未通过事实检查，请重新输出完整的 ${count} 个版本。
检测到的具体问题：${findings.length ? findings.join("；") : "输出数量、格式或事实边界未通过"}。
删除上述无依据内容；原文中的绝对日期、时间、数字、地点和专有名词保持原样。
不得增加“无需、不用、不需要、不必、这个月、当天、更轻松、更方便、不慌不忙”等原文没有的条件、相对时间或主观结果。
不得增加“欢迎来、感兴趣可以、有空来坐坐、立即报名”等原文没有的行动号召，也不要附加助手式客套。
只输出最终 JSON 对象 {"versions":["完整成品"]}，不要解释。`,
            },
          ],
          temperature: 0,
          max_tokens: body?.tool ? 1800 : count > 3 ? 4200 : 2800,
        }),
        signal: retryController.signal,
      });
      if (retryResponse.ok) {
        const retryPayload = await retryResponse.json().catch(() => null);
        const retryContent = retryPayload?.choices?.[0]?.message?.content;
        const retryResults = validResults(retryContent, count, material, body?.tool);
        if (retryResults.length > results.length) {
          results = retryResults;
          resolvedModel = retryPayload?.model || resolvedModel;
        }
      }
    } catch {
      // The original valid subset remains usable; a fully rejected response is handled below.
    } finally {
      clearTimeout(retryTimer);
    }
  }
  if (results.length < count) {
    await releaseUsage(env.DB, key);
    return json({
      error: `DeepSeek 本次只生成了 ${results.length} / ${count} 个通过事实与质量检查的版本，本次不扣次数；请补充真实素材后重试`,
      code: "QUALITY_REJECTED",
    }, 422);
  }
  try {
    await env.DB.prepare(`INSERT INTO generations
      (id, user_email, scene, topic, style, result_json, model, prompt_tokens, completion_tokens, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(),
        key,
        body?.tool || body?.scene || "通用文案",
        topic.slice(0, 500),
        controls.style,
        JSON.stringify(results),
        resolvedModel,
        Number(payload?.usage?.prompt_tokens || 0),
        Number(payload?.usage?.completion_tokens || 0),
        Date.now(),
      ).run();
  } catch {
    await releaseUsage(env.DB, key);
    return json({ error: "结果保存失败，本次不扣次数" }, 503);
  }
  return json({
    results,
    remaining: Math.max(0, limit - reservation.used),
    resetsAt: reservation.resetsAt,
    model: resolvedModel,
    engine: resolvedModel,
    engineLabel: `DeepSeek · ${resolvedModel}`,
    fallback: false,
    tier: member ? "member" : "free",
    appliedControls: {
      style: controls.style,
      preference: controls.preference,
      intensity: controls.intensity,
      length: controls.length,
    },
  });
}

async function requireAdmin(request, env) {
  const session = await readSession(request, env);
  return session?.role === "admin" ? session : null;
}

async function adminOverview(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "请先以站长身份登录" }, 401);
  const now = Date.now();
  const [users, activeMembers, generations, tokens, revenue, usersList, orders, audit] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) total FROM users").first(),
    env.DB.prepare("SELECT COUNT(*) total FROM users WHERE plan != 'free' AND plan_expires_at > ?").bind(now).first(),
    env.DB.prepare("SELECT COUNT(*) total FROM generations WHERE created_at >= ?").bind(now - WINDOW_MS).first(),
    env.DB.prepare("SELECT COALESCE(SUM(prompt_tokens), 0) prompt_tokens, COALESCE(SUM(completion_tokens), 0) completion_tokens FROM generations WHERE created_at >= ?").bind(now - WINDOW_MS).first(),
    env.DB.prepare("SELECT COALESCE(SUM(amount_fen), 0) total_fen FROM orders WHERE status = 'paid'").first(),
    env.DB.prepare("SELECT email, display_name, plan, plan_expires_at, last_seen_at FROM users ORDER BY last_seen_at DESC LIMIT 100").all(),
    env.DB.prepare("SELECT id, user_email, product, amount_fen, status, provider_trade_no, created_at, paid_at FROM orders ORDER BY created_at DESC LIMIT 50").all(),
    env.DB.prepare("SELECT actor_email, action, target, detail, created_at FROM admin_audit ORDER BY created_at DESC LIMIT 30").all(),
  ]);
  const userTotal = Number(users?.total || 0);
  const memberTotal = Number(activeMembers?.total || 0);
  const rollingGenerations = Number(generations?.total || 0);
  const siteLimit = Math.max(1, Math.min(100000, Number(env.AI_SITE_DAILY_LIMIT || 500) || 500));
  return json({
    release: VERSION,
    currentUser: admin,
    cards: {
      users: userTotal,
      activeMembers: memberTotal,
      rollingGenerations,
      siteRemaining: Math.max(0, siteLimit - rollingGenerations),
      promptTokens: Number(tokens?.prompt_tokens || 0),
      completionTokens: Number(tokens?.completion_tokens || 0),
      revenueFen: Number(revenue?.total_fen || 0),
      memberConversion: userTotal ? Number(((memberTotal / userTotal) * 100).toFixed(1)) : 0,
    },
    systems: {
      deepSeekConfigured: Boolean(env.DEEPSEEK_API_KEY),
      model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      database: true,
      rollingWindowHours: 24,
      freeLimit: FREE_LIMIT,
      memberLimit: MEMBER_LIMIT,
      siteLimit,
    },
    users: usersList.results,
    orders: orders.results,
    audit: audit.results,
  });
}

async function adminMembers(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "请先以站长身份登录" }, 401);
  if (request.method !== "POST" || !sameOrigin(request)) return json({ error: "请求来源或方法不正确" }, 403);
  const body = await request.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "请输入正确的用户邮箱" }, 400);
  const now = Date.now();

  if (body?.action === "refund") {
    const orderId = String(body?.orderId || "");
    if (!/^manual:[a-zA-Z0-9-]{8,80}$/.test(orderId)) return json({ error: "退款订单标识无效" }, 400);
    const order = await env.DB.prepare("SELECT user_email, product, status FROM orders WHERE id = ?").bind(orderId).first();
    if (!order || order.user_email !== email) return json({ error: "没有找到与该用户匹配的订单" }, 404);
    if (order.status === "refunded") return json({ ok: true, message: "该笔订单已登记为退款，无需重复操作" });
    if (order.status !== "paid") return json({ error: "只有已核对到账的订单可以登记退款" }, 409);
    await env.DB.batch([
      env.DB.prepare("UPDATE orders SET status = 'refunded' WHERE id = ? AND status = 'paid'").bind(orderId),
      env.DB.prepare(`INSERT INTO admin_audit (id, actor_email, action, target, detail, created_at)
        VALUES (?, ?, 'order_refund_recorded', ?, ?, ?)`)
        .bind(crypto.randomUUID(), admin.email, email, JSON.stringify({ orderId }), now),
    ]);
    const readback = await env.DB.prepare("SELECT user_email, product, status FROM orders WHERE id = ?").bind(orderId).first();
    if (!readback || readback.status !== "refunded") return json({ error: "退款登记后数据库读回不一致，未冒充成功" }, 409);
    return json({ ok: true, message: `已登记 ${orderId} 完成原路退款；会员权益如需撤销请另行操作` });
  }

  if (body?.action === "revoke") {
    const before = await env.DB.prepare("SELECT email FROM users WHERE email = ?").bind(email).first();
    if (!before) return json({ error: "没有找到该用户" }, 404);
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET plan = 'free', plan_expires_at = NULL WHERE email = ?").bind(email),
      env.DB.prepare(`INSERT INTO admin_audit (id, actor_email, action, target, detail, created_at)
        VALUES (?, ?, 'member_revoke', ?, ?, ?)`)
        .bind(crypto.randomUUID(), admin.email, email, JSON.stringify({ plan: "free" }), now),
    ]);
    const member = await env.DB.prepare("SELECT plan, plan_expires_at FROM users WHERE email = ?").bind(email).first();
    if (!member || member.plan !== "free" || member.plan_expires_at !== null) {
      return json({ error: "撤销后数据库读回不一致，未冒充成功" }, 409);
    }
    return json({ ok: true, membershipActive: false, message: `已撤销 ${email}，并完成数据库读回确认` });
  }

  const plan = ["monthly", "yearly", "student"].includes(body?.plan) ? body.plan : "monthly";
  const days = Math.floor(Number(body?.days || (plan === "yearly" ? 365 : 30)));
  const amountFen = Math.floor(Number(body?.amountFen || 0));
  const paymentMethod = ["wechat", "alipay", "complimentary"].includes(body?.paymentMethod) ? body.paymentMethod : "complimentary";
  if (days < 1 || days > 3660) return json({ error: "会员天数必须为 1—3660 天" }, 400);
  if (paymentMethod !== "complimentary" && amountFen < 1) return json({ error: "请填写真实到账金额" }, 400);
  const requestId = String(body?.requestId || "");
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) return json({ error: "请求标识无效，请刷新后重试" }, 400);
  const orderId = `manual:${requestId}`;
  const orderStatus = paymentMethod === "complimentary" ? "complimentary" : "paid";
  const extension = days * 86400000;
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (email, display_name, plan, plan_expires_at, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET plan = excluded.plan,
          plan_expires_at = CASE WHEN users.plan_expires_at > ? THEN users.plan_expires_at + ? ELSE excluded.plan_expires_at END`)
        .bind(email, email.split("@")[0], plan, now + extension, now, now, now, extension),
      env.DB.prepare(`INSERT INTO orders
        (id, user_email, product, amount_fen, status, provider_trade_no, created_at, paid_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(orderId, email, plan, paymentMethod === "complimentary" ? 0 : amountFen, orderStatus, `manual_${paymentMethod}`, now, now),
      env.DB.prepare(`INSERT INTO admin_audit (id, actor_email, action, target, detail, created_at)
        VALUES (?, ?, 'member_grant', ?, ?, ?)`)
        .bind(crypto.randomUUID(), admin.email, email, JSON.stringify({ plan, days, orderId }), now),
    ]);
  } catch {
    const existing = await env.DB.prepare("SELECT id FROM orders WHERE id = ?").bind(orderId).first();
    if (!existing) return json({ error: "会员开通写入失败" }, 503);
  }
  const [member, order] = await Promise.all([
    env.DB.prepare("SELECT plan, plan_expires_at FROM users WHERE email = ?").bind(email).first(),
    env.DB.prepare("SELECT user_email, product, status FROM orders WHERE id = ?").bind(orderId).first(),
  ]);
  const active = Boolean(member && member.plan === plan && Number(member.plan_expires_at) > now);
  const recorded = Boolean(order && order.user_email === email && order.product === plan && order.status === orderStatus);
  if (!active || !recorded) return json({ error: "会员与订单写入后读回不一致，未冒充成功" }, 409);
  return json({
    ok: true,
    membershipActive: true,
    plan,
    planExpiresAt: member.plan_expires_at,
    orderId,
    message: `会员已真实开通，并读回确认有效至 ${new Date(member.plan_expires_at).toLocaleDateString("zh-CN")}`,
  });
}

async function workerFetch(request, env) {
  const url = new URL(request.url);
  if (!env.DB) return json({ error: "D1 数据库未绑定" }, 503);
  if (url.pathname.startsWith("/api/")) {
    await ensureSchema(env.DB);
    if (url.pathname === "/api/account" && request.method === "GET") return accountResponse(request, env);
    if (url.pathname === "/api/generate") return generateRoute(request, env);
    if (["/api/auth/login", "/api/auth/register", "/api/auth/logout"].includes(url.pathname)) {
      return authRoute(request, env, url.pathname);
    }
    if (url.pathname === "/api/deploy-check") return deployCheckRoute(request, env);
    if (url.pathname === "/api/admin/overview" && request.method === "GET") return adminOverview(request, env);
    if (url.pathname === "/api/admin/members") return adminMembers(request, env);
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        ok: Boolean(env.DEEPSEEK_API_KEY),
        release: VERSION,
        database: true,
        deepSeekConfigured: Boolean(env.DEEPSEEK_API_KEY),
        model: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
        freeLimit: FREE_LIMIT,
        windowHours: 24,
      });
    }
    return json({ error: "接口不存在" }, 404);
  }
  const response = await env.ASSETS.fetch(request);
  if (response.status === 404 && request.method === "GET" && request.headers.get("accept")?.includes("text/html")) {
    return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
  }
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const worker = {
  fetch(request, env) {
    return workerFetch(request, env).catch(error => {
      console.error("Unhandled worker error", error);
      return json({ error: "服务暂时异常，请稍后重试" }, 500);
    });
  },
};

export default worker;

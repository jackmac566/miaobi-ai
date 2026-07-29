import { AI_PROVIDERS, type AIProviderId, getAIProvider, isAIProviderId } from "./ai-providers";
export { chinaDayStart, usageDateKey } from "./date-rules";
import { usageDateKey } from "./date-rules";

export type RuntimeEnv = {
  DB: D1Database;
  AI_SITE_DAILY_LIMIT?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  ADMIN_EMAIL?: string;
  ADMIN_SWAP_TOKEN?: string;
  WECHAT_PAY_MCH_ID?: string;
  CONFIG_ENCRYPTION_KEY?: string;
};

export type AISettings = {
  apiKey: string | null;
  provider: AIProviderId;
  providerLabel: string;
  model: string;
  source: "environment" | "secure_store" | "none";
};

export type AIProviderStatus = {
  id: AIProviderId;
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

export type AIProviderVerification = {
  provider: AIProviderId;
  model: string;
  ok: boolean;
  resolvedModel: string | null;
  detail: string;
  checkedAt: number;
};

export async function runtimeEnv(): Promise<RuntimeEnv> {
  const runtime = await import("cloudflare:workers");
  return runtime.env as unknown as RuntimeEnv;
}

export function requestUser(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() || null;
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  let name: string | null = null;
  if (encodedName && encoding === "percent-encoded-utf-8") {
    try { name = decodeURIComponent(encodedName); } catch { name = null; }
  }
  return email ? { email, name: name || email.split("@")[0] } : null;
}

export function isRootAdmin(email: string | null, config: RuntimeEnv) {
  return Boolean(email && config.ADMIN_EMAIL && email === config.ADMIN_EMAIL.trim().toLowerCase());
}

export async function hasAdminAccess(email: string | null, config: RuntimeEnv) {
  if (!email) return false;
  if (isRootAdmin(email, config)) return true;
  await ensureSchema(config.DB);
  const row = await config.DB.prepare("SELECT active FROM site_admins WHERE email = ?")
    .bind(email.trim().toLowerCase()).first<{ active: number }>();
  return Number(row?.active || 0) === 1;
}

export async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      display_name TEXT,
      plan TEXT NOT NULL DEFAULT 'free',
      plan_expires_at INTEGER,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
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
    db.prepare(`CREATE INDEX IF NOT EXISTS generations_user_created_idx
      ON generations(user_email, created_at)`),
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
    db.prepare(`CREATE INDEX IF NOT EXISTS orders_status_created_idx
      ON orders(status, created_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS secret_settings (
      key TEXT PRIMARY KEY,
      encrypted_value TEXT NOT NULL,
      iv TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS daily_usage (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      usage_date TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS usage_windows (
      user_key TEXT PRIMARY KEY,
      used INTEGER NOT NULL DEFAULT 0,
      window_started_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS site_admins (
      email TEXT PRIMARY KEY,
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_audit (
      id TEXT PRIMARY KEY,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS admin_audit_created_idx
      ON admin_audit(created_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_provider_checks (
      provider_id TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      ok INTEGER NOT NULL,
      resolved_model TEXT,
      detail TEXT NOT NULL,
      checked_at INTEGER NOT NULL
    )`),
  ]);
}

export async function reserveDailyUsage(db: D1Database, userEmail: string, limit: number) {
  const usageDate = usageDateKey();
  const id = `${userEmail}:${usageDate}`;
  const now = Date.now();
  const existing = await db.prepare(`UPDATE daily_usage
    SET used = used + 1, updated_at = ?
    WHERE id = ? AND used < ?
    RETURNING used`).bind(now, id, limit).first<{ used: number }>();
  if (existing) return { reserved: true, used: Number(existing.used), id };
  try {
    const created = await db.prepare(`INSERT INTO daily_usage (id, user_email, usage_date, used, updated_at)
      VALUES (?, ?, ?, 1, ?) RETURNING used`).bind(id, userEmail, usageDate, now).first<{ used: number }>();
    return { reserved: Boolean(created), used: Number(created?.used || 0), id };
  } catch {
    const raced = await db.prepare(`UPDATE daily_usage
      SET used = used + 1, updated_at = ?
      WHERE id = ? AND used < ?
      RETURNING used`).bind(now, id, limit).first<{ used: number }>();
    return { reserved: Boolean(raced), used: Number(raced?.used || limit), id };
  }
}

export async function releaseDailyUsage(db: D1Database, id: string) {
  await db.prepare("UPDATE daily_usage SET used = MAX(0, used - 1), updated_at = ? WHERE id = ?")
    .bind(Date.now(), id).run();
}

export const USAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function visitorUsageKey(request: Request) {
  const ip = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";
  const language = request.headers.get("accept-language") || "unknown";
  const material = new TextEncoder().encode(`miaobi-v1.4|${ip}|${userAgent}|${language}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", material));
  return `guest:${Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 40)}`;
}

export async function readRollingUsage(db: D1Database, userKey: string, now = Date.now()) {
  const row = await db.prepare("SELECT used, window_started_at FROM usage_windows WHERE user_key = ?")
    .bind(userKey).first<{ used: number; window_started_at: number }>();
  if (!row || now - Number(row.window_started_at) >= USAGE_WINDOW_MS) {
    return { used: 0, resetsAt: now + USAGE_WINDOW_MS };
  }
  return {
    used: Math.max(0, Number(row.used || 0)),
    resetsAt: Number(row.window_started_at) + USAGE_WINDOW_MS,
  };
}

export async function reserveRollingUsage(db: D1Database, userKey: string, limit: number, now = Date.now()) {
  const threshold = now - USAGE_WINDOW_MS;
  const existing = await db.prepare(`UPDATE usage_windows
    SET used = used + 1, updated_at = ?
    WHERE user_key = ? AND window_started_at > ? AND used < ?
    RETURNING used, window_started_at`)
    .bind(now, userKey, threshold, limit)
    .first<{ used: number; window_started_at: number }>();
  if (existing) {
    return {
      reserved: true,
      used: Number(existing.used),
      key: userKey,
      resetsAt: Number(existing.window_started_at) + USAGE_WINDOW_MS,
    };
  }

  const reset = await db.prepare(`UPDATE usage_windows
    SET used = 1, window_started_at = ?, updated_at = ?
    WHERE user_key = ? AND window_started_at <= ?
    RETURNING used, window_started_at`)
    .bind(now, now, userKey, threshold)
    .first<{ used: number; window_started_at: number }>();
  if (reset) {
    return {
      reserved: true,
      used: 1,
      key: userKey,
      resetsAt: now + USAGE_WINDOW_MS,
    };
  }

  try {
    const created = await db.prepare(`INSERT INTO usage_windows
      (user_key, used, window_started_at, updated_at)
      VALUES (?, 1, ?, ?)
      RETURNING used, window_started_at`)
      .bind(userKey, now, now)
      .first<{ used: number; window_started_at: number }>();
    return {
      reserved: Boolean(created),
      used: Number(created?.used || 0),
      key: userKey,
      resetsAt: now + USAGE_WINDOW_MS,
    };
  } catch {
    const raced = await db.prepare(`UPDATE usage_windows
      SET used = used + 1, updated_at = ?
      WHERE user_key = ? AND window_started_at > ? AND used < ?
      RETURNING used, window_started_at`)
      .bind(now, userKey, threshold, limit)
      .first<{ used: number; window_started_at: number }>();
    return {
      reserved: Boolean(raced),
      used: Number(raced?.used || limit),
      key: userKey,
      resetsAt: raced ? Number(raced.window_started_at) + USAGE_WINDOW_MS : now + USAGE_WINDOW_MS,
    };
  }
}

export async function releaseRollingUsage(db: D1Database, userKey: string) {
  await db.prepare("UPDATE usage_windows SET used = MAX(0, used - 1), updated_at = ? WHERE user_key = ?")
    .bind(Date.now(), userKey).run();
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function encryptionKey(secret: string) {
  const raw = base64ToBytes(secret);
  if (raw.byteLength !== 32) throw new Error("CONFIG_ENCRYPTION_KEY must decode to 32 bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSetting(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(secret), encoded);
  return { encryptedValue: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) };
}

async function decryptSetting(encryptedValue: string, iv: string, secret: string) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    await encryptionKey(secret),
    base64ToBytes(encryptedValue),
  );
  return new TextDecoder().decode(decrypted);
}

function environmentSetting(config: RuntimeEnv, requested?: AIProviderId): AISettings | null {
  const values: Record<AIProviderId, { apiKey?: string; model?: string }> = {
    deepseek: { apiKey: config.DEEPSEEK_API_KEY, model: config.DEEPSEEK_MODEL },
  };
  const ids = requested ? [requested] : AI_PROVIDERS.map(provider => provider.id);
  for (const id of ids) {
    const apiKey = values[id].apiKey?.trim();
    if (!apiKey) continue;
    const preset = getAIProvider(id);
    return {
      apiKey,
      provider: id,
      providerLabel: preset.label,
      model: values[id].model?.trim() || preset.defaultModel,
      source: "environment",
    };
  }
  return null;
}

export async function getAISettingsForProvider(config: RuntimeEnv, providerId: AIProviderId): Promise<AISettings> {
  const preset = getAIProvider(providerId);
  const fromEnvironment = environmentSetting(config, providerId);
  if (fromEnvironment) return fromEnvironment;
  await ensureSchema(config.DB);
  const [secretRow, modelRow] = await Promise.all([
    config.DB.prepare("SELECT encrypted_value, iv FROM secret_settings WHERE key = ?")
      .bind(`ai_api_key:${providerId}`).first<{ encrypted_value: string; iv: string }>(),
    config.DB.prepare("SELECT value FROM app_settings WHERE key = ?")
      .bind(`ai_model:${providerId}`).first<{ value: string }>(),
  ]);
  const encrypted = secretRow;
  const model = modelRow?.value || preset.defaultModel;
  if (!encrypted || !config.CONFIG_ENCRYPTION_KEY) {
    return { apiKey: null, provider: providerId, providerLabel: preset.label, model, source: "none" };
  }
  try {
    const apiKey = await decryptSetting(encrypted.encrypted_value, encrypted.iv, config.CONFIG_ENCRYPTION_KEY);
    return { apiKey, provider: providerId, providerLabel: preset.label, model, source: "secure_store" };
  } catch (error) {
    console.error(`Unable to decrypt ${preset.label} API key`, error);
    return { apiKey: null, provider: providerId, providerLabel: preset.label, model, source: "none" };
  }
}

export async function getAISettings(config: RuntimeEnv): Promise<AISettings> {
  return getAISettingsForProvider(config, "deepseek");
}

export async function getAIProviderStatuses(config: RuntimeEnv): Promise<AIProviderStatus[]> {
  await ensureSchema(config.DB);
  const active = await getAISettings(config);
  const [activeRow, secretRows, settingRows, checkRows] = await Promise.all([
    config.DB.prepare("SELECT value FROM app_settings WHERE key = 'ai_active_provider'").first<{ value: string }>(),
    config.DB.prepare("SELECT key, updated_at FROM secret_settings WHERE key = 'ai_api_key:deepseek'")
      .all<{ key: string; updated_at: number }>(),
    config.DB.prepare("SELECT key, value FROM app_settings WHERE key = 'ai_model:deepseek'")
      .all<{ key: string; value: string }>(),
    config.DB.prepare("SELECT provider_id, model, ok, resolved_model, detail, checked_at FROM ai_provider_checks")
      .all<{ provider_id: string; model: string; ok: number; resolved_model: string | null; detail: string; checked_at: number }>(),
  ]);
  const selectedProvider = isAIProviderId(activeRow?.value) ? activeRow.value : active.provider;
  const secure = new Map<AIProviderId, number>();
  for (const row of secretRows.results || []) {
    const raw = row.key.replace("ai_api_key:", "");
    if (isAIProviderId(raw)) secure.set(raw, Number(row.updated_at || 0));
  }
  const models = new Map<AIProviderId, string>();
  for (const row of settingRows.results || []) {
    const raw = row.key.replace("ai_model:", "");
    if (isAIProviderId(raw)) models.set(raw, row.value);
  }
  const checks = new Map<AIProviderId, AIProviderVerification>();
  for (const row of checkRows.results || []) {
    if (!isAIProviderId(row.provider_id)) continue;
    checks.set(row.provider_id, {
      provider: row.provider_id,
      model: row.model,
      ok: Number(row.ok) === 1,
      resolvedModel: row.resolved_model,
      detail: row.detail,
      checkedAt: Number(row.checked_at),
    });
  }
  return AI_PROVIDERS.map(provider => {
    const env = environmentSetting(config, provider.id);
    const configured = Boolean(env?.apiKey || secure.has(provider.id));
    const model = env?.model || models.get(provider.id) || provider.defaultModel;
    const check = checks.get(provider.id);
    const verified = Boolean(check?.ok && check.model === model);
    const selected = selectedProvider === provider.id;
    return {
      id: provider.id,
      label: provider.label,
      shortLabel: provider.shortLabel,
      category: provider.category,
      description: provider.description,
      docsUrl: provider.docsUrl,
      models: provider.models.map(item => ({ ...item })),
      canSyncModels: Boolean(provider.modelsEndpoint),
      model,
      modelHint: provider.modelHint,
      configured,
      selected,
      active: selected && configured && verified,
      verified,
      verificationState: check?.model === model ? check.ok ? "verified" : "failed" : "untested",
      lastCheckedAt: check?.model === model ? check.checkedAt : null,
      resolvedModel: check?.model === model ? check.resolvedModel : null,
      source: env ? "environment" : secure.has(provider.id) ? "secure_store" : "none",
      updatedAt: env ? null : secure.get(provider.id) || null,
    };
  });
}

export async function getAIProviderVerification(
  db: D1Database,
  provider: AIProviderId,
  model: string,
): Promise<AIProviderVerification | null> {
  await ensureSchema(db);
  const row = await db.prepare(`SELECT provider_id, model, ok, resolved_model, detail, checked_at
    FROM ai_provider_checks WHERE provider_id = ?`).bind(provider)
    .first<{ provider_id: string; model: string; ok: number; resolved_model: string | null; detail: string; checked_at: number }>();
  if (!row || row.model !== model) return null;
  return {
    provider,
    model: row.model,
    ok: Number(row.ok) === 1,
    resolvedModel: row.resolved_model,
    detail: row.detail,
    checkedAt: Number(row.checked_at),
  };
}

export async function recordAIProviderCheck(
  db: D1Database,
  check: AIProviderVerification,
) {
  await ensureSchema(db);
  await db.prepare(`INSERT INTO ai_provider_checks
    (provider_id, model, ok, resolved_model, detail, checked_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider_id) DO UPDATE SET
      model = excluded.model,
      ok = excluded.ok,
      resolved_model = excluded.resolved_model,
      detail = excluded.detail,
      checked_at = excluded.checked_at`)
    .bind(
      check.provider,
      check.model,
      check.ok ? 1 : 0,
      check.resolvedModel,
      check.detail.replace(/\s+/g, " ").slice(0, 240),
      check.checkedAt,
    ).run();
}

export async function touchUser(db: D1Database, user: { email: string; name: string }) {
  const now = Date.now();
  await db.prepare(`INSERT INTO users (email, display_name, plan, created_at, last_seen_at)
    VALUES (?, ?, 'free', ?, ?)
    ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name, last_seen_at = excluded.last_seen_at`)
    .bind(user.email, user.name, now, now).run();
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

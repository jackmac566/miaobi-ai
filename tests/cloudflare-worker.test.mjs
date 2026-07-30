import assert from "node:assert/strict";
import test from "node:test";

import worker from "../cloudflare/public/_worker.js";

class MemoryStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql.replace(/\s+/g, " ").trim();
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async first() {
    const [first] = this.args;
    if (/^SELECT COUNT\(\*\)(?: AS)? total FROM generations WHERE created_at >=/.test(this.sql)) {
      return { total: this.db.generations.length };
    }
    if (this.sql.startsWith("SELECT COUNT(*) total FROM users WHERE plan != 'free'")) {
      const now = Number(this.args[0] || Date.now());
      return { total: [...this.db.users.values()].filter(user => user.plan !== "free" && Number(user.plan_expires_at || 0) > now).length };
    }
    if (this.sql === "SELECT COUNT(*) total FROM users") return { total: this.db.users.size };
    if (this.sql.startsWith("SELECT COUNT(*) total FROM generations WHERE created_at >=")) {
      return { total: this.db.generations.length };
    }
    if (this.sql.startsWith("SELECT COALESCE(SUM(prompt_tokens), 0) prompt_tokens")) {
      return {
        prompt_tokens: this.db.generations.reduce((total, item) => total + Number(item.prompt_tokens || 0), 0),
        completion_tokens: this.db.generations.reduce((total, item) => total + Number(item.completion_tokens || 0), 0),
      };
    }
    if (this.sql.startsWith("SELECT COALESCE(SUM(amount_fen), 0) total_fen FROM orders")) {
      return {
        total_fen: [...this.db.orders.values()]
          .filter(order => order.status === "paid")
          .reduce((total, order) => total + Number(order.amount_fen || 0), 0),
      };
    }
    if (this.sql.startsWith("SELECT failures, window_started_at, blocked_until FROM auth_rate_limits")) {
      return this.db.authRates.get(first) || null;
    }
    if (this.sql.startsWith("SELECT used, window_started_at FROM usage_windows")) return this.db.usage.get(first) || null;
    if (this.sql.startsWith("UPDATE usage_windows SET used = used + 1")) {
      const [now, key, threshold, limit] = this.args;
      const current = this.db.usage.get(key);
      if (!current || current.window_started_at <= threshold || current.used >= limit) return null;
      const next = { ...current, used: current.used + 1, updated_at: now };
      this.db.usage.set(key, next);
      return { used: next.used, window_started_at: next.window_started_at };
    }
    if (this.sql.startsWith("UPDATE usage_windows SET used = 1")) {
      const [windowStartedAt, updatedAt, key, threshold] = this.args;
      const current = this.db.usage.get(key);
      if (!current || current.window_started_at > threshold) return null;
      this.db.usage.set(key, { used: 1, window_started_at: windowStartedAt, updated_at: updatedAt });
      return { used: 1 };
    }
    if (this.sql.startsWith("INSERT INTO usage_windows")) {
      const [key, windowStartedAt, updatedAt] = this.args;
      if (this.db.usage.has(key)) throw new Error("UNIQUE constraint");
      this.db.usage.set(key, { used: 1, window_started_at: windowStartedAt, updated_at: updatedAt });
      return { used: 1 };
    }
    if (this.sql.startsWith("SELECT plan, plan_expires_at FROM users")) {
      const user = this.db.users.get(first);
      return user ? { plan: user.plan, plan_expires_at: user.plan_expires_at } : null;
    }
    if (this.sql.startsWith("SELECT email FROM local_credentials")) {
      return this.db.credentials.has(first) ? { email: first } : null;
    }
    if (this.sql.startsWith("SELECT password_hash, salt FROM local_credentials")) {
      return this.db.credentials.get(first) || null;
    }
    if (this.sql.startsWith("SELECT email FROM users")) {
      return this.db.users.has(first) ? { email: first } : null;
    }
    if (this.sql.startsWith("SELECT user_email, product, status FROM orders")) {
      const order = this.db.orders.get(first);
      return order ? { user_email: order.user_email, product: order.product, status: order.status } : null;
    }
    throw new Error(`Unhandled first(): ${this.sql}`);
  }

  async all() {
    if (this.sql.startsWith("SELECT email, display_name, plan")) return { results: [...this.db.users.values()] };
    if (this.sql.startsWith("SELECT id, user_email, product")) return { results: [...this.db.orders.values()] };
    if (this.sql.startsWith("SELECT actor_email, action, target")) return { results: this.db.audit };
    return { results: [] };
  }

  async run() {
    const a = this.args;
    if (this.sql.startsWith("CREATE TABLE") || this.sql.startsWith("CREATE INDEX")) return { success: true };
    if (this.sql.startsWith("INSERT INTO local_credentials")) {
      this.db.credentials.set(a[0], { password_hash: a[1], salt: a[2] });
      return { success: true };
    }
    if (this.sql.startsWith("INSERT INTO users") && this.sql.includes("'free'")) {
      const current = this.db.users.get(a[0]);
      this.db.users.set(a[0], current || {
        email: a[0],
        display_name: a[1],
        plan: "free",
        plan_expires_at: null,
        created_at: a[2],
        last_seen_at: a[3],
      });
      return { success: true };
    }
    if (this.sql.startsWith("INSERT INTO users") && this.sql.includes("ON CONFLICT(email) DO UPDATE SET plan")) {
      const current = this.db.users.get(a[0]);
      const expires = current?.plan_expires_at > a[6] ? current.plan_expires_at + a[7] : a[3];
      this.db.users.set(a[0], {
        email: a[0],
        display_name: a[1],
        plan: a[2],
        plan_expires_at: expires,
        created_at: current?.created_at || a[4],
        last_seen_at: current?.last_seen_at || a[5],
      });
      return { success: true };
    }
    if (this.sql.startsWith("INSERT INTO orders")) {
      if (this.db.orders.has(a[0])) throw new Error("UNIQUE constraint");
      this.db.orders.set(a[0], {
        id: a[0],
        user_email: a[1],
        product: a[2],
        amount_fen: a[3],
        status: a[4],
      });
      return { success: true };
    }
    if (this.sql.startsWith("INSERT INTO admin_audit")) {
      this.db.audit.push({
        id: a[0],
        actor_email: a[1],
        action: a[2],
        target: a[3],
        detail: a[4],
        created_at: a[5],
      });
      return { success: true };
    }
    if (this.sql.startsWith("INSERT INTO auth_rate_limits")) {
      const [key, failures, windowStartedAt, blockedUntil, updatedAt] = a;
      this.db.authRates.set(key, {
        failures,
        window_started_at: windowStartedAt,
        blocked_until: blockedUntil,
        updated_at: updatedAt,
      });
      return { success: true };
    }
    if (this.sql.startsWith("DELETE FROM auth_rate_limits")) {
      this.db.authRates.delete(a[0]);
      return { success: true };
    }
    if (this.sql.startsWith("INSERT INTO generations")) {
      this.db.generations.push({
        id: a[0],
        user_email: a[1],
        scene: a[2],
        topic: a[3],
        style: a[4],
        result_json: a[5],
        model: a[6],
        prompt_tokens: a[7],
        completion_tokens: a[8],
        created_at: a[9],
      });
      return { success: true };
    }
    if (this.sql.startsWith("UPDATE usage_windows SET used = MAX")) {
      const [, key] = a;
      const current = this.db.usage.get(key);
      if (current) this.db.usage.set(key, { ...current, used: Math.max(0, current.used - 1) });
      return { success: true };
    }
    if (this.sql.startsWith("UPDATE users SET plan = 'free'")) {
      const current = this.db.users.get(a[0]);
      if (current) this.db.users.set(a[0], { ...current, plan: "free", plan_expires_at: null });
      return { success: true };
    }
    if (this.sql.startsWith("UPDATE orders SET status = 'refunded'")) {
      const order = this.db.orders.get(a[0]);
      if (order?.status === "paid") this.db.orders.set(a[0], { ...order, status: "refunded" });
      return { success: true };
    }
    if (this.sql.startsWith("UPDATE users SET last_seen_at")) return { success: true };
    throw new Error(`Unhandled run(): ${this.sql}`);
  }
}

class MemoryD1 {
  constructor() {
    this.users = new Map();
    this.credentials = new Map();
    this.usage = new Map();
    this.orders = new Map();
    this.generations = [];
    this.authRates = new Map();
    this.audit = [];
  }

  prepare(sql) {
    return new MemoryStatement(this, sql);
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";")[0] || "";
}

function post(path, body, cookie = "") {
  return new Request(`https://miaobi.example${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://miaobi.example",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("Cloudflare login and membership grant form a real database-backed loop", async () => {
  const DB = new MemoryD1();
  const env = {
    DB,
    ASSETS: { fetch: async () => new Response("asset") },
    ADMIN_EMAIL: "owner@example.com",
    ADMIN_PASSWORD: "LocalTestPass123",
    SESSION_SECRET: "integration-session-secret",
    DEEPSEEK_API_KEY: "configured-only-for-status",
    DEEPSEEK_MODEL: "deepseek-v4-flash",
  };

  const registered = await worker.fetch(post("/api/auth/register", {
    email: "member@example.com",
    password: "MemberPass123",
  }), env);
  assert.equal(registered.status, 200);
  const userCookie = cookieFrom(registered);
  assert.match(userCookie, /^miaobi_session=/);

  const adminLogin = await worker.fetch(post("/api/auth/login", {
    email: "owner@example.com",
    password: "LocalTestPass123",
  }), env);
  assert.equal(adminLogin.status, 200);
  const adminCookie = cookieFrom(adminLogin);

  const granted = await worker.fetch(post("/api/admin/members", {
    action: "grant",
    email: "member@example.com",
    plan: "monthly",
    days: 30,
    paymentMethod: "wechat",
    amountFen: 1990,
    requestId: "grant-test-001",
  }, adminCookie), env);
  assert.equal(granted.status, 200);
  const grantPayload = await granted.json();
  assert.equal(grantPayload.membershipActive, true);
  assert.ok(grantPayload.planExpiresAt > Date.now());

  const account = await worker.fetch(new Request("https://miaobi.example/api/account", {
    headers: { Cookie: userCookie },
  }), env);
  const accountPayload = await account.json();
  assert.equal(accountPayload.signedIn, true);
  assert.equal(accountPayload.isMember, true);
  assert.equal(accountPayload.remaining, 100);

  const refunded = await worker.fetch(post("/api/admin/members", {
    action: "refund",
    email: "member@example.com",
    orderId: grantPayload.orderId,
  }, adminCookie), env);
  assert.equal(refunded.status, 200);
  assert.equal(DB.orders.get(grantPayload.orderId).status, "refunded");

  const revoked = await worker.fetch(post("/api/admin/members", {
    action: "revoke",
    email: "member@example.com",
  }, adminCookie), env);
  assert.equal(revoked.status, 200);
  assert.equal((await revoked.json()).membershipActive, false);

  const afterRevoke = await worker.fetch(new Request("https://miaobi.example/api/account", {
    headers: { Cookie: userCookie },
  }), env);
  const afterPayload = await afterRevoke.json();
  assert.equal(afterPayload.isMember, false);
  assert.equal(afterPayload.remaining, 10);
});

test("domestic operations overview reports cost, quota, revenue and conversion from D1", async () => {
  const DB = new MemoryD1();
  const now = Date.now();
  DB.users.set("member@example.com", {
    email: "member@example.com",
    display_name: "member",
    plan: "monthly",
    plan_expires_at: now + 86_400_000,
    last_seen_at: now,
  });
  DB.users.set("free@example.com", {
    email: "free@example.com",
    display_name: "free",
    plan: "free",
    plan_expires_at: null,
    last_seen_at: now,
  });
  DB.generations.push({ model: "deepseek-v4-flash", prompt_tokens: 120, completion_tokens: 40, created_at: now });
  DB.orders.set("paid-1", {
    id: "paid-1",
    user_email: "member@example.com",
    product: "monthly",
    amount_fen: 1990,
    status: "paid",
    provider_trade_no: "manual_wechat",
    created_at: now,
    paid_at: now,
  });
  const env = {
    DB,
    ASSETS: { fetch: async () => new Response("asset") },
    ADMIN_EMAIL: "owner@example.com",
    ADMIN_PASSWORD: "LocalTestPass123",
    SESSION_SECRET: "integration-session-secret",
    DEEPSEEK_API_KEY: "test-server-side-key",
    DEEPSEEK_MODEL: "deepseek-v4-flash",
    AI_SITE_DAILY_LIMIT: "500",
  };

  const adminLogin = await worker.fetch(post("/api/auth/login", {
    email: "owner@example.com",
    password: "LocalTestPass123",
  }), env);
  const overview = await worker.fetch(new Request("https://miaobi.example/api/admin/overview", {
    headers: { Cookie: cookieFrom(adminLogin) },
  }), env);
  assert.equal(overview.status, 200);
  const payload = await overview.json();
  assert.deepEqual(payload.cards, {
    users: 2,
    activeMembers: 1,
    rollingGenerations: 1,
    siteRemaining: 499,
    promptTokens: 120,
    completionTokens: 40,
    revenueFen: 1990,
    memberConversion: 50,
  });
  assert.equal(payload.systems.siteLimit, 500);
});

test("protected deployment check requires its secret and proves a non-empty DeepSeek response", async t => {
  const DB = new MemoryD1();
  const env = {
    DB,
    ASSETS: { fetch: async () => new Response("asset") },
    ADMIN_EMAIL: "owner@example.com",
    ADMIN_PASSWORD: "LocalTestPass123",
    SESSION_SECRET: "integration-session-secret",
    DEPLOY_CHECK_SECRET: "deployment-check-secret",
    DEEPSEEK_API_KEY: "test-server-side-key",
    DEEPSEEK_MODEL: "deepseek-v4-flash",
  };

  const hidden = await worker.fetch(new Request("https://miaobi.example/api/deploy-check", { method: "POST" }), env);
  assert.equal(hidden.status, 404);

  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(String(url), "https://api.deepseek.com/chat/completions");
    assert.equal(init.headers.Authorization, "Bearer test-server-side-key");
    const upstream = JSON.parse(init.body);
    assert.deepEqual(upstream.thinking, { type: "disabled" });
    assert.equal(upstream.max_tokens, 128);
    return new Response(JSON.stringify({
      model: "deepseek-v4-flash",
      choices: [{ message: { content: "妙笔AI接口正常" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const checked = await worker.fetch(new Request("https://miaobi.example/api/deploy-check", {
    method: "POST",
    headers: { "X-Miaobi-Deploy-Check": "deployment-check-secret" },
  }), env);
  assert.equal(checked.status, 200);
  assert.deepEqual(await checked.json(), {
    ok: true,
    model: "deepseek-v4-flash",
    contentReceived: true,
  });
});

test("domestic generation sends and reports the exact selected writing controls", async t => {
  const DB = new MemoryD1();
  const env = {
    DB,
    ASSETS: { fetch: async () => new Response("asset") },
    ADMIN_EMAIL: "owner@example.com",
    ADMIN_PASSWORD: "LocalTestPass123",
    SESSION_SECRET: "integration-session-secret",
    DEEPSEEK_API_KEY: "test-server-side-key",
    DEEPSEEK_MODEL: "deepseek-v4-flash",
  };

  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(String(url), "https://api.deepseek.com/chat/completions");
    assert.equal(init.headers.Authorization, "Bearer test-server-side-key");
    const upstream = JSON.parse(init.body);
    assert.equal(upstream.temperature, 0.15);
    assert.deepEqual(upstream.thinking, { type: "disabled" });
    assert.deepEqual(upstream.response_format, { type: "json_object" });
    const prompt = upstream.messages[1].content;
    assert.match(prompt, /风格：高级感/);
    assert.match(prompt, /风格执行规则：用词准确克制/);
    assert.match(prompt, /输出偏好：重新组织结构/);
    assert.match(prompt, /输出偏好执行规则：可调整段落顺序/);
    assert.match(prompt, /处理强度：深度/);
    assert.match(prompt, /允许重排段落/);
    return new Response(JSON.stringify({
      model: "deepseek-v4-flash",
      choices: [{ message: { content: '["这是按选项真实处理后的正文。"]' } }],
      usage: { prompt_tokens: 80, completion_tokens: 20 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const generated = await worker.fetch(post("/api/generate", {
    tool: "内容改写",
    topic: "原文需要调整结构，但所有事实必须保留。",
    style: "高级感",
    preference: "重新组织结构",
    intensity: "深度",
  }), env);

  assert.equal(generated.status, 200);
  const payload = await generated.json();
  assert.deepEqual(payload.appliedControls, {
    style: "高级感",
    preference: "重新组织结构",
    intensity: "深度",
    length: "标准 · 150—300字",
  });
  assert.equal(payload.engineLabel, "DeepSeek · deepseek-v4-flash");
  assert.equal(DB.generations.length, 1);
  assert.equal(DB.generations[0].style, "高级感");
});

test("domestic generation rejects a fluent but unsupported registration inference", async t => {
  const DB = new MemoryD1();
  const env = {
    DB,
    ASSETS: { fetch: async () => new Response("asset") },
    ADMIN_EMAIL: "owner@example.com",
    ADMIN_PASSWORD: "LocalTestPass123",
    SESSION_SECRET: "integration-session-secret",
    DEEPSEEK_API_KEY: "test-server-side-key",
    DEEPSEEK_MODEL: "deepseek-v4-flash",
  };

  let requests = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests += 1;
    if (requests === 2) {
      const retry = JSON.parse(init.body);
      assert.match(retry.messages[1].content, /无依据推断：不用提前做什么/);
      assert.match(retry.messages[1].content, /原文中的绝对日期、时间、数字、地点和专有名词保持原样/);
      assert.equal(retry.temperature, 0);
    }
    return new Response(JSON.stringify({
      model: "deepseek-v4-flash",
      choices: [{ message: { content: '["不用提前做什么，这个月30号到了直接登记就行，这样更轻松。"]' } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const generated = await worker.fetch(post("/api/generate", {
    tool: "内容改写",
    topic: "7月30日到场，现场登记即可。",
    preference: "重新组织结构",
    intensity: "深度",
  }), env);

  assert.equal(generated.status, 422);
  assert.equal((await generated.json()).code, "QUALITY_REJECTED");
  assert.equal(requests, 2);
  assert.equal(DB.generations.length, 0);
  assert.equal([...DB.usage.values()][0].used, 0);
});

test("domestic generation uses exact quality findings to recover a faithful rewrite", async t => {
  const DB = new MemoryD1();
  const env = {
    DB,
    ASSETS: { fetch: async () => new Response("asset") },
    ADMIN_EMAIL: "owner@example.com",
    ADMIN_PASSWORD: "LocalTestPass123",
    SESSION_SECRET: "integration-session-secret",
    DEEPSEEK_API_KEY: "test-server-side-key",
    DEEPSEEK_MODEL: "deepseek-v4-flash",
  };

  let requests = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests += 1;
    const upstream = JSON.parse(init.body);
    if (requests === 1) {
      return new Response(JSON.stringify({
        model: "deepseek-v4-flash",
        choices: [{ message: { content: '["这个月30号到了现场直接登记，不用提前准备，这样更轻松。"]' } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    assert.match(upstream.messages[1].content, /检测到的具体问题/);
    assert.match(upstream.messages[1].content, /这个月/);
    return new Response(JSON.stringify({
      model: "deepseek-v4-flash",
      choices: [{ message: { content: '["社区读书会定在7月30日晚上7点，地点是社区活动室。请提前10分钟到场，现场登记即可。"]' } }],
      usage: { prompt_tokens: 120, completion_tokens: 35 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const generated = await worker.fetch(post("/api/generate", {
    tool: "内容改写",
    topic: "社区读书会定在7月30日晚上7点，地点是社区活动室。请大家提前10分钟到场，现场登记即可。",
    preference: "重新组织结构",
    intensity: "深度",
  }), env);

  assert.equal(generated.status, 200);
  const payload = await generated.json();
  assert.equal(requests, 2);
  assert.deepEqual(payload.results, [
    "社区读书会定在7月30日晚上7点，地点是社区活动室。请提前10分钟到场，现场登记即可。",
  ]);
  assert.equal(DB.generations.length, 1);
  assert.equal([...DB.usage.values()][0].used, 1);
});

test("domestic admin login is rate limited after repeated failures", async () => {
  const DB = new MemoryD1();
  const env = {
    DB,
    ASSETS: { fetch: async () => new Response("asset") },
    ADMIN_EMAIL: "owner@example.com",
    ADMIN_PASSWORD: "LocalTestPass123",
    SESSION_SECRET: "integration-session-secret",
    DEEPSEEK_API_KEY: "test-server-side-key",
    DEEPSEEK_MODEL: "deepseek-v4-flash",
  };

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const response = await worker.fetch(post("/api/auth/login", {
      email: "owner@example.com",
      password: "WrongPassword123",
    }), env);
    assert.equal(response.status, 401, `attempt ${attempt}`);
  }

  const blocked = await worker.fetch(post("/api/auth/login", {
    email: "owner@example.com",
    password: "LocalTestPass123",
  }), env);
  assert.equal(blocked.status, 429);
  assert.match((await blocked.json()).error, /登录尝试过多/);
});

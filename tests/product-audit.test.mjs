import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PRODUCT_COUNTS, PRODUCT_MODULES } from "../lib/product-contract.ts";
import { projectNameFromListItem, secretNamesFromList } from "../scripts/deploy-cloudflare-pages.mjs";

const source = path => readFile(new URL(path, import.meta.url), "utf8");

test("Cloudflare project discovery accepts Wrangler's real JSON field names", () => {
  assert.equal(projectNameFromListItem({ "Project Name": "miaobi-ai" }), "miaobi-ai");
  assert.equal(projectNameFromListItem({ name: "modern-shape" }), "modern-shape");
  assert.equal(projectNameFromListItem({ project_name: "legacy-shape" }), "legacy-shape");
  assert.equal(projectNameFromListItem(null), "");
});

test("Cloudflare updates preserve persistent secrets and can read common list shapes", () => {
  assert.deepEqual(
    [...secretNamesFromList([{ name: "DEEPSEEK_API_KEY" }, { key: "SESSION_SECRET" }])],
    ["DEEPSEEK_API_KEY", "SESSION_SECRET"],
  );
  assert.ok(secretNamesFromList(null, "│ ADMIN_PASSWORD │ encrypted │").has("ADMIN_PASSWORD"));
});

test("new database indexes are safe when runtime-created indexes already exist", async () => {
  const migration = await source("../drizzle/0006_known_night_nurse.sql");
  const indexStatements = migration.match(/CREATE INDEX[^;]+;/g) || [];
  assert.equal(indexStatements.length, 7);
  assert.ok(indexStatements.every(statement => statement.startsWith("CREATE INDEX IF NOT EXISTS")));
});

test("the product contract matches every public scene and text tool", async () => {
  const page = await source("../app/page.tsx");
  const sceneBlock = page.slice(page.indexOf("const scenes:"), page.indexOf("const tools ="));
  const toolBlock = page.slice(page.indexOf("const tools ="), page.indexOf("type Inspiration"));
  assert.equal((sceneBlock.match(/^\s*\{ id:/gm) || []).length, PRODUCT_COUNTS.writingScenes);
  assert.equal((toolBlock.match(/^\s*\[/gm) || []).length, PRODUCT_COUNTS.textTools);
  assert.equal(PRODUCT_MODULES.length, 10);
});

test("formal site exposes clear user and owner login entries", async () => {
  const [page, adminPage, auth, accountRoute, css] = await Promise.all([
    source("../app/page.tsx"),
    source("../app/admin/page.tsx"),
    source("../app/chatgpt-auth.ts"),
    source("../app/api/account/route.ts"),
    source("../app/globals.css"),
  ]);
  assert.match(page, /className="top-signin"/);
  assert.match(page, /className="mobile-account-entry"/);
  assert.match(page, /登录 \/ 注册/);
  assert.match(page, /当前风格会真实执行/);
  assert.match(page, /轻度 \/ 标准 \/ 深度/);
  assert.match(page, /htmlFor="tool-preference"/);
  assert.match(page, /aria-pressed=\{intensity===item\}/);
  assert.match(page, /className="inline-error"/);
  assert.match(page, /role="alert"/);
  assert.match(page, /本次未生成/);
  assert.match(page, />站长登录</);
  assert.match(page, /className="top-admin"/);
  assert.match(adminPage, /requireChatGPTUser\("\/admin"\)/);
  assert.match(adminPage, /hasAdminAccess/);
  assert.match(auth, /\/signin-with-chatgpt/);
  assert.match(accountRoute, /if \(!user\)/);
  assert.match(accountRoute, /signedIn: false/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.mobile-dock\{[\s\S]*?display:grid/);
  assert.match(css, /backdrop-filter:blur\(30px\) saturate\(210%\)/);
});

test("formal DeepSeek route reports the exact controls that it sends into the writing prompt", async () => {
  const route = await source("../app/api/generate/route.ts");
  assert.match(route, /appliedControlSummary/);
  assert.match(route, /preference: appliedControls\.preference \|\| undefined/);
  assert.match(route, /intensity: appliedControls\.intensity \|\| undefined/);
  assert.match(route, /temperature: body\?\.tool \? 0\.15 : 0\.65/);
  assert.match(route, /candidateViolations/);
  assert.match(route, /检测到的具体问题/);
  assert.match(route, /appliedControls: \{/);
  assert.equal((route.match(/intensity: appliedControls\.intensity \|\| undefined/g) || []).length, 1);
});

test("admin console covers DeepSeek, live acceptance, operations and audit history", async () => {
  const [dashboard, health, metrics] = await Promise.all([
    source("../app/admin/admin-dashboard.tsx"),
    source("../app/api/admin/health/route.ts"),
    source("../app/api/admin/metrics/route.ts"),
  ]);
  assert.match(dashboard, />系统验收</);
  assert.match(dashboard, /重新运行验收/);
  assert.match(dashboard, /运营提醒/);
  assert.match(dashboard, /最近后台操作/);
  assert.match(health, /getAISettingsForProvider\(config, "deepseek"\)/);
  assert.doesNotMatch(health, /generateAPPL/);
  assert.match(health, /databaseTables/);
  assert.match(health, /不会向外部模型发送付费请求/);
  assert.match(metrics, /SELECT actor_email, action, target, created_at FROM admin_audit/);
  assert.match(metrics, /activeMembers/);
  assert.match(metrics, /secureStorageReady/);
});

test("Cloudflare domestic build contains login, D1 and server-side DeepSeek", async () => {
  const [page, deploy, worker, accountUi, domesticEntry] = await Promise.all([
    source("../app/page.tsx"),
    source("../scripts/deploy-cloudflare-pages.mjs"),
    source("../cloudflare/public/_worker.js"),
    source("../cloudflare/src/domestic-account.tsx"),
    source("../cloudflare/src/main.tsx"),
  ]);
  assert.match(page, /className="top-signin"/);
  assert.match(page, /className="mobile-account-entry"/);
  assert.match(page, /preference: toolPreference/);
  assert.match(deploy, /V1\.5\.0/);
  assert.match(deploy, /const DEFAULT_PROJECT = "miaobi-ai"/);
  assert.match(deploy, /8000002/);
  assert.match(deploy, /DEEPSEEK_API_KEY/);
  assert.match(deploy, /DEPLOY_CHECK_SECRET/);
  assert.match(deploy, /paymentDisabled/);
  assert.match(deploy, /paymentDisabled \|\| paymentMethodsReady/);
  assert.match(deploy, /保留现有 SESSION_SECRET/);
  assert.match(deploy, /--rotate-credentials/);
  assert.match(worker, /usage_windows/);
  assert.match(worker, /DeepSeek/);
  assert.match(worker, /contentReceived/);
  assert.match(worker, /appliedControls/);
  assert.match(worker, /风格执行规则/);
  assert.doesNotMatch(worker, /generateAPPL|APPL/);
  assert.match(accountUi, /注册并登录/);
  assert.match(accountUi, /写入用户权益和人工订单后会立即读回/);
  assert.match(domesticEntry, /import\("\.\.\/\.\.\/app\/page"\)/);
  assert.match(domesticEntry, /import "\.\.\/\.\.\/app\/globals\.css"/);
});

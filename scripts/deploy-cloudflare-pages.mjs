import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const RELEASE_VERSION = "V1.5.0";
const WRANGLER_VERSION = "4.92.0";
const DEFAULT_PROJECT = "miaobi-ai";
const DATABASE_NAME = process.env.CLOUDFLARE_D1_DATABASE?.trim() || "miaobi-ai-db";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cloudflareRoot = path.join(projectRoot, "cloudflare");
const dist = path.join(cloudflareRoot, "dist");
const output = path.join(projectRoot, "cloudflare-deploy-output");
const projectFile = path.join(output, "project-name.txt");
const reportFile = path.join(output, "上线验收报告.json");
const configFile = path.join(cloudflareRoot, "wrangler.jsonc");
const schemaFile = path.join(cloudflareRoot, "schema.sql");
const skipBuild = process.argv.includes("--skip-build");
const prepareOnly = process.argv.includes("--prepare-only");
const rotateCredentials = process.argv.includes("--rotate-credentials");
const PERSISTENT_SECRET_NAMES = ["DEEPSEEK_API_KEY", "ADMIN_PASSWORD", "SESSION_SECRET"];

function assertRuntime() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (!Number.isInteger(major) || major < 22 || (major === 22 && minor < 13)) {
    throw new Error("需要 Node.js 22.13 或更高版本。");
  }
}

function run(args, { capture = false, input, cwd = projectRoot } = {}) {
  const result = spawnSync("npx", ["--yes", `wrangler@${WRANGLER_VERSION}`, ...args], {
    cwd,
    env: {
      ...process.env,
      NPM_CONFIG_CACHE: path.join(output, ".npm-cache"),
      npm_config_cache: path.join(output, ".npm-cache"),
      WRANGLER_LOG_PATH: path.join(output, "wrangler.log"),
    },
    input,
    encoding: "utf8",
    stdio: capture ? ["pipe", "pipe", "pipe"] : input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
  });
  if (!capture && result.status !== 0) throw new Error(`Wrangler 执行失败（退出码 ${result.status ?? "未知"}）`);
  return { ok: result.status === 0, stdout: result.stdout || "", stderr: result.stderr || "", status: result.status };
}

function parseJsonOutput(result) {
  if (!result.ok) return null;
  const text = result.stdout.trim();
  for (const [start, end] of [["[", "]"], ["{", "}"]]) {
    const from = text.indexOf(start);
    const to = text.lastIndexOf(end);
    if (from < 0 || to < from) continue;
    try { return JSON.parse(text.slice(from, to + 1)); } catch { /* try next shape */ }
  }
  return null;
}

function printResult(result) {
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}

export function projectNameFromListItem(item) {
  if (!item || typeof item !== "object") return "";
  return String(
    item.name
    || item.project_name
    || item.projectName
    || item["Project Name"]
    || "",
  ).trim();
}

export function secretNamesFromList(value, rawOutput = "") {
  const entries = Array.isArray(value)
    ? value
    : Array.isArray(value?.secrets)
      ? value.secrets
      : Array.isArray(value?.result)
        ? value.result
        : [];
  const names = new Set(entries.map(item => String(
    typeof item === "string" ? item : item?.name || item?.key || item?.["Secret Name"] || "",
  ).trim()).filter(Boolean));
  for (const name of [...PERSISTENT_SECRET_NAMES, "DEPLOY_CHECK_SECRET"]) {
    if (new RegExp(`(?:^|\\W)${name}(?:\\W|$)`).test(rawOutput)) names.add(name);
  }
  return names;
}

async function artifactDigest(directory) {
  const hash = createHash("sha256");
  async function visit(current) {
    const entries = (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        hash.update(path.relative(directory, absolute).split(path.sep).join("/"));
        hash.update(await readFile(absolute));
      }
    }
  }
  await visit(directory);
  return hash.digest("hex");
}

async function chooseProject(projects) {
  const saved = await readFile(projectFile, "utf8").then(value => value.trim()).catch(() => "");
  const preferred = process.env.CLOUDFLARE_PAGES_PROJECT?.trim() || saved || DEFAULT_PROJECT;
  const names = projects.map(projectNameFromListItem).filter(Boolean);
  if (names.includes(preferred)) return preferred;
  if (names.includes(DEFAULT_PROJECT)) return DEFAULT_PROJECT;
  const miaobiProjects = names.filter(name => /^miaobi[-_]/i.test(name));
  if (miaobiProjects.length === 1) return miaobiProjects[0];
  return preferred;
}

async function ensureProject() {
  const listed = run(["pages", "project", "list", "--json"], { capture: true });
  const projects = parseJsonOutput(listed);
  if (!Array.isArray(projects)) {
    printResult(listed);
    throw new Error("无法读取当前账号的 Pages 项目列表，请确认 Cloudflare 登录账号");
  }
  const name = await chooseProject(projects);
  const names = projects.map(projectNameFromListItem).filter(Boolean);
  if (!names.includes(name)) {
    const created = run(["pages", "project", "create", name, "--production-branch", "main"], { capture: true });
    if (!created.ok) {
      printResult(created);
      if (/already exists|8000002/i.test(`${created.stdout}\n${created.stderr}`)) {
        throw new Error(`项目 ${name} 在其他账号或当前列表不可见；请退出后登录创建该项目的 Cloudflare 账号`);
      }
      throw new Error(`无法创建 Pages 项目 ${name}`);
    }
  }
  await writeFile(projectFile, `${name}\n`);
  return name;
}

async function ensureDatabase() {
  const listed = run(["d1", "list", "--json"], { capture: true });
  let databases = parseJsonOutput(listed);
  if (!Array.isArray(databases)) {
    printResult(listed);
    throw new Error("无法读取 D1 数据库列表");
  }
  let database = databases.find(item => item.name === DATABASE_NAME);
  if (!database) {
    console.log(`正在创建亚洲区域 D1 数据库 ${DATABASE_NAME}…`);
    const created = run(["d1", "create", DATABASE_NAME, "--location", "apac"], { capture: true });
    if (!created.ok) {
      printResult(created);
      throw new Error("D1 数据库创建失败");
    }
    const refreshed = run(["d1", "list", "--json"], { capture: true });
    databases = parseJsonOutput(refreshed);
    database = Array.isArray(databases) ? databases.find(item => item.name === DATABASE_NAME) : null;
  }
  const databaseId = database?.uuid || database?.id;
  if (!databaseId) throw new Error("D1 已创建但无法读取数据库 ID");
  return { databaseId, databaseName: database.name };
}

async function askAdminEmail() {
  const configured = process.env.MIAOBI_ADMIN_EMAIL?.trim();
  if (configured) return configured.toLowerCase();
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await terminal.question("请输入主管理员登录邮箱：")).trim();
  terminal.close();
  const email = answer.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("主管理员邮箱格式不正确");
  return email;
}

async function writeWranglerConfig(projectName, database, adminEmail) {
  await writeFile(configFile, `${JSON.stringify({
    $schema: "../node_modules/wrangler/config-schema.json",
    name: projectName,
    pages_build_output_dir: "./dist",
    compatibility_date: "2026-07-29",
    d1_databases: [{
      binding: "DB",
      database_name: database.databaseName,
      database_id: database.databaseId,
    }],
    vars: {
      ADMIN_EMAIL: adminEmail,
      DEEPSEEK_MODEL: "deepseek-v4-flash",
      RELEASE_VERSION,
    },
  }, null, 2)}\n`);
}

function putInteractiveSecret(projectName, key, explanation) {
  console.log(`\n${explanation}`);
  console.log("Wrangler 会隐藏你输入的内容；请勿把密钥或密码粘贴到聊天。");
  run(["pages", "secret", "put", key, "--project-name", projectName], { cwd: cloudflareRoot });
}

function putGeneratedSecret(projectName, key) {
  const value = randomBytes(48).toString("base64url");
  run(["pages", "secret", "put", key, "--project-name", projectName], {
    cwd: cloudflareRoot,
    input: `${value}\n`,
  });
  return value;
}

function listExistingSecrets(projectName) {
  const listed = run(["pages", "secret", "list", "--project-name", projectName], {
    capture: true,
    cwd: cloudflareRoot,
  });
  if (!listed.ok) {
    printResult(listed);
    throw new Error("无法读取现有服务端密钥列表；为避免误覆盖，部署已停止");
  }
  return secretNamesFromList(parseJsonOutput(listed), `${listed.stdout}\n${listed.stderr}`);
}

async function waitForPage(url, deployCheckSecret) {
  let detail = "";
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const checkUrl = new URL(url);
      checkUrl.searchParams.set("miaobi_release_check", `${RELEASE_VERSION}-${Date.now()}`);
      const [pageResponse, paymentResponse, healthResponse, deepSeekResponse] = await Promise.all([
        fetch(checkUrl, { redirect: "follow", cache: "no-store" }),
        fetch(new URL("/payment-config.js", url), { redirect: "follow", cache: "no-store" }),
        fetch(new URL("/api/health", url), { redirect: "follow", cache: "no-store" }),
        fetch(new URL("/api/deploy-check", url), {
          method: "POST",
          headers: { "X-Miaobi-Deploy-Check": deployCheckSecret },
          redirect: "follow",
          cache: "no-store",
        }),
      ]);
      const [html, paymentConfig, health, deepSeek] = await Promise.all([
        pageResponse.text(),
        paymentResponse.text(),
        healthResponse.json().catch(() => null),
        deepSeekResponse.json().catch(() => null),
      ]);
      const bundlePaths = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js(?:\?[^"']*)?)["']/gi)].map(match => match[1]);
      const bundleTexts = await Promise.all(bundlePaths.map(async source => {
        const response = await fetch(new URL(source, url), { redirect: "follow", cache: "no-store" });
        return response.ok ? response.text() : "";
      }));
      const pageReady = pageResponse.ok && html.includes("妙笔AI") && html.includes("DeepSeek") && html.includes("payment-config.js");
      const paymentDisabled = /enabled\s*:\s*false/.test(paymentConfig);
      const paymentMethodsReady = paymentConfig.includes("wechat") && paymentConfig.includes("alipay");
      const paymentReady = paymentResponse.ok && (paymentDisabled || paymentMethodsReady);
      const bundleReady = bundleTexts.some(bundle => bundle.includes(RELEASE_VERSION) && bundle.includes("每 24 小时 10 次"));
      const backendReady = healthResponse.ok && health?.release === RELEASE_VERSION && health?.database === true;
      const deepSeekReady = deepSeekResponse.ok && deepSeek?.ok === true && deepSeek?.contentReceived === true;
      if (pageReady && paymentReady && bundleReady && backendReady && deepSeekReady) {
        return {
          verified: true,
          status: pageResponse.status,
          checks: [`${RELEASE_VERSION} 页面脚本`, "DeepSeek 真实非空响应", "D1 数据库", "手机登录入口", paymentDisabled ? "人工收款已安全关闭" : "微信/支付宝收款配置"],
          deepSeekConfigured: Boolean(health.deepSeekConfigured),
          deepSeekOperational: true,
          resolvedModel: deepSeek.model || health.model,
        };
      }
      detail = deepSeekResponse.status >= 500
        ? `页面已上传，但 DeepSeek 真实请求未通过：${deepSeek?.error || `HTTP ${deepSeekResponse.status}`}`
        : `页面 ${pageResponse.status}、后端 ${healthResponse.status}、版本脚本 ${bundleReady ? "已读取" : "未读取"}、DeepSeek ${deepSeekResponse.status}`;
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
    }
    process.stdout.write(`\r等待 Cloudflare Pages 生效… ${attempt}/6`);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  process.stdout.write("\n");
  return { verified: false, detail };
}

async function main() {
  assertRuntime();
  await mkdir(output, { recursive: true });
  if (!skipBuild) {
    console.log(`\n[1/7] 构建 Cloudflare Pages ${RELEASE_VERSION} DeepSeek 全栈版…`);
    const built = spawnSync("npm", ["run", "build:cloudflare"], { cwd: projectRoot, stdio: "inherit", env: process.env });
    if (built.status !== 0) throw new Error("Cloudflare 版本构建失败");
  } else {
    console.log(`\n[1/7] 使用已验收的 ${RELEASE_VERSION} 构建文件…`);
  }
  await Promise.all([access(path.join(dist, "index.html")), access(path.join(dist, "_worker.js"))]);
  const artifactSha256 = await artifactDigest(dist);
  if (prepareOnly) {
    console.log(`国内 DeepSeek 全栈版准备完成（未连接账号）：${dist}`);
    console.log(`文件摘要：${artifactSha256}`);
    return;
  }

  console.log("[2/7] 登录 Cloudflare；请使用创建原 Pages 项目的同一个账号…");
  run(["login"]);

  console.log("[3/7] 读取并复用固定 Pages 项目…");
  const projectName = await ensureProject();

  console.log("[4/7] 创建或复用 D1 数据库并写入安全绑定…");
  const database = await ensureDatabase();
  const adminEmail = await askAdminEmail();
  await writeWranglerConfig(projectName, database, adminEmail);
  run(["d1", "execute", database.databaseName, "--remote", "--file", schemaFile, "--yes"], { cwd: cloudflareRoot });

  console.log("[5/7] 配置服务端密钥…");
  const existingSecrets = listExistingSecrets(projectName);
  if (rotateCredentials || !existingSecrets.has("DEEPSEEK_API_KEY")) {
    putInteractiveSecret(projectName, "DEEPSEEK_API_KEY", "请粘贴一枚全新的 DeepSeek API Key，然后回车：");
  } else {
    console.log("保留现有 DEEPSEEK_API_KEY，不要求重复粘贴。");
  }
  if (rotateCredentials || !existingSecrets.has("ADMIN_PASSWORD")) {
    putInteractiveSecret(projectName, "ADMIN_PASSWORD", "请设置国内版主管理员密码（至少 10 位），然后回车：");
  } else {
    console.log("保留现有 ADMIN_PASSWORD，站长登录密码不变。");
  }
  if (rotateCredentials || !existingSecrets.has("SESSION_SECRET")) {
    putGeneratedSecret(projectName, "SESSION_SECRET");
  } else {
    console.log("保留现有 SESSION_SECRET，更新后用户不会被无故退出。");
  }
  const deployCheckSecret = putGeneratedSecret(projectName, "DEPLOY_CHECK_SECRET");

  console.log(`[6/7] 上传到固定 Pages 项目 ${projectName}…`);
  const deployed = run(["pages", "deploy", "dist", "--project-name", projectName, "--branch", "main", "--commit-dirty=true"], {
    capture: true,
    cwd: cloudflareRoot,
  });
  printResult(deployed);
  if (!deployed.ok) throw new Error(`Cloudflare Pages 上传失败；目标项目：${projectName}`);
  const combined = `${deployed.stdout}\n${deployed.stderr}`;
  const urls = combined.match(/https:\/\/[a-zA-Z0-9.-]+\.pages\.dev\/?/g) || [];
  const deploymentUrl = urls.at(-1) || "";
  const url = `https://${projectName}.pages.dev/`;

  console.log("[7/7] 验收页面、登录、D1 与 DeepSeek 配置状态…");
  const check = await waitForPage(url, deployCheckSecret);
  await writeFile(reportFile, `${JSON.stringify({
    checkedAt: new Date().toISOString(),
    releaseVersion: RELEASE_VERSION,
    artifactSha256,
    projectName,
    url,
    deploymentUrl,
    databaseName: database.databaseName,
    adminEmail,
    publicCheck: check,
  }, null, 2)}\n`);

  console.log(`\nCloudflare Pages ${RELEASE_VERSION} 上传成功。`);
  console.log(`网站：${url}`);
  console.log(`手机/用户登录：${new URL("/login", url)}`);
  console.log(`运营后台：${new URL("/admin", url)}`);
  if (deploymentUrl && deploymentUrl !== url) console.log(`本次部署版本：${deploymentUrl}`);
  if (check.verified) console.log(`公网回访：页面、D1、登录后端与 DeepSeek 真实生成均通过（${check.resolvedModel}）`);
  else console.warn(`上线验收尚未全部通过（${check.detail || "当前电脑网络不可达"}）。网站已上传，但请先解决该提示再正式收费。`);
  console.log(`验收报告：${reportFile}`);
  console.log("当前所有生成均走服务端 DeepSeek；没有 APPL 回退，失败请求会退还次数。");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`\n部署中止：${error instanceof Error ? error.message : String(error)}`);
    console.error(`诊断文件保留在：${output}`);
    process.exitCode = 1;
  });
}

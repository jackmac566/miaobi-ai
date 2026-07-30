import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /<html[^>]*lang=["']zh-CN["']/i);
  assert.match(html, /妙笔AI｜AI 文案全能助手/);
  assert.doesNotMatch(html, /Starter Project/);
});

test("PWA shell is installable without caching account or admin APIs", async () => {
  const [serviceWorker, staticServiceWorker, manifest, staticPayment] = await Promise.all([
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../cloudflare/public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../cloudflare/public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../cloudflare/public/payment-config.js", import.meta.url), "utf8"),
  ]);
  assert.match(serviceWorker, /pathname\.startsWith\(\"\/api\/\"\)/);
  assert.match(serviceWorker, /pathname\.startsWith\(\"\/admin\"\)/);
  assert.match(staticServiceWorker, /miaobi-shell-v1\.5\.0/);
  assert.deepEqual(JSON.parse(manifest).icons.map(icon => icon.sizes), ["192x192", "512x512"]);
  assert.match(staticPayment, /enabled:\s*false/);
  assert.match(staticPayment, /methods:\s*\[\]/);
  assert.doesNotMatch(staticPayment, /wechat-pay|alipay-pay|shikanghou4/);
  assert.doesNotMatch(staticPayment, /手机号/);
});

test("open-source defaults contain no owner contact, payment QR or Sites project binding", async () => {
  const [page, legal, payment, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/legal/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../cloudflare/public/payment-config.js", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.example.json", import.meta.url), "utf8"),
  ]);
  const publicSource = `${page}\n${legal}\n${payment}`;
  assert.doesNotMatch(publicSource, /shikanghou4|wechat-pay|alipay-pay/);
  assert.match(publicSource, /enabled:\s*false/);
  assert.deepEqual(JSON.parse(hosting), {
    d1: "DB",
    project_id: "replace-with-your-sites-project-id",
    r2: null,
  });
});

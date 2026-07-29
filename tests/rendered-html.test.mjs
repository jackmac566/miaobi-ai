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

test("open-source package excludes operator-owned payment QR images", async () => {
  await assert.rejects(readFile(new URL("../public/payment/wechat-pay.png", import.meta.url)));
  await assert.rejects(readFile(new URL("../public/payment/alipay-pay.png", import.meta.url)));
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
  assert.match(staticServiceWorker, /miaobi-shell-v1\.4\.5/);
  assert.deepEqual(JSON.parse(manifest).icons.map(icon => icon.sizes), ["192x192", "512x512"]);
  assert.match(staticPayment, /enabled:\s*false/);
  assert.doesNotMatch(staticPayment, /wechat-pay|alipay-pay|@gmail\.com/);
  assert.doesNotMatch(staticPayment, /手机号/);
});

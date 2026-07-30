import assert from "node:assert/strict";
import test from "node:test";

import { readFile } from "node:fs/promises";

import { AI_PROVIDERS, fetchAIChat, readAIChatResponse } from "../lib/ai-providers.ts";
import { chinaDayStart, usageDateKey } from "../lib/date-rules.ts";

test("legacy calendar helpers remain deterministic for historical data", () => {
  assert.equal(usageDateKey(new Date("2026-07-15T15:59:59.000Z")), "2026-07-15");
  assert.equal(usageDateKey(new Date("2026-07-15T16:00:00.000Z")), "2026-07-16");
  assert.equal(chinaDayStart(new Date("2026-07-15T16:00:00.000Z")), Date.parse("2026-07-15T16:00:00.000Z"));
});

test("the active product exposes only DeepSeek with a fixed HTTPS endpoint", () => {
  assert.deepEqual(AI_PROVIDERS.map(provider => provider.id), ["deepseek"]);
  assert.equal(new Set(AI_PROVIDERS.map(provider => provider.id)).size, AI_PROVIDERS.length);
  for (const provider of AI_PROVIDERS) {
    assert.equal(new URL(provider.endpoint).protocol, "https:");
    assert.equal(new URL(provider.docsUrl).protocol, "https:");
    if (provider.modelsEndpoint) assert.equal(new URL(provider.modelsEndpoint).protocol, "https:");
    assert.ok(provider.defaultModel.length >= 2);
    assert.ok(provider.models.some(model => model.id === provider.defaultModel));
  }
});

test("provider connection verification requires a non-empty model response", async () => {
  const parsed = await readAIChatResponse(new Response(JSON.stringify({
    model: "verified-model",
    choices: [{ message: { content: "连接成功" } }],
  })));
  assert.equal(parsed.content, "连接成功");
  assert.equal(parsed.resolvedModel, "verified-model");

  const empty = await readAIChatResponse(new Response(JSON.stringify({ choices: [] })));
  assert.equal(empty.content, "");

  const cleaned = await readAIChatResponse(new Response(JSON.stringify({
    choices: [{ message: { content: "<think>内部推理不能展示</think>可直接使用的文案" } }],
  })));
  assert.equal(cleaned.content, "可直接使用的文案");

  const cleanedOrphan = await readAIChatResponse(new Response(JSON.stringify({
    choices: [{ message: { content: "供应商内部思考\n</think>\n最终成品" } }],
  })));
  assert.equal(cleanedOrphan.content, "最终成品");
});

test("DeepSeek V4 requests disable thinking and use real JSON mode", async t => {
  let captured = null;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    captured = JSON.parse(String(init?.body || "{}"));
    return new Response(JSON.stringify({
      model: "deepseek-v4-flash",
      choices: [{ message: { content: "{\"versions\":[\"真实成品\"]}" } }],
    }));
  });

  const response = await fetchAIChat({
    provider: "deepseek",
    apiKey: "test-key-never-sent",
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "返回 JSON" }],
    maxTokens: 800,
    temperature: 0.42,
    jsonMode: true,
    timeoutMs: 5_000,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(captured.thinking, { type: "disabled" });
  assert.deepEqual(captured.response_format, { type: "json_object" });
  assert.equal(captured.temperature, 0.42);
  assert.equal(captured.max_tokens, 800);
});

test("provider activation performs database readback before reporting success", async () => {
  const route = await readFile(new URL("../app/api/admin/ai-settings/route.ts", import.meta.url), "utf8");
  assert.match(route, /SELECT value FROM app_settings WHERE key = 'ai_active_provider'/);
  assert.match(route, /activation readback mismatch/);
  assert.match(route, /保存后复核不一致/);
});

test("rolling quota and membership activation both require database readback", async () => {
  const [runtime, members] = await Promise.all([
    readFile(new URL("../lib/runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/members/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(runtime, /USAGE_WINDOW_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(runtime, /usage_windows/);
  assert.match(members, /Membership grant readback mismatch/);
  assert.match(members, /membershipActive: true/);
});

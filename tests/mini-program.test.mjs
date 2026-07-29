import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("WeChat mini program package has complete pages and no embedded API key", async () => {
  const [projectText, appText, config, api, scenes, readme] = await Promise.all([
    read("../wechat-mini-program/project.config.json"),
    read("../wechat-mini-program/miniprogram/app.json"),
    read("../wechat-mini-program/miniprogram/config.js"),
    read("../wechat-mini-program/miniprogram/utils/api.js"),
    read("../wechat-mini-program/miniprogram/data/scenes.js"),
    read("../wechat-mini-program/README.md"),
  ]);
  const project = JSON.parse(projectText);
  const app = JSON.parse(appText);
  assert.equal(project.miniprogramRoot, "miniprogram/");
  assert.equal(app.tabBar.list.length, 5);
  assert.equal(app.pages.length, 6);
  assert.equal((scenes.match(/\[\"/g) || []).length, 43);
  assert.match(config, /REPLACE_WITH_YOUR_HTTPS_DOMAIN/);
  assert.match(api, /Authorization: `Bearer/);
  assert.doesNotMatch(`${config}\n${api}\n${scenes}`, /sk-[a-zA-Z0-9]{12,}/);
  assert.match(readme, /30 元是小程序认证环节的费用/);
  assert.match(readme, /不得.*API Key|不要把 DeepSeek API Key/);
});

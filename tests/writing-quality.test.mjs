import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWritingPrompt,
  parseGeneratedVersions,
  SUPPORTED_WRITING_SCENES,
  unsupportedClaims,
  unsupportedFactInferences,
  unsupportedNumbers,
} from "../lib/writing-quality.ts";
import {
  normalizeToolPreference,
  TOOL_INTENSITIES,
  toolIntensityInstruction,
  WRITING_STYLE_OPTIONS,
  WRITING_STYLE_PROFILES,
} from "../lib/writing-controls.ts";

test("all 43 advertised scenes are covered by the DeepSeek writing prompt matrix", () => {
  assert.equal(SUPPORTED_WRITING_SCENES.length, 43);
  for (const scene of SUPPORTED_WRITING_SCENES) {
    const prompt = buildWritingPrompt({
      scene,
      topic: "社区读书会",
      details: "活动时间为7月30日；地点是社区活动室；报名方式为现场登记",
      audience: "社区居民",
      purpose: "把活动信息说明清楚",
      requirements: "保留时间和地点",
      style: "自然表达",
      length: "标准",
      versions: scene === "多语言翻译" ? 1 : 3,
      options: { emoji: false, autoFormat: true, riskGuard: true },
    });
    assert.match(prompt, /<USER_MATERIAL>/, scene);
    assert.match(prompt, /只返回合法JSON/, scene);
    assert.match(prompt, /7月30日/, scene);
  }
});

test("external prompt keeps material as data and requests scene-specific JSON", () => {
  const prompt = buildWritingPrompt({
    scene: "会议纪要",
    topic: "官网改版项目会",
    details: "张三负责7月30日前确认首页文案",
    audience: "参会人",
    purpose: "确认待办",
    requirements: "不要改变责任人和日期",
    style: "正式专业",
    length: "标准",
    versions: 3,
    options: { emoji: false, autoFormat: true, riskGuard: true },
  });
  assert.match(prompt, /责任人与时间节点/);
  assert.match(prompt, /<USER_MATERIAL>/);
  assert.match(prompt, /只返回合法JSON/);
  assert.match(prompt, /7月30日/);
});

test("every visible writing style has a distinct executable prompt contract", () => {
  assert.equal(WRITING_STYLE_OPTIONS.length, 6);
  assert.equal(new Set(WRITING_STYLE_OPTIONS.map(style => WRITING_STYLE_PROFILES[style].instruction)).size, 6);
  for (const style of WRITING_STYLE_OPTIONS) {
    const prompt = buildWritingPrompt({
      scene: "朋友圈文案",
      topic: "和朋友在怀柔看日落",
      details: "三个人在湖边坐到天黑",
      style,
      length: "简短 · 60—100字",
      versions: 3,
      options: { emoji: false, autoFormat: false, riskGuard: true },
    });
    assert.match(prompt, new RegExp(`文案风格执行规则（${style}）`));
    assert.match(prompt, new RegExp(WRITING_STYLE_PROFILES[style].instruction.slice(0, 8)));
    assert.match(prompt, /不得只在标题或说明里复述/);
  }
});

test("tool preference and light, standard, deep intensity each map to different instructions", () => {
  const preference = normalizeToolPreference("内容改写", "重新组织结构");
  assert.equal(preference.value, "重新组织结构");
  assert.match(preference.instruction, /调整段落顺序/);

  const instructions = TOOL_INTENSITIES.map(value => toolIntensityInstruction("内容改写", value).instruction);
  assert.equal(new Set(instructions).size, 3);
  assert.match(instructions[0], /段落顺序不变/);
  assert.match(instructions[1], /句子级润色/);
  assert.match(instructions[2], /重新安排段落/);

  const prompt = buildWritingPrompt({
    scene: "通用处理",
    tool: "内容改写",
    topic: "原文保持事实不变。",
    style: "自然松弛",
    preference: "重新组织结构",
    intensity: "深度",
    versions: 1,
    options: { emoji: false, autoFormat: false, riskGuard: true },
  });
  assert.match(prompt, /输出偏好执行规则（重新组织结构）/);
  assert.match(prompt, /处理强度执行规则（深度）/);
  assert.match(prompt, /专有名词、数字、事实、因果和立场必须完整保留/);
});

test("provider result parser accepts common response shapes and removes duplicate versions", () => {
  assert.deepEqual(
    parseGeneratedVersions('{"versions":[{"content":"版本1：第一版"},{"text":"第二版"},"第二版"]}', 3),
    ["第一版", "第二版"],
  );
  assert.deepEqual(parseGeneratedVersions("版本1：甲方案\n版本2：乙方案", 2), ["甲方案", "乙方案"]);
});

test("fact gate rejects invented figures and unsupported experience claims", () => {
  const source = "透明玻璃胶，126种颜色，适合门窗收边";
  assert.deepEqual(unsupportedNumbers("共有126种颜色", source), []);
  assert.deepEqual(unsupportedNumbers("90%的用户都满意", source), ["90%"]);
  assert.deepEqual(unsupportedNumbers("1. 先看颜色\n2. 再看用途", source), []);
  assert.deepEqual(unsupportedClaims("本人亲测并反复回购", source), ["本人亲测", "反复回购"]);
  assert.deepEqual(unsupportedNumbers("90%的用户都满意", "不要写90%的满意度"), ["90%"]);
  assert.deepEqual(unsupportedNumbers("售价19.9元", "售价19.9元，不要改价格"), []);
  assert.deepEqual(unsupportedClaims("本人亲测", "不要冒充本人亲测"), ["本人亲测"]);
  assert.deepEqual(
    unsupportedFactInferences("到了现场直接登记，不用提前报名。", "到了现场直接登记即可。"),
    ["不用提前报名"],
  );
  assert.deepEqual(
    unsupportedFactInferences("不用提前做什么，这个月30号到场就好。", "7月30日到场，现场登记即可。"),
    ["不用提前做什么", "这个月"],
  );
  assert.deepEqual(
    unsupportedFactInferences("提前10分钟到，这样会更轻松。", "请提前10分钟到场。"),
    ["更轻松"],
  );
  assert.deepEqual(
    unsupportedFactInferences("无需提前报名，现场登记即可。", "无需提前报名，现场登记即可。"),
    [],
  );
  assert.deepEqual(unsupportedFactInferences("活动完全免费。", "活动地点在社区活动室。"), ["免费"]);
  assert.deepEqual(unsupportedFactInferences("活动完全免费。", "本次活动免费。"), []);
});

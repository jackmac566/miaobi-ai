"lib/models":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHAT_STARTERS = exports.EFFORT_HINTS = exports.EFFORT_LABELS = exports.MODELS = exports.PROVIDERS = void 0;
exports.modelOf = modelOf;
exports.effortsFor = effortsFor;
exports.normalizeEffort = normalizeEffort;
exports.switchModel = switchModel;
exports.displayName = displayName;
exports.safeModelEfforts = safeModelEfforts;
exports.priceOf = priceOf;
exports.reasoningParam = reasoningParam;

/* v5：模型清单只列真实型号，标注真实厂商。
   界面上出现的名字 = 实际发送给 API 的 Model ID，不再有 GPT / Claude 之类的界面假名。
   价格取自厂商公开价目（2026-09），仅用于本页估算，以厂商账单为准。 */
exports.PROVIDERS = {
  deepseek: { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', keyHint: 'sk-…（platform.deepseek.com）' },
  zhipu: { id: 'zhipu', label: '智谱 BigModel', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', keyHint: '形如 xxxxxxxx.yyyyyyyy（bigmodel.cn）' },
};

exports.MODELS = [
  {
    id: 'ds-fast', provider: 'deepseek', apiModel: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash', short: 'V4 Flash', color: 'deepseek',
    description: '快速对话 · 关闭思考链，通常 1–3 秒开始出字',
    efforts: ['off'], defaultEffort: 'off',
    price: { currency: 'USD', input: 0.14, cacheHit: 0.0028, output: 0.28 },
  },
  {
    id: 'ds-think', provider: 'deepseek', apiModel: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash · 思考', short: 'V4 Flash 思考', color: 'deepseek',
    description: '同一模型的思考模式，推理过程会实时显示在下方',
    efforts: ['off', 'low', 'high', 'max'], defaultEffort: 'low',
    price: { currency: 'USD', input: 0.14, cacheHit: 0.0028, output: 0.28 },
  },
  {
    id: 'ds-pro', provider: 'deepseek', apiModel: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro', short: 'V4 Pro', color: 'deepseek',
    description: '1.6T 大模型 · 复杂推理与长文，单价约为 Flash 的 3 倍',
    efforts: ['low', 'high', 'max'], defaultEffort: 'high',
    price: { currency: 'USD', input: 0.435, cacheHit: 0.003625, output: 0.87 },
  },
  {
    id: 'glm-flash', provider: 'zhipu', apiModel: 'glm-4.7-flash',
    label: 'GLM-4.7-Flash', short: 'GLM Flash', color: 'zhipu',
    description: '智谱免费档 · 200K 上下文，高峰期会排队变慢',
    efforts: ['off'], defaultEffort: 'off',
    price: { currency: 'CNY', input: 0, cacheHit: 0, output: 0 },
  },
  {
    id: 'glm-47', provider: 'zhipu', apiModel: 'glm-4.7',
    label: 'GLM-4.7', short: 'GLM-4.7', color: 'zhipu',
    description: '智谱高性价比旗舰 · 可开关思考模式',
    efforts: ['off', 'auto'], defaultEffort: 'off',
    price: { currency: 'CNY', input: 2, cacheHit: 2, output: 8 },
  },
  {
    id: 'glm-53', provider: 'zhipu', apiModel: 'glm-5.3',
    label: 'GLM-5.3', short: 'GLM-5.3', color: 'zhipu',
    description: '智谱旗舰 · 复杂工程与长程任务，价格以官网为准',
    efforts: ['off', 'auto'], defaultEffort: 'auto',
    price: null,
  },
];

exports.EFFORT_LABELS = { off: '关闭思考', low: '低', high: '高', max: '最高', auto: '思考开启' };
exports.EFFORT_HINTS = {
  off: '不产生思考链，首字最快。适合日常对话与写作。',
  low: '开启思考但预算低，适合需要一点推理的问答。',
  high: '思考预算高，复杂问题更稳，耗时与用量会明显增加。',
  max: '最高思考预算，只在真正困难的任务上用。',
  auto: '按该模型的默认行为开启思考。智谱当前只区分开/关，不区分档位。',
};

/* 思考相关参数：不同厂商字段不同，这里统一出口，避免调用处拼错。 */
function reasoningParam(model, effort) {
  const on = effort && effort !== 'off';
  if (model.provider === 'deepseek') {
    if (!on) return { thinking: { type: 'disabled' } };
    const map = { low: 'low', high: 'high', max: 'max', auto: 'high' };
    return { thinking: { type: 'enabled' }, reasoning_effort: map[effort] || 'high' };
  }
  return { thinking: { type: on ? 'enabled' : 'disabled' } };
}

function modelOf(value) {
  const found = exports.MODELS.find(m => m.id === value) || exports.MODELS.find(m => m.apiModel === value);
  return found || exports.MODELS[0];
}
function effortsFor(model) { return modelOf(model).efforts; }
function normalizeEffort(model, value) {
  const m = modelOf(model);
  return m.efforts.includes(value) ? value : m.defaultEffort;
}
function safeModelEfforts(raw) {
  const out = {};
  for (const m of exports.MODELS) out[m.id] = normalizeEffort(m.id, raw && raw[m.id]);
  return out;
}
function displayName(settings) {
  const m = modelOf(settings && settings.model);
  const effort = normalizeEffort(m.id, settings && settings.effort);
  return effort === 'off' ? m.label : m.label + ' · ' + (exports.EFFORT_LABELS[effort] || effort);
}

/* 生图模型不是聊天入口，不放进 MODELS 让用户选，但界面必须能正确显示它的名字与厂商，
   否则画出来的图会被挂上聊天模型的名字——那就是新的"作假"。 */
exports.IMAGE_MODELS = {
  'cogview-4': { label: 'CogView-4', provider: 'zhipu' },
  'cogview-3-flash': { label: 'CogView-3-Flash', provider: 'zhipu' },
};
exports.imageModelOf = function (v) { return exports.IMAGE_MODELS[v] || null; };
/** 按一条消息的真实元数据取展示名：生图消息显示生图模型，聊天消息显示聊天模型。 */
exports.labelForMeta = function (meta) {
  if (!meta) return exports.displayName({});
  const img = exports.IMAGE_MODELS[meta.apiModel];
  if (img) return img.label + '（' + exports.PROVIDERS[img.provider].label + '）';
  if (meta.apiModel) {
    const hit = exports.MODELS.find(m => m.apiModel === meta.apiModel);
    if (hit) return exports.displayName({ model: hit.id, effort: meta.effort });
  }
  return exports.displayName(meta);
};
function priceOf(modelId) { return modelOf(modelId).price || null; }
function switchModel(settings, model) {
  const efforts = { ...settings.modelEfforts, [settings.model]: settings.effort };
  return { model, effort: normalizeEffort(model, efforts[model]), modelEfforts: efforts };
}

exports.CHAT_STARTERS = [
    { title: '先聊聊今天', sub: '从一句问候，开始这次对话', icon: 'message', prompt: '你好，今天想找你聊聊天。' },
    { title: '一起推敲想法', sub: '把一个模糊的点子拆清楚', icon: 'spark', prompt: '我想做一个帮助大学生整理学习资料的 AI 产品。先帮我找出最需要验证的假设。' },
    { title: '讲清一个概念', sub: '用例子理解，而不是背定义', icon: 'book', prompt: '能用一个生活中的例子解释什么是机会成本吗？' },
    { title: '帮我看一段文字', sub: '读懂、总结，再继续追问', icon: 'file', prompt: '我准备给你一段文字，请先概括核心观点，再和我讨论其中不够清楚的地方。' },
];

},

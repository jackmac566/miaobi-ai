/**
 * 妙笔 v5 · 无浏览器逻辑测试
 * ---------------------------------
 * 把 dist/miaobi-v5.html 里的模块注册表抽出来，在 Node 里跑起来，
 * 用假的 fetch 模拟厂商 SSE 响应，验证：
 *   - 模块注册表能完整加载（任何模块顶层报错都会暴露）
 *   - 模型 → 厂商路由正确
 *   - 流式推理文本（reasoning.delta）真的被透传出来，不再只发标志位
 *   - 首字延迟被记录
 *   - 联网检索会先走智谱、并注入上下文与来源
 *   - 生图走 /images/generations
 *   - 费用按内置价目表估算（不再依赖手填单价）
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(ROOT, 'dist', 'miaobi-v5.html'), 'utf8');

const opens = [...html.matchAll(/<script>/g)].map(m => m.index);
const closes = [...html.matchAll(/<\/script>/g)].map(m => m.index);
const script = html.slice(opens.at(-1) + 8, closes.at(-1));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name} ${extra}`); }
};

/* ---------- 运行环境桩 ---------- */
const store = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() };
};
const calls = [];
globalThis.localStorage = store();
globalThis.sessionStorage = store();
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => {};
globalThis.document = {
  getElementById: () => ({}),
  createElement: () => ({ style: {}, append() {}, remove() {}, click() {} }),
  addEventListener() {}, body: { append() {} },
};
globalThis.React = {
  createElement: (t, p, ...c) => ({ t, p, c }),
  Fragment: 'Fragment',
  useState: v => [v, () => {}],
  useEffect: () => {},
  useRef: v => ({ current: v }),
  useId: () => 'id',
  useMemo: f => f(),
};
globalThis.ReactDOM = { createRoot: () => ({ render() {} }) };

/* ---------- 假 fetch：按 URL 返回不同响应 ---------- */
const sse = chunks => new Response(
  new ReadableStream({
    start(c) { for (const s of chunks) c.enqueue(new TextEncoder().encode(s)); c.close(); },
  }),
  { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
);
const frame = o => `data: ${JSON.stringify(o)}\n\n`;

let fetchPlan = [];
globalThis.fetch = async (url, init) => {
  const body = init?.body ? JSON.parse(init.body) : null;
  calls.push({ url, body });
  const plan = fetchPlan.shift();
  if (!plan) throw new Error('测试未预期的请求：' + url);
  return plan(url, body);
};

/* ---------- 载入模块 ---------- */
const tail = script.lastIndexOf('})();');
if (tail < 0) throw new Error('脚本尾部结构变了，找不到 IIFE 收尾');
const patched = script.slice(0, tail) + 'globalThis.__mb={load,modules};\n' + script.slice(tail);
new Function(patched)();
const { load } = globalThis.__mb;

console.log('\n[1] 模块注册表');
const mods = globalThis.__mb.modules;
ok(`共 ${Object.keys(mods).length} 个模块`, Object.keys(mods).length === 19);
const models = load('lib/models');
const conn = load('lib/connection');
const chatApi = load('lib/chat-api');
ok('lib/models 可加载', typeof models.MODELS === 'object');
ok('lib/connection 可加载', typeof conn.apiFetch === 'function');

console.log('\n[2] 模型清单：不做假');
ok('共列出 6 个真实型号', models.MODELS.length === 6, JSON.stringify(models.MODELS.map(m => m.id)));
ok('没有任何 GPT / Claude 字样', !models.MODELS.some(m => /gpt|claude/i.test(m.label + m.apiModel)));
ok('每个模型都带真实 Model ID', models.MODELS.every(m => typeof m.apiModel === 'string' && m.apiModel.length > 3));
ok('厂商归属正确', models.MODELS.filter(m => m.provider === 'deepseek').length === 3 && models.MODELS.filter(m => m.provider === 'zhipu').length === 3);
ok('displayName 只输出真实型号', models.displayName({ model: 'ds-pro', effort: 'high' }).includes('DeepSeek V4 Pro'));
ok('关闭思考时不加后缀', models.displayName({ model: 'ds-fast', effort: 'off' }) === 'DeepSeek V4 Flash');
ok('未知模型安全回落到第一个', models.modelOf('不存在的模型').id === models.MODELS[0].id);
ok('生图消息按生图模型标注厂商', (() => { const t = models.labelForMeta({ apiModel: 'cogview-3-flash' }); return t.includes('CogView') && t.includes('智谱'); })());
ok('生图模型不会被误认成聊天模型', !models.labelForMeta({ apiModel: 'cogview-4' }).includes('DeepSeek'));
ok('聊天消息标签仍带真实档位', models.labelForMeta({ apiModel: 'deepseek-v4-flash', effort: 'low' }).includes('DeepSeek'));
ok('生图模型可反查厂商', models.imageModelOf('cogview-3-flash')?.provider === 'zhipu' && models.imageModelOf('deepseek-v4-flash') === null);

console.log('\n[3] 思考参数按厂商正确映射');
const R = models.reasoningParam;
ok('DeepSeek 关思考 → thinking.disabled', JSON.stringify(R(models.modelOf('ds-fast'), 'off')) === JSON.stringify({ thinking: { type: 'disabled' } }));
const rHigh = R(models.modelOf('ds-think'), 'high');
ok('DeepSeek 开思考带 reasoning_effort', rHigh.thinking.type === 'enabled' && rHigh.reasoning_effort === 'high');
ok('智谱只区分开关，不发 reasoning_effort', !('reasoning_effort' in R(models.modelOf('glm-47'), 'auto')));

console.log('\n[4] 未配置时的可用性判断');
ok('没填 Key → 不可用并说明原因', conn.modelReady('ds-fast').ok === false && conn.modelReady('ds-fast').reason.includes('DeepSeek'));
ok('联网未就绪', conn.searchReady() === false);

console.log('\n[5] 保存两个 Key');
/* 界面用的是 connection.saveConfig，测试台用的是 saveDirectConfig——
   两个名字都必须存在，否则界面点保存会静默失败。 */
ok('导出 saveConfig（界面调用的名字）', typeof conn.saveConfig === 'function');
ok('导出 saveDirectConfig（兼容旧名）', typeof conn.saveDirectConfig === 'function');
ok('导出 modelReady / searchReady', typeof conn.modelReady === 'function' && typeof conn.searchReady === 'function');
ok('导出 testProvider / changed', typeof conn.testProvider === 'function' && typeof conn.changed === 'function');
conn.saveConfig({
  providers: {
    deepseek: { apiKey: 'sk-test-deepseek', rememberKey: true },
    zhipu: { apiKey: 'test-zhipu-key', rememberKey: true },
  },
  searchEngine: 'search_std',
  imageModel: 'cogview-3-flash',
  maxTokens: 4096,
});
ok('DeepSeek 变为可用', conn.modelReady('ds-fast').ok === true);
ok('联网/生图就绪', conn.searchReady() === true);
const caps = await conn.apiFetch('/api/chat/capabilities').then(r => r.json());
ok('capabilities 上报真实 apiModel', caps.models.every(m => m.apiModel && !/gpt|claude/i.test(JSON.stringify(m))));

/* ---------- 消费 SSE 的小工具 ---------- */
/* 应用层设计：error 事件由 consumeSSE 抛出 ApiError，交给 UI 捕获后落到消息的 error 字段。
   所以测试里也要接住，把 message 记进 events 方便断言。 */
async function collect(res) {
  const events = [];
  try {
    await new Promise((resolve, reject) => {
      chatApi.consumeSSE(res.body, e => events.push(e), undefined).then(resolve, reject);
    });
  } catch (e) {
    events.push({ type: 'error', message: e.message, code: e.code });
  }
  return events;
}

console.log('\n[6] 流式思考：推理文本必须真的被传出来（v4.2 的核心 bug）');
calls.length = 0;
fetchPlan = [() => sse([
  frame({ id: 'req-1', choices: [{ delta: { reasoning_content: '先理解题意，' } }] }),
  frame({ id: 'req-1', choices: [{ delta: { reasoning_content: '再分步推导。' } }] }),
  frame({ choices: [{ delta: { content: '答案是 42。' } }] }),
  frame({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1200, completion_tokens: 300, prompt_cache_hit_tokens: 800, completion_tokens_details: { reasoning_tokens: 60 } } }),
  'data: [DONE]\n\n',
])];
const res1 = await conn.apiFetch('/api/chat', { method: 'POST', body: JSON.stringify({ model: 'ds-think', effort: 'low', messages: [{ role: 'user', content: '测试' }] }) });
ok('聊天接口返回 200 流式响应', res1.ok === true && res1.headers.get('content-type').includes('text/event-stream'));
const ev1 = await collect(res1);
const reasoningText = ev1.filter(e => e.type === 'reasoning.delta').map(e => e.delta).join('');
ok('收到 reasoning.start', ev1.some(e => e.type === 'reasoning.start'));
ok('推理文本被完整透传', reasoningText === '先理解题意，再分步推导。', JSON.stringify(reasoningText));
ok('正文照常流式输出', ev1.filter(e => e.type === 'text.delta').map(e => e.delta).join('') === '答案是 42。');
ok('reasoning.done 在正文前发出', ev1.findIndex(e => e.type === 'reasoning.done') < ev1.findIndex(e => e.type === 'text.delta'));
const done1 = ev1.find(e => e.type === 'done');
ok('done 事件带首字延迟', done1?.latency && done1.latency.firstTokenMs !== null);
ok('meta 里的模型是真实 Model ID', ev1.find(e => e.type === 'meta').model === 'deepseek-v4-flash');
ok('meta 标明厂商', ev1.find(e => e.type === 'meta').vendor === 'DeepSeek');
ok('请求带 max_tokens，限制输出长度', calls[0].body.max_tokens === 4096);
ok('请求带 thinking 参数', calls[0].body.thinking?.type === 'enabled');
ok('请求打到 DeepSeek 域名', calls[0].url.includes('api.deepseek.com'));

console.log('\n[7] 费用按内置价目表估算');
const usage1 = ev1.find(e => e.type === 'usage').usage;
ok('解析出缓存命中 token', usage1.cacheHit === 800, JSON.stringify(usage1));
ok('解析出思考 token', usage1.reasoning === 60);
const cost1 = ev1.find(e => e.type === 'usage').cost;
const expect = ((1200 - 800) * 0.14 + 800 * 0.0028 + 300 * 0.28) / 1e6;
ok('费用计算正确（含缓存命中折扣）', Math.abs(cost1.amount - expect) < 1e-12, `${cost1.amount} vs ${expect}`);
ok('币种为 USD', cost1.currency === 'USD');

console.log('\n[8] 关思考时不发 thinking.enabled');
calls.length = 0;
fetchPlan = [() => sse([frame({ choices: [{ delta: { content: 'hi' } }] }), frame({ choices: [{ delta: {}, finish_reason: 'stop' }] }), 'data: [DONE]\n\n'])];
await collect(await conn.apiFetch('/api/chat', { method: 'POST', body: JSON.stringify({ model: 'ds-fast', effort: 'off', messages: [{ role: 'user', content: '测试' }] }) }));
ok('关闭思考时 thinking.type 为 disabled', calls[0].body.thinking.type === 'disabled');
ok('关闭思考时不带 reasoning_effort', !('reasoning_effort' in calls[0].body));

console.log('\n[9] 联网：走智谱检索，再交给 DeepSeek');
calls.length = 0;
fetchPlan = [
  // 第一步：智谱联网检索（非流式）
  () => new Response(JSON.stringify({ choices: [{ message: { content: '要点一。[来源](https://example.com/a)\n要点二。[另一来源](https://news.example.org/b)' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  // 第二步：DeepSeek 正式回答
  () => sse([frame({ choices: [{ delta: { content: '根据检索结果…' } }] }), frame({ choices: [{ delta: {}, finish_reason: 'stop' }] }), 'data: [DONE]\n\n']),
];
const ev2 = await collect(await conn.apiFetch('/api/chat', { method: 'POST', body: JSON.stringify({ model: 'ds-fast', effort: 'off', webSearch: true, searchQuery: '今天的新闻', messages: [{ role: 'user', content: '今天的新闻' }] }) }));
ok('先请求智谱做检索', calls[0].url.includes('open.bigmodel.cn'));
ok('检索请求带 web_search 工具', calls[0].body.tools?.[0]?.type === 'web_search');
ok('检索时用免费档模型', calls[0].body.model === 'glm-4.7-flash');
ok('第二步才请求 DeepSeek', calls[1].url.includes('api.deepseek.com'));
ok('检索结果被注入成 system 上下文', calls[1].body.messages.some(m => m.role === 'system' && m.content.includes('example.com/a')));
const src = ev2.find(e => e.type === 'search.results');
ok('来源被解析成结构化列表', src?.results?.length === 2, JSON.stringify(src));
ok('来源带站点名', src.results[0].site === 'example.com');

console.log('\n[10] 联网 + 智谱模型：单次请求带工具');
calls.length = 0;
fetchPlan = [() => sse([frame({ choices: [{ delta: { content: '好的' } }] }), frame({ choices: [{ delta: {}, finish_reason: 'stop' }] }), 'data: [DONE]\n\n'])];
await collect(await conn.apiFetch('/api/chat', { method: 'POST', body: JSON.stringify({ model: 'glm-47', effort: 'off', webSearch: true, messages: [{ role: 'user', content: 'x' }] }) }));
ok('只发一次请求（不额外检索）', calls.length === 1);
ok('该请求带 web_search 工具', calls[0].body.tools?.[0]?.type === 'web_search');

console.log('\n[11] 生图：走智谱 /images/generations');
calls.length = 0;
fetchPlan = [() => new Response(JSON.stringify({ created: 1, data: [{ url: 'https://cdn.example.com/pic.png' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })];
const ev3 = await collect(await conn.apiFetch('/api/image', { method: 'POST', body: JSON.stringify({ prompt: '一只猫', imageModel: 'cogview-3-flash' }) }));
ok('打到 images/generations', calls[0].url.endsWith('/images/generations'));
ok('用的模型是所选生图模型', calls[0].body.model === 'cogview-3-flash');
ok('返回 image 事件并带图片地址', ev3.find(e => e.type === 'image')?.images?.[0]?.url === 'https://cdn.example.com/pic.png');
ok('生图也有 done 事件', ev3.some(e => e.type === 'done'));

console.log('\n[12] 错误与边界');
calls.length = 0;
fetchPlan = [() => new Response(JSON.stringify({ error: { message: 'Insufficient Balance' } }), { status: 402, headers: { 'Content-Type': 'application/json' } })];
const res402 = await conn.apiFetch('/api/chat', { method: 'POST', body: JSON.stringify({ model: 'ds-fast', effort: 'off', messages: [{ role: 'user', content: 'x' }] }) });
const ev4 = await collect(res402);
ok('402 余额不足被转成中文提示', ev4.find(e => e.type === 'error')?.message.includes('余额不足'));
ok('原厂商错误信息被保留', ev4.find(e => e.type === 'error')?.message.includes('Insufficient Balance'));

fetchPlan = [() => new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })];
const ev5 = await collect(await conn.apiFetch('/api/chat', { method: 'POST', body: JSON.stringify({ model: 'ds-fast', effort: 'off', messages: [{ role: 'user', content: 'x' }] }) }));
ok('空回复被明确报错', ev5.find(e => e.type === 'error')?.message.includes('没有返回可读文本'));

const badSearch = await conn.apiFetch('/api/chat', { method: 'POST', body: JSON.stringify({ model: 'ds-fast', webSearch: true, messages: [] }) });
ok('参数无效时返回 400 而不是崩掉', badSearch.status === 400);

console.log('\n[13] 用量面板数据结构');
const usage = await conn.apiFetch('/api/usage').then(r => r.json());
ok('summary 带 byProvider.deepseek / zhipu', 'deepseek' in usage.summary.byProvider && 'zhipu' in usage.summary.byProvider);
ok('没有残留的 qwen / glm 旧厂商键', !('qwen' in usage.summary.byProvider) && !('glm' in usage.summary.byProvider));
ok('记录里保存了真实 apiModel', usage.records.every(r => r.apiModel !== 'gpt6' && r.apiModel !== 'claude55'));
ok('记录里没有旧界面 id', usage.records.every(r => !['gpt6', 'claude55'].includes(r.requestedModel)));

console.log('\n[14] 跨模块调用面检查（漏导出会被当场拦住）');
/* 这次改造连续踩了 3 次「模块里定义了但忘了 exports」，而且其中两次被应用内部
   try/catch 吃掉，界面上只是一行小字提示，测试完全看不出来。所以这里做一次全量对账：
   凡是 `<别名>.<名字>` 被调用到的，别名对应的模块必须真的导出这个名字。 */
const ALIASES = {
  connection: 'lib/connection',
  models_1: 'lib/models',
  types_1: 'lib/types',
  chat_api_1: 'lib/chat-api',
  storage_1: 'lib/storage',
  catalog_1: 'lib/catalog',
  api_1: 'lib/api',
  Icon_1: 'components/ui/Icon',
  Overlay_1: 'components/ui/Overlay',
  Markdown_1: 'components/ui/Markdown',
  Composer_1: 'components/Composer',
  ModelPicker_1: 'components/ModelPicker',
  ThinkingPanel_1: 'components/ThinkingPanel',
  ProviderLogo_1: 'components/ui/ProviderLogo',
};
const aliasRe = new RegExp('\\b(' + Object.keys(ALIASES).join('|') + ')\\.([A-Za-z_$][\\w$]*)', 'g');
const used = new Map();
for (const m of html.matchAll(aliasRe)) {
  const key = m[1] + '.' + m[2];
  if (!used.has(key)) used.set(key, m[1]);
}
const missing = [];
for (const [key, alias] of used) {
  const name = key.slice(alias.length + 1);
  const mod = ALIASES[alias];
  let exported;
  try { exported = load(mod); } catch (e) { missing.push(`${key}（模块 ${mod} 加载失败：${e.message}）`); continue; }
  if (!(name in exported)) missing.push(`${key} → ${mod} 没有导出 ${name}`);
}
ok(`检查了 ${used.size} 处跨模块调用，导出齐全`, missing.length === 0, missing.join('；'));
ok('connection 导出了界面用到的 saveConfig / capabilities', typeof load('lib/connection').saveConfig === 'function' && typeof load('lib/connection').capabilities === 'function');

console.log('\n[15] 写作场景：从「摆设」变成「真实生效」');
const cat = load('lib/catalog');
ok(`场景已从 43 精简到 ${cat.SCENES.length} 个`, cat.SCENES.length === 38, String(cat.SCENES.length));
const ids = cat.SCENES.map(s => s.id);
ok('场景 id 无重复', new Set(ids).size === ids.length);
ok('场景名称无重复', new Set(cat.SCENES.map(s => s.name)).size === cat.SCENES.length);
const instrSet = new Set(cat.SCENES.map(s => s.instruction));
ok('每个场景的指令都不同（没有换个名字的重复项）', instrSet.size === cat.SCENES.length);
ok('每个场景都有实质指令（≥40 字）', cat.SCENES.every(s => s.instruction && s.instruction.length >= 40),
  cat.SCENES.filter(s => !s.instruction || s.instruction.length < 40).map(s => s.id).join(','));
ok('通用处理组才有 tool 字段', cat.SCENES.every(s => (s.group === '通用处理') === !!s.tool));
ok('两个入口不再重复展示同一批场景',
  cat.groupsFor('scenes').length === 6 && cat.groupsFor('tools').join() === '全部,通用处理');

console.log('\n[15b] 场景 + 写作设置必须真的改变请求内容');
async function systemPromptFor(writing) {
  calls.length = 0;
  fetchPlan = [() => sse([frame({ choices: [{ delta: { content: 'x' } }] }), frame({ choices: [{ delta: {}, finish_reason: 'stop' }] }), 'data: [DONE]\n\n'])];
  await collect(await conn.apiFetch('/api/chat', { method: 'POST', body: JSON.stringify({ model: 'ds-fast', effort: 'off', messages: [{ role: 'user', content: '写点东西' }], writing }) }));
  return calls[0].body.messages[0].content;
}
const base = { scene: 'auto', style: '自然松弛', length: '标准 · 150—300字', preference: '', intensity: '标准', audience: '', requirements: '' };
const pAuto = await systemPromptFor(base);
const pRedbook = await systemPromptFor({ ...base, scene: 'redbook' });
const pWeekly = await systemPromptFor({ ...base, scene: 'weekly' });
ok('未选场景时不注入写作指令（纯聊天保持轻快）', !pAuto.includes('【写作场景】'));
ok('选了场景后真的注入指令', pRedbook.includes('【写作场景】小红书种草'));
ok('不同场景产生不同请求（v4.2 里完全相同）', pRedbook !== pWeekly && pWeekly.includes('工作总结'));
ok('场景指令带上了该场景的具体要求', pRedbook.includes('小红书') && pRedbook.includes('话题标签'));

const pStyle = await systemPromptFor({ ...base, scene: 'email', style: '正式专业' });
ok('风格设置生效', pStyle.includes('【风格】正式专业'));
const pAudience = await systemPromptFor({ ...base, scene: 'email', audience: '投资方' });
ok('读者设置生效', pAudience.includes('投资方'));
const pReq = await systemPromptFor({ ...base, scene: 'email', requirements: '不要用感叹号' });
ok('额外要求生效', pReq.includes('不要用感叹号'));
const pPref = await systemPromptFor({ ...base, scene: 'polish', preference: '简洁克制' });
ok('输出偏好在工具场景下生效', pPref.includes('简洁克制'));
const pDeep = await systemPromptFor({ ...base, scene: 'proposal', intensity: '深度' });
ok('处理强度生效', pDeep.includes('【处理强度】'));
ok('所有写作指令都带事实底线', pDeep.includes('不编造数据'));

console.log('\n[15c] 篇幅联动输出上限（直接影响等待时间）');
ok('简短 → 收紧到 640', cat.lengthTokens(cat.LENGTHS[0]) === 640);
ok('标准 → 1400', cat.lengthTokens(cat.LENGTHS[1]) === 1400);
ok('详细 → 2600', cat.lengthTokens(cat.LENGTHS[2]) === 2600);
calls.length = 0;
fetchPlan = [() => sse([frame({ choices: [{ delta: { content: 'x' } }] }), frame({ choices: [{ delta: {}, finish_reason: 'stop' }] }), 'data: [DONE]\n\n'])];
await collect(await conn.apiFetch('/api/chat', { method: 'POST', body: JSON.stringify({ model: 'ds-fast', effort: 'off', messages: [{ role: 'user', content: 'x' }], writing: { ...base, scene: 'weibo', length: cat.LENGTHS[0] } }) }));
ok('选「简短」后 max_tokens 被收紧', calls[0].body.max_tokens === 640, String(calls[0].body.max_tokens));
ok('hasWritingIntent 能识别默认设置', cat.hasWritingIntent({ ...base }) === false);
ok('hasWritingIntent 能识别改过篇幅', cat.hasWritingIntent({ ...base, length: cat.LENGTHS[2] }) === true);

console.log('\n[16] 安全与合规');
ok('产物里有 CSP', html.includes('Content-Security-Policy'));
const csp = (html.match(/content="default-src[^"]*"/) || [''])[0];
ok('connect-src 只允许两家厂商', csp.includes('connect-src https://api.deepseek.com https://open.bigmodel.cn') && !/connect-src[^;]*\*/.test(csp));
ok('CSP 禁用 object/frame/base-uri', csp.includes("object-src 'none'") && csp.includes("frame-src 'none'") && csp.includes("base-uri 'none'"));
ok('Markdown 链接有协议白名单', html.includes('function safeHref') && html.includes('href: safeHref(link[2])'));
ok('回复标注了 AI 生成', html.includes('AI 生成'));
ok('有合规与隐私说明', html.includes('合规与隐私') && html.includes('不要输入'));
ok('暗色最淡一级文字已提到合规对比度', html.includes('--mb-muted:#a6a6a6;--mb-faint:#949494;'));
ok('亮色最淡一级文字已提到合规对比度', html.includes('--mb-faint:#76766f;'));

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}通过 ${pass} 项，失败 ${fail} 项\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);

/**
 * 妙笔 v5 · 浏览器端到端测试
 * ---------------------------------------------------
 * 在 127.0.0.1 上起一个静态服务，用 Playwright 打开 dist/miaobi-v5.html，
 * 通过路由拦截把 DeepSeek 与智谱的接口全部 mock 掉（不需要真 Key），
 * 验证真正在浏览器里跑起来的行为：
 *   - 页面无脚本报错
 *   - 设置弹层能分别保存两个厂商的 Key
 *   - 模型选择器里只有真实型号，没有 GPT / Claude 假名
 *   - 发送消息后：推理文本实时出现在界面上（v4.2 的核心缺陷）
 *   - 联网开关打开后：来源列表渲染出来
 *   - 画图开关打开后：图片渲染出来
 * 同时把关键界面截图存到 docs/screenshots/。
 */
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const require = createRequire('/Users/macjack622/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const { readdirSync } = await import('node:fs');
const { homedir } = await import('node:os');

/* playwright 1.63 想要的浏览器版本未必在本机缓存里，这里自动找一个能用的，
   找不到再回退到 playwright 默认行为（会提示 npx playwright install）。 */
function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const base = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (!existsSync(base)) return undefined;
  const dirs = readdirSync(base).filter(d => d.startsWith('chromium-')).sort().reverse();
  for (const d of dirs) {
    const p = join(base, d, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    if (existsSync(p)) return p;
  }
  return undefined;
}
const executablePath = findChromium();

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const SHOTS = join(ROOT, 'docs', 'screenshots');
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name} ${extra}`); }
};

/* ---------- 静态服务 ---------- */
const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  const p = rel === '' ? join(DIST, 'miaobi-v5.html') : join(DIST, rel);
  if (existsSync(p) && p.startsWith(DIST) && !p.endsWith('/')) {
    try {
      const buf = readFileSync(p);
      res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
      res.end(buf);
      return;
    } catch { /* 落到 404 */ }
  }
  res.writeHead(404); res.end('not found');
});
await new Promise(r => server.listen(8899, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:8899/';

/* ---------- mock 数据 ---------- */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' };
const fps = (o) => `data: ${JSON.stringify(o)}\n\n`;
const DS_STREAM = [
  fps({ id: 'ds-1', choices: [{ delta: { reasoning_content: '用户问的是排期问题。' } }] }),
  fps({ id: 'ds-1', choices: [{ delta: { reasoning_content: '先列出约束，再给结论。' } }] }),
  fps({ choices: [{ delta: { content: '先做接口层，再做界面。' } }] }),
  fps({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 40, prompt_cache_hit_tokens: 600 } }),
  'data: [DONE]\n\n',
].join('');

const seen = { deepseekChat: 0, zhipuChat: 0, zhipuImage: 0, searchTools: 0 };

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const preflight = (route) => route.fulfill({
  status: 204,
  headers: { ...CORS, 'access-control-allow-methods': 'POST,OPTIONS', 'access-control-allow-headers': 'authorization,content-type', 'access-control-max-age': '3600' },
});

await page.route('**/api.deepseek.com/**', async route => {
  if (route.request().method() === 'OPTIONS') return preflight(route);
  seen.deepseekChat++;
  const body = JSON.parse(route.request().postData() || '{}');
  seen.lastDeepseekBody = body;
  return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: DS_STREAM });
});

await page.route('**/open.bigmodel.cn/**', async route => {
  if (route.request().method() === 'OPTIONS') return preflight(route);
  const url = route.request().url();
  const body = JSON.parse(route.request().postData() || '{}');
  if (url.includes('/images/generations')) {
    seen.zhipuImage++;
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ created: 1, data: [{ url: 'https://mock.local/pic.png' }] }) });
  }
  seen.zhipuChat++;
  if (body.tools) seen.searchTools++;
  if (body.stream === false) {
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ choices: [{ message: { content: '要点：接口先冻结。[官方公告](https://example.com/notice)' } }] }) });
  }
  return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: DS_STREAM });
});

await page.route('**/mock.local/**', route => route.fulfill({ status: 200, headers: { 'content-type': 'image/png' }, body: Buffer.from(PNG, 'base64') }));

/* ---------- 开跑 ---------- */
console.log('\n[1] 首屏');
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForSelector('#mb-prompt', { timeout: 15000 });
ok('页面加载出输入框', await page.locator('#mb-prompt').isVisible());
ok('标题已改为真实信息', (await page.title()).includes('DeepSeek'));
ok('首屏无脚本报错', errors.length === 0, errors.join(' | '));
await page.screenshot({ path: join(SHOTS, '01-首屏.png') });

console.log('\n[2] API 设置：两个厂商分别填 Key');
await page.locator('.mb-api-entry').click();
await page.waitForSelector('.mb-provider-card', { timeout: 8000 });
const overlayText = await page.locator('.mb-api-overlay').innerText();
ok('出现两张厂商卡片', await page.locator('.mb-provider-card').count() === 2);
ok('卡片分别标注 DeepSeek 与智谱', overlayText.includes('DeepSeek') && overlayText.includes('智谱'));
ok('明确说明 DeepSeek 没有联网与生图', overlayText.includes('DeepSeek 官方接口没有联网搜索'));
const keyInputs = page.locator('.mb-provider-card input[type=password]');
await keyInputs.nth(0).fill('sk-mock-deepseek-key-0001');
await keyInputs.nth(1).fill('mock.zhipu-key-0002');
await page.waitForTimeout(300);

const sess = await page.evaluate(() => sessionStorage.getItem('miaobi-v5-session') || '');
ok('未勾"记住"时 Key 只进会话存储（不落盘）', sess.includes('sk-mock-deepseek-key-0001') && sess.includes('mock.zhipu-key-0002'));
ok('未勾"记住"时 localStorage 里没有明文 Key', !(await page.evaluate(() => localStorage.getItem('miaobi-v5-config') || '')).includes('sk-mock-deepseek-key-0001'));

await page.locator('.mb-provider-card .mb-toggle').nth(0).click();
await page.locator('.mb-provider-card .mb-toggle').nth(1).click();
await page.waitForTimeout(300);
const saved = await page.evaluate(() => localStorage.getItem('miaobi-v5-config') || '');
ok('勾选"记住"后才写入本机存储', saved.includes('sk-mock-deepseek-key-0001') && saved.includes('mock.zhipu-key-0002'));
ok('两个厂商的 Key 分开保存', JSON.parse(saved).providers.deepseek.savedKey !== JSON.parse(saved).providers.zhipu.savedKey);
await page.screenshot({ path: join(SHOTS, '02-API设置.png') });
/* 应用把内部异常显示成提示条而不是抛到控制台，所以必须显式断言没有报错条 */
ok('设置弹层没有内部报错提示', await page.locator('.mb-api-overlay .mb-input-error').count() === 0,
  (await page.locator('.mb-api-overlay .mb-input-error').allInnerTexts()).join(' | '));
await page.locator('.mb-config-actions button', { hasText: '完成' }).click();
await page.waitForTimeout(300);
ok('关掉设置弹层后也没有报错提示', await page.locator('.mb-api-overlay').count() === 0);

console.log('\n[3] 模型选择器：不做假');
await page.locator('.mb-title-menu').click();
await page.waitForSelector('.mb-model-option', { timeout: 8000 });
const picker = await page.locator('.mb-model-overlay').innerText();
ok('列出 DeepSeek V4 Flash', picker.includes('DeepSeek V4 Flash'));
ok('列出 DeepSeek V4 Pro', picker.includes('DeepSeek V4 Pro'));
ok('列出 GLM-4.7-Flash', picker.includes('GLM-4.7-Flash'));
ok('列出 GLM-5.3', picker.includes('GLM-5.3'));
ok('已无 ChatGPT 字样', !picker.includes('ChatGPT'));
ok('已无 Claude 字样', !picker.includes('Claude'));
ok('已无伪造型号 GPT-6 / GPT-5.6', !/GPT-6|GPT-5\.6/.test(picker));
ok('每个模型都露出真实 Model ID', picker.includes('deepseek-v4-flash') && picker.includes('glm-5.3'));
ok('标注了真实厂商', picker.includes('DeepSeek') && picker.includes('智谱 BigModel'));
ok('标明价格或免费档', picker.includes('免费档') || picker.includes('每百万 Token'));
await page.screenshot({ path: join(SHOTS, '03-模型选择器.png') });

console.log('\n[4] 选思考档并发送：推理文本必须出现在界面上');
await page.locator('.mb-model-option', { hasText: 'DeepSeek V4 Flash · 思考' }).first().click();
await page.waitForTimeout(200);
await page.locator('.mb-model-footer button', { hasText: '完成' }).click();
await page.waitForTimeout(300);
await page.locator('#mb-prompt').fill('帮我排一下开发顺序。');
await page.locator('#mb-prompt').press('Enter');
await page.waitForSelector('.mb-answer-content', { timeout: 15000 });
await page.waitForTimeout(500);
const thread = await page.locator('.mb-messages').innerText();
ok('回复正文渲染出来', thread.includes('先做接口层'));
ok('推理文本出现在界面上（v4.2 里是空白）', thread.includes('用户问的是排期问题'), thread.slice(0, 400));
ok('推理区标明是模型返回的原文', thread.includes('模型推理文本'));
ok('执行详情里显示首字延迟', /首字/.test(thread));
ok('请求参数确实开启了思考', seen.lastDeepseekBody?.thinking?.type === 'enabled');
ok('请求限制了输出长度', seen.lastDeepseekBody?.max_tokens === 4096);
ok('请求打到 DeepSeek', seen.deepseekChat === 1);
await page.screenshot({ path: join(SHOTS, '04-思考过程实时可见.png') });

console.log('\n[5] 联网检索');
await page.locator('.mb-icon-btn[aria-label="联网检索"]').click();
await page.waitForTimeout(200);
await page.locator('#mb-prompt').fill('最新的公告是什么？');
await page.locator('#mb-prompt').press('Enter');
await page.waitForTimeout(1500);
const thread2 = await page.locator('.mb-messages').innerText();
ok('先向智谱发起检索', seen.zhipuChat >= 1);
ok('检索请求带 web_search 工具', seen.searchTools >= 1);
ok('检索结果注入后仍由 DeepSeek 回答', seen.deepseekChat === 2);
ok('来源列表渲染出来', thread2.includes('example.com'), thread2.slice(-500));
ok('来源是可点击链接', await page.locator('.mb-answer-sources a').count() >= 1);
await page.screenshot({ path: join(SHOTS, '05-联网检索与来源.png') });

console.log('\n[6] 画图');
await page.locator('.mb-icon-btn[aria-label="联网检索"]').click();
await page.locator('.mb-icon-btn[aria-label="画图"]').click();
await page.waitForTimeout(200);
ok('切到画图后隐藏了写作设置', await page.locator('.mb-engine-btn').count() === 0);
await page.locator('#mb-prompt').fill('一只在屋顶看书的猫');
await page.locator('#mb-prompt').press('Enter');
await page.waitForSelector('.mb-message-images img', { timeout: 15000 });
ok('生图请求打到智谱 images/generations', seen.zhipuImage === 1);
ok('图片渲染出来', await page.locator('.mb-message-images img').count() === 1);
ok('图片带下载入口', await page.locator('.mb-message-images figcaption a').count() === 1);
const imgLabel = await page.locator('.mb-assistant-label').last().innerText();
ok('生图消息抬头是 CogView，不是聊天模型', imgLabel.includes('CogView') && !imgLabel.includes('DeepSeek'), imgLabel);
const imgMeta = await page.locator('.mb-thinking-panel').last().innerText();
ok('生图详情不再假称有推理文本', imgMeta.includes('生图请求不涉及推理文本'), imgMeta.slice(0, 200));
await page.screenshot({ path: join(SHOTS, '06-画图.png') });

console.log('\n[7] 用量面板');
await page.locator('.mb-main-nav button', { hasText: '用量与费用' }).first().click();
await page.waitForTimeout(600);
const usage = await page.locator('.mb-usage-overlay, .mb-dialog').first().innerText();
ok('用量面板不再出现"历史 Claude 通道"', !usage.includes('历史 Claude 通道'), usage.slice(0, 300));
ok('用量面板不再出现"ChatGPT 通道"', !usage.includes('ChatGPT 通道'));
ok('用量面板出现真实厂商名', usage.includes('DeepSeek') || usage.includes('智谱'));
await page.screenshot({ path: join(SHOTS, '07-用量与费用.png') });

console.log('\n[8] 写作场景：选中后必须真的改变发给模型的请求');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.locator('.mb-overlay .mb-overlay-close, .mb-overlay button[aria-label*="关闭"]').first().click().catch(() => {});
await page.waitForTimeout(300);
if (await page.locator('.mb-usage-overlay').count()) {
  await page.locator('.mb-usage-overlay').first().press('Escape');
  await page.waitForTimeout(300);
}
await page.locator('.mb-icon-btn[aria-label="画图"]').click();
await page.waitForTimeout(250);
await page.locator('.mb-scene-chip').click();
await page.waitForSelector('.mb-catalog-grid', { timeout: 8000 });
const tabs = await page.locator('.mb-filter-tabs').innerText();
ok('场景弹层不再出现「通用处理」标签（与文本工具重复）', !tabs.includes('通用处理'), tabs);
const gridText = await page.locator('.mb-catalog-grid').innerText();
ok('场景弹层不再混入文本工具（润色与改写）', !gridText.includes('润色与改写'));
ok('场景按分组呈现', tabs.includes('社交内容') && tabs.includes('职场办公'));
await page.locator('.mb-catalog-card', { hasText: '小红书种草' }).first().click();
await page.waitForTimeout(400);
ok('选中场景后弹层自动收起（不打断输入）', await page.locator('.mb-catalog-overlay').count() === 0);
const chipTitle = await page.locator('.mb-scene-chip').getAttribute('title');
ok('输入框上的场景按钮带上了该场景的指令说明', chipTitle && chipTitle.includes('小红书'), chipTitle);
await page.locator('.mb-scene-chip').click();
await page.waitForSelector('.mb-scene-why', { timeout: 8000 });
const why = await page.locator('.mb-scene-why').innerText();
ok('重新打开时透明展示该场景会怎么要求模型', why.includes('会这样要求模型') && why.includes('小红书'), why.slice(0, 120));
await page.waitForTimeout(700);
await page.screenshot({ path: join(SHOTS, '08-场景可见指令.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

const before = seen.deepseekChat;
await page.locator('#mb-prompt').fill('周末去了一家安静的咖啡店。');
await page.locator('#mb-prompt').press('Enter');
await page.waitForTimeout(1200);
ok('确实发起了新请求', seen.deepseekChat === before + 1);
const sys = seen.lastDeepseekBody.messages[0].content;
ok('场景指令真的进了发给模型的 system 提示词', sys.includes('【写作场景】小红书种草'), sys.slice(0, 160));
ok('提示词带上了该场景的具体要求', sys.includes('话题标签'));
ok('提示词带上了事实底线', sys.includes('不编造') || sys.includes('不编造数据'));
ok('提示词里有写作风格与篇幅', sys.includes('【风格】') && sys.includes('【篇幅】'));

console.log('\n[8b] 换场景 → 请求必须跟着变');
await page.locator('.mb-scene-chip').click();
await page.waitForSelector('.mb-catalog-grid', { timeout: 8000 });
await page.locator('.mb-catalog-card', { hasText: '会议纪要' }).first().click();
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.locator('#mb-prompt').fill('把下面这段会议内容整理一下。');
await page.locator('#mb-prompt').press('Enter');
await page.waitForTimeout(1200);
const sys2 = seen.lastDeepseekBody.messages[0].content;
ok('换成会议纪要后请求内容确实不同', sys2.includes('【写作场景】会议纪要') && !sys2.includes('小红书种草'));
ok('两个场景的提示词不相同', sys !== sys2);

console.log('\n[8c] 写作设置同链路生效');
await page.locator('.mb-icon-btn[aria-label="写作设置"]').click();
await page.waitForSelector('.mb-writing-overlay', { timeout: 8000 });
await page.locator('.mb-style-grid button', { hasText: '正式专业' }).first().click();
await page.locator('.mb-form-row input[aria-label="目标读者"]').fill('投资方');
await page.locator('.mb-writing-overlay select').first().selectOption({ label: '简短 · 50—100字' });
await page.waitForTimeout(200);
await page.locator('.mb-writing-overlay .mb-primary-btn').click();
await page.waitForTimeout(300);
await page.locator('#mb-prompt').fill('再改一版。');
await page.locator('#mb-prompt').press('Enter');
await page.waitForTimeout(1200);
const sys3 = seen.lastDeepseekBody.messages[0].content;
ok('风格改动进了提示词', sys3.includes('【风格】正式专业'));
ok('读者改动进了提示词', sys3.includes('投资方'));
ok('篇幅改动进了提示词', sys3.includes('简短 · 50—100字'));
ok('选「简短」后 max_tokens 被收紧到 640', seen.lastDeepseekBody.max_tokens === 640, String(seen.lastDeepseekBody.max_tokens));
await page.waitForTimeout(400);
await page.screenshot({ path: join(SHOTS, '09-写作设置生效.png') });

console.log('\n[9] 合规标识');
const welcomeFooter = await page.locator('.mb-composer-foot').first().innerText();
ok('输入框下方标注 AI 生成', welcomeFooter.includes('AI 生成'), welcomeFooter);
const labels = await page.locator('.mb-ai-badge').allInnerTexts();
ok('每条回复都带 AI 生成标识', labels.length > 0 && labels.every(t => t.includes('AI 生成')), labels.join(','));
await page.locator('.mb-user-button').click();
await page.waitForSelector('.mb-legal-block', { timeout: 8000 });
const legal = await page.locator('.mb-legal-block').innerText();
ok('设置里有合规与隐私说明', legal.includes('合规与隐私'));
ok('说明了数据会发给厂商', legal.includes('DeepSeek') && legal.includes('智谱'));
ok('提示不要输入敏感信息', legal.includes('不要输入'));
ok('说明了使用边界', legal.includes('使用边界'));
await page.waitForTimeout(700);
await page.screenshot({ path: join(SHOTS, '10-合规与隐私.png') });

console.log('\n[10] 收尾检查');
ok('全程无累积脚本报错', errors.length === 0, errors.join(' | '));
const finalHtml = await page.content();
ok('最终页面里没有 GPT-6 伪造型号', !/GPT-6|GPT-5\.6/.test(finalHtml));

await browser.close();
server.close();

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}通过 ${pass} 项，失败 ${fail} 项\x1b[0m`);
console.log(`截图目录：${SHOTS}\n`);
process.exit(fail === 0 ? 0 : 1);

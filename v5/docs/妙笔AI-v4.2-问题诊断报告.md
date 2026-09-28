# 妙笔 AI v4.2（zhipu 版）问题诊断报告

- 审查对象：`miaobi-v4.2-zhipu(2).html`（485,251 字节 / 3,650 行 / 单文件 React SPA）
- 审查方式：全文静态审查 + 对 api.deepseek.com、open.bigmodel.cn 的 CORS 与接口实测
- 对照仓库：`jackmac566/miaobi-ai` main 分支仍停留在 V1.5.0（最后推送 2026-07-30）

---

## 一、结论速览

| 编号 | 问题 | 严重程度 | 是否你已发现 |
|---|---|---|---|
| P1 | 回复慢（约 2 分钟）——5 个叠加原因 | 高 | 你已发现 |
| P2 | 没有联网搜索、没有生图 | 高 | 你已发现 |
| P3 | 模型身份造假（ChatGPT/Claude 实为同一个智谱模型） | 高 | 你已发现 |
| P4 | "思考过程/摘要"面板永远是空的（死 UI） | 中 | 新发现 |
| P5 | API Key 明文存在 localStorage，且前端直连厂商 | 中 | 新发现 |
| P6 | 模型 ID 校验正则写死 `glm-`，换 DeepSeek 会被直接拒 | 中 | 新发现 |
| P7 | 用量/费用统计不真实，靠手填单价 | 中 | 新发现 |
| P8 | 大量死代码与残留文案（qwen 通道、Cloudflare 残留） | 低 | 新发现 |
| P9 | 产品身份自相矛盾（禁止自称"妙笔 AI"，导出却署名"妙笔 AI"） | 低 | 新发现 |
| P10 | 只能传纯文本附件，不支持图片/视觉输入 | 低 | 新发现 |
| P11 | 无 CSP、无 ErrorBoundary，单文件无源码可维护 | 中 | 新发现 |

---

## 二、P1：为什么慢到 2 分钟（根因拆解）

不是单一原因，是 5 件事叠在一起：

1. **默认模型是免费档**：`lib/connection` 里 `emptyProvider()` 默认 `model:'glm-4.7-flash'`。智谱免费模型排队/限流严重，本身就慢。
2. **思考内容完全不展示**：`directChat` 里收到 `delta.reasoning_content` 时只发一个
   `{type:'reasoning',observed:true}` 标志位，**文字全部丢弃**。模型"想"的 1–2 分钟里，界面是一个空气泡，
   看起来像卡死。这是"两分钟才回复"最直接的观感来源。
3. **完全没有 `max_tokens`**：只有连接测试那一次传了 `max_tokens:512`，正常聊天不限制输出长度。
4. **每轮都塞一大坨控制信息**：`productIdentity()` 长身份提示词 + 场景/风格/长度/强度/偏好/读者/额外要求
   全拼进 system，输入 token 白白变长。
5. **effort 提示词反向加速**：选到 `pro`/`max` 时提示词是"按复杂任务进行充分分析、约束检查与自检后作答"，
   等于主动要求模型多想。
6. 附带问题：超时设成 **310 秒**，所以卡住只能干等 5 分钟，没有超时降级。

**修法**：换 DeepSeek 为主力；显式关闭/降级思考模式（`thinking:{type:'disabled'}` 或把推理过程实时流式显示）；
加 `max_tokens`；system 提示词按场景懒加载（只在写作模式下拼）；超时降到 60–90 秒并给"重试/换模型"出口。

---

## 三、P2：联网搜索与生图（关键事实澄清）

先纠正一个前提：**DeepSeek 官方 API 既没有联网搜索，也没有文生图。**
（DeepSeek 只有 function calling 工具调用，搜索引擎/图像模型要你自己接。）

真正自带这两项能力的是**智谱**：

| 能力 | 实现方式 | 价格 |
|---|---|---|
| 联网搜索 | `tools:[{type:"web_search", web_search:{enable:true, search_engine:"search_pro"}}]` | 0.01–0.05 元/次 |
| 文生图 | `CogView-4` | 0.06 元/次 |
| 文生图（免费） | `CogView-3-Flash` | 免费 |

**所以"生图 + 联网"必须配智谱 Key**，DeepSeek Key 做不了这两件事。
可行的架构：聊天走 DeepSeek（快、便宜），搜索/生图走智谱（两个 Key 都填）。

实测结论（2026-09-28 curl 验证）：`api.deepseek.com` 与 `open.bigmodel.cn`
**都返回了正确的 CORS 预检响应**（`access-control-allow-origin` 回显来源域名），
所以"浏览器直连 + 用户自己填 Key"这条路技术上是通的，可以不部署后端。

---

## 四、P3：模型造假（最该优先修）

`lib/models` 模块：

```js
exports.MODELS = [
  { id:'gpt6',     label:'ChatGPT', vendor:'智谱', apiId:'智谱 GLM', color:'openai' },
  { id:'claude55', label:'Claude',  vendor:'智谱', apiId:'智谱 GLM', color:'claude' },
];
```

`lib/connection` 模块：

```js
function providerForModel(){ return 'glm'; }              // 永远走同一个通道
function readConfig(){ ... return {glm:{...p}, qwen:{...p}}; }  // 两份一模一样的配置
function capabilities(){ return { models:[{id:'gpt6'},{id:'claude55'}] }; }  // 上报给前端的也是假 ID
function displayName(settings){
  if(model==='claude55') return 'Claude';
  return effort==='pro' ? 'GPT-6 Pro' : 'GPT-5.6 sol · '+...;
}
```

即：**"ChatGPT"和"Claude"两个入口，背后是同一个智谱模型、同一个 Key、同一个 endpoint**，
`displayName` 还会凭空造出 "GPT-6 Pro"、"GPT-5.6 sol" 这种不存在的型号。

更矛盾的是：`productIdentity()` 里又写了一长段，要求模型被问到时**"如实说明当前使用智谱 GLM"**。
界面在撒谎、模型在说真话，自相矛盾。

**修法**：模型选择器直接列真实型号 + 真实厂商，例如

| 入口 | 真实型号 | 厂商 |
|---|---|---|
| 快速对话 | `deepseek-v4-flash`（非思考） | DeepSeek |
| 深度思考 | `deepseek-v4-flash`（思考，effort 可调） | DeepSeek |
| 强推理 | `deepseek-v4-pro` | DeepSeek |
| 智谱快速 | `glm-4.7-flash` | 智谱 |
| 智谱旗舰 | `glm-5.3` | 智谱 |

`displayName` 只输出真实 Model ID，不再出现任何 GPT/Claude 字样。

---

## 五、P4–P11：其余问题

- **P4 死 UI**：`ThinkingPanel` 依赖 `summary.delta` 事件，而直连版 `directChat` **从不产生该事件**，
  `summarySource:'provider'` 是假的 → 思考面板永远空白。
- **P5 密钥安全**："记住 API Key"把 Key 明文写入 `localStorage`，任何脚本/扩展可读；且前端持有 Key 直连厂商。
- **P6 换厂商会被正则挡住**：`saveConfig` 与 ApiSettings 都写死了
  `/^glm-[a-z0-9.-]+$/i`，填 DeepSeek Key/模型名会被判"请填写有效的智谱 Model ID"。
- **P7 费用不真实**：`costFor` 依赖用户手填单价，留空即"费用未知"；`/api/usage` 的 `scope` 自己承认
  只统计本浏览器。厂商侧真实扣费看不到。
- **P8 死代码**：`byProvider` 里仍留 `qwen`；用量面板下拉还写"ChatGPT 通道"、"历史 Claude 通道"；
  `accessToken` 导出后从未使用；`providerForModel` 的 qwen 分支不可达。
- **P9 身份矛盾**：system 明确禁止自称"妙笔 AI"，但 `conversationMarkdown` 导出写"妙笔 AI · 本地会话"。
- **P10 无视觉输入**：附件只接受纯文本（最多 3 个 × 20000 字），图片无法理解。
- **P11 工程问题**：单文件 485 KB 无源码；GitHub 仓库 main 停在 V1.5.0，
  v4.2 这次大改**根本不在仓库里**，无法 diff、无法回滚、无法协作。

---

## 六、建议的目标架构

```
浏览器（单 HTML）
  ├─ 模型选择器：列出真实型号（DeepSeek / 智谱）
  ├─ lib/providers  ← 按模型路由到对应厂商
  │    ├─ DeepSeek  api.deepseek.com       聊天（快）
  │    └─ 智谱      open.bigmodel.cn        聊天 / web_search / CogView
  ├─ 流式渲染：正文 + 推理过程（reasoning_content）都实时显示
  ├─ 联网开关：开启时挂 web_search 工具，并展示引用来源
  └─ 生图：识别意图 → 调 CogView → 内联渲染 + 可下载
```

可选增强：加一层 Cloudflare Worker 代理，把 Key 放服务端环境变量，
彻底解决密钥暴露与 CORS 问题（代价是需要部署，不再是"发一个 HTML 就能用"）。

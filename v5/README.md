# 妙笔 AI v5 · DeepSeek / 智谱 直连工作台

单个 HTML 文件、零后端的 AI 对话工作台。你在设置里填自己的 API Key，页面直接调用厂商接口。

**v5 相对 v4.2 的核心变化：不再有任何虚假的身份标注。**

---

## 一、为什么有这个目录

v4.2 是一个 485 KB 的打包产物，没有源码：改不动、没法 diff、没法回滚，
线上出的问题在本地无法复现。所以 v5 换了一种做法：

```
_src/miaobi-v4.2.html      基底（v4.2 原文件，只读，不要改）
src/modules/               改写过的模块源码（纯文本，可读可 diff）
src/patches/               对基底里其它位置的精确字符串补丁
tools/gen_patches.py       从基底逐字提取目标片段，生成补丁
build.py                   把基底 + 模块 + 补丁拼成成品
dist/miaobi-v5.html        成品（要部署/分发的就是这一个文件）
tests/                     自动化测试
docs/                      诊断报告、改造说明、界面截图
```

改任何东西 → 改 `src/` 里的文件 → 跑 `python3 build.py` → 得到新的 `dist/miaobi-v5.html`。
整个过程可追溯、可回滚。

---

## 二、常用命令

```bash
python3 build.py                 # 构建 dist/miaobi-v5.html
python3 build.py --check         # 只校验，不写文件
python3 tools/gen_patches.py     # 改了补丁定义后重新生成 src/patches/*.patch
node tests/logic.test.mjs        # 66 项：模块加载、路由、预算、事件协议
node tests/ui.e2e.mjs            # 45 项：真实浏览器端到端（接口全 mock，不需要真 Key）
```

`build.py` 会在构建时做四件事，任何一项不满足就中止，不产出半成品：

1. 模块数量必须和基底一致（防止替换时吃掉 loader）
2. 每个补丁必须**恰好命中一处**（防止上下文变了以后静默失效）
3. 关键标记必须存在（如 `api.deepseek.com`、`reasoning.delta`、`images/generations`）
4. 旧身份字符串必须清零（`gpt6` / `claude55` / `GPT-6` / `ChatGPT`）

---

## 三、模型清单（界面名字 = 实际发送的 Model ID）

| 界面名称 | 实际 Model ID | 厂商 | 思考 | 单价（入/出，每百万 Token） |
|---|---|---|---|---|
| DeepSeek V4 Flash | `deepseek-v4-flash` | DeepSeek | 默认关闭 | USD 0.14 / 0.28（缓存命中 0.0028） |
| DeepSeek V4 Flash · 思考 | `deepseek-v4-flash` | DeepSeek | 可调 off/low/high/max | 同上（思考不额外加价） |
| DeepSeek V4 Pro | `deepseek-v4-pro` | DeepSeek | low/high/max | USD 0.435 / 0.87 |
| GLM-4.7-Flash | `glm-4.7-flash` | 智谱 | 关闭 | 免费档 |
| GLM-4.7 | `glm-4.7` | 智谱 | off / 开启 | CNY 2 / 8 |
| GLM-5.3 | `glm-5.3` | 智谱 | off / 开启 | 以官网为准 |

**要改模型清单**：编辑 `src/modules/lib/models.js` 里的 `MODELS` 数组，然后 `python3 build.py`。
厂商接口调整过 Model ID 时，改这一个文件就够了。

---

## 四、能力分工（重要）

**DeepSeek 官方接口没有联网搜索，也没有文生图。** 这两项由智谱提供：

| 能力 | 提供方 | 接口 | 计费 |
|---|---|---|---|
| 聊天 | DeepSeek（主）/ 智谱 | `chat/completions` | 按 token |
| 联网检索 | 智谱 | `chat/completions` + `tools:[{type:"web_search"}]` | 0.01–0.05 元/次 |
| 文生图 | 智谱 | `images/generations`（CogView） | 免费档 / 0.06 元/次 |

所以：

- 只填 DeepSeek Key → 聊天可用，联网与画图不可用（会明确提示，不会假装能用）
- 打开联网且当前是 DeepSeek 模型 → 先用智谱检索，拿到来源后再交给 DeepSeek 回答（先检索、后回答，两步都在执行详情里可见）
- 打开联网且当前是智谱模型 → 单次请求直接带 `web_search` 工具

---

## 五、v4.2 的问题与 v5 的修法

### 1. 回复要等两分钟

不是单一原因，是五件事叠在一起：

| # | v4.2 的问题 | v5 的修法 |
|---|---|---|
| 1 | 默认模型是 `glm-4.7-flash`（智谱免费档），高峰期排队 | 默认改为 `deepseek-v4-flash` 且关闭思考 |
| 2 | 收到 `delta.reasoning_content` 只发一个布尔标志位，**推理文字全丢** → 模型思考的 1–2 分钟里界面是空白气泡 | 推理文本按 `reasoning.delta` 实时流式显示；正文开始前发 `reasoning.done` |
| 3 | 正常聊天不传 `max_tokens`，输出长度不受控 | 默认 4096，可在设置里调 |
| 4 | 每轮都拼上完整身份提示词 + 写作场景/风格/长度等控制信息 | 写作控制信息只在写作模式下携带；身份提示词做缓存 |
| 5 | effort 选到 pro/max 时提示词要求模型"充分分析、多步自检" | effort 语义改为真实含义；关闭思考时明确要求直接作答 |
| 附 | 超时设成 310 秒，卡住只能干等 | 降到 120 秒，并且界面实时显示首字延迟 |

### 2. 模型身份造假

v4.2 的 `MODELS` 里两个入口叫 `ChatGPT` 和 `Claude`，但 `providerForModel()` 恒返回 `'glm'`，
两个配置对象是同一份拷贝的浅复制——**两个入口背后是同一个智谱模型、同一个 Key、同一个 endpoint**。
`displayName()` 还会凭空造出 `GPT-6 Pro`、`GPT-5.6 sol` 这种不存在的型号。
而 system 提示词里又要求模型"如实说明使用智谱 GLM"：界面撒谎、模型说真话。

v5：删掉全部假身份。模型列表就是真实型号，每个选项直接展示 `Model ID：deepseek-v4-flash`
和真实厂商；消息抬头、用量面板、导出内容全部按真实厂商标注。
生图消息会显示 `CogView-3-Flash（智谱 BigModel）`，不会被挂上聊天模型的名字。

### 3. 另外修掉的

- **死 UI**：`ThinkingPanel` 依赖 `summary.delta`，直连模式下从不产生该事件 → 面板永远空白。改为显示真实的推理文本、执行步骤、首字延迟、检索来源。
- **换厂商会被正则锁死**：原来写死 `/^glm-[a-z0-9.-]+$/i`，填 DeepSeek Key 会被判"无效 Model ID"。已移除，改为双厂商独立配置。
- **Key 落盘策略**：不勾"记住"时只进 sessionStorage；勾了才写 localStorage。两个厂商的 Key 分开保存。
- **费用估算**：改为按内置的厂商公开价目表计算，并且正确处理缓存命中的 token（命中价约为未命中的 1/50），不再依赖手填单价。
- **残留死代码**：`byProvider` 里的 `qwen`、用量面板里的"历史 Claude 通道"、"ChatGPT 通道"、未使用的 `accessToken` 全部清掉。
- **接口校验**：`directChat` 补上空消息、超长正文、无效 effort 的校验，并且校验放在记账之前（无效请求不留用量记录）。

---

## 六、已知限制（没有藏起来的部分）

1. **API Key 存在浏览器里**。这是"单 HTML 零部署"这个形态的固有代价：任何能读到这个浏览器的脚本或扩展都能拿到 Key。如果介意，需要加一层服务端代理，把 Key 放到服务端环境变量。
2. **联网检索有两次往返**。当前是 DeepSeek 模型 + 开联网时，要先让智谱检索再交给 DeepSeek 回答，比纯聊天慢。智谱自己的模型可以单次完成。
3. **费用是估算**。按厂商公开价目表在本地算，和厂商账单可能有细微差异，以账单为准。
4. **生图链接有效期有限**。CogView 返回的是临时 URL，界面上有下载按钮，请及时保存。
5. **不支持图片输入**。附件目前只接受纯文本（最多 3 个 × 20000 字）。
6. 模型 ID 会随厂商调整。如果某个型号报错，改 `src/modules/lib/models.js` 里对应的 `apiModel` 重新构建即可。

---

## 七、目录说明

```
build.py                     构建脚本
tools/gen_patches.py         补丁生成器（从基底逐字提取，保证精确匹配）
src/modules/lib/             models / connection / chat-api / types 四个核心模块
src/modules/components/      ApiSettings / Composer / ModelPicker / ThinkingPanel / ProviderLogo
src/patches/                 12+ 处精确补丁（含新增样式）
tests/logic.test.mjs         Node 逻辑测试（接口 mock）
tests/ui.e2e.mjs             Playwright 端到端测试（接口 mock，含截图）
docs/妙笔AI-v4.2-问题诊断报告.md
docs/妙笔AI-v5-改造说明.md
docs/screenshots/            端到端测试自动产出的界面截图
_src/miaobi-v4.2.html        基底，只读
dist/miaobi-v5.html          成品
```

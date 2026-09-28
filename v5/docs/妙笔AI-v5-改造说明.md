# 妙笔 AI v4.2 → v5 改造说明

改造日期：2026-09-28
基底：`_src/miaobi-v4.2.html`（485,251 字节 / 3,650 行 / 19 个模块）
成品：`dist/miaobi-v5.html`（506,630 字节）

---

## 一、改动的文件清单

### 整体重写的模块（9 个）

| 模块 | 改动要点 |
|---|---|
| `lib/connection` | 单厂商 → 双厂商路由；流式透传推理文本；接联网检索与 CogView 生图；真实价目表计费；补接口校验 |
| `lib/models` | 删掉 ChatGPT / Claude 假身份；改为 6 个真实型号；新增 `reasoningParam`（按厂商映射思考参数）、`labelForMeta`（生图/聊天分流标注） |
| `lib/chat-api` | 请求体带 `webSearch`；写作控制信息按需携带；新增 `imageStream` |
| `lib/types` | `DEFAULT_SETTINGS` 换成真实模型 id，新增 `webSearch` / `imageMode` |
| `components/ApiSettings` | 双 Key 独立配置 + 分别测试连接；去掉写死的 `glm-` 校验；新增检索精度 / 生图模型 / 输出上限 |
| `components/ModelPicker` | 按厂商分组，露出真实 Model ID 与单价；档位按模型能力给（免费档只有"关闭"） |
| `components/ThinkingPanel` | 从"永远空白的假摘要"改为真实推理文本流 + 执行步骤 + 首字延迟 + 检索来源 |
| `components/Composer` | 新增联网 / 画图两个开关；底部提示改为当前真实 Model ID |
| `components/ui/ProviderLogo` | 不再使用 OpenAI / Anthropic 的品牌图形，改为自绘字母徽标（DS / GLM） |

### 精确补丁（17 处，见 `src/patches/`）

- `01-meta` 标题与描述改为真实信息
- `02-css` 新增 v5 样式（厂商卡片、推理文本区、来源列表、图片区）
- `10-runtime-vars` 运行期新增 `reasoning` / `sources` 变量；**超时 310s → 120s**
- `11-event-branches` 事件分支：推理流、检索来源、图片
- `12-route-image` 生图走独立接口
- `13-ready-check` 发送前按所选模型的真实厂商校验 Key
- `14-composer-props` 输入框接线联网 / 画图开关
- `15-message-media` 消息里渲染图片与来源
- `16-timeout-text` 超时文案与新的 2 分钟上限一致
- `17-done-latency` `done` 事件把首字延迟接进元数据
- `18-storage-meta` 存储白名单补上延迟 / 来源 / 图片（否则刷新就丢）
- `19-meta-branch` `meta` 事件补上厂商与任务类型
- `20-storage-settings` 存储校验支持新模型清单与两个新开关
- `21/22/23-usage-*` 用量面板的厂商名改为 DeepSeek / 智谱
- `24-message-label` 消息抬头按真实模型显示（否则 CogView 画的图会挂上聊天模型的名字）

---

## 二、测试结果

```
node tests/logic.test.mjs   → 通过 66 项，失败 0 项
node tests/ui.e2e.mjs       → 通过 45 项，失败 0 项
```

逻辑测试覆盖：模块注册表加载、模型路由、思考参数按厂商映射、Key 保存、流式推理透传、
首字延迟、费用计算（含缓存命中折扣）、联网两步链路、生图、错误码转换、用量数据结构，
以及**跨模块调用面全量对账**（57 处调用，凡是 `<别名>.<名字>` 被用到的都必须真的导出）。

端到端测试在真实 Chromium 里跑，用路由拦截把 DeepSeek 与智谱的接口全部 mock，
覆盖：首屏、双 Key 保存（含"记住"与不"记住"两条存储路径）、模型选择器不含任何假身份、
思考档发送后推理文本出现在界面上、联网后来源列表渲染、画图后图片渲染、
用量面板无残留旧厂商名、全程无脚本报错。

### 改造过程中发现并修掉的 5 个自身缺陷

这些都不是 v4.2 的问题，是我这次改出来的，记在这里以便回溯：

1. `build.py` 的模块切分把注册表最后一个模块吃到了 loader，导致产物被截断
   → 结束边界改为「模块头之后第一个行首为 `},` 的行」
2. `saveConfig` 的 providers 被 `current` 覆盖，用户填的 Key 永远存不进去
   → 改为逐厂商合并
3. 漏导出 `saveConfig`、`capabilities` → 界面点保存报 "is not a function"
   → 补导出，并新增跨模块调用面自动对账
4. `done` 事件没把首字延迟接进元数据 → 详情面板显不出来
5. 生图消息被挂上聊天模型的名字 → 新增 `labelForMeta` 分流

---

## 三、如何验证

```bash
cd v5
python3 build.py              # 重新构建
node tests/logic.test.mjs     # 逻辑测试
node tests/ui.e2e.mjs         # 浏览器测试（自动产出 docs/screenshots/*.png）
```

拿到 `dist/miaobi-v5.html` 后，直接用浏览器打开或丢到任意静态托管上，
在「API 设置」里填 Key 即可。测试里用的是 mock，**真实效果需要用你自己的 Key 跑一次**。

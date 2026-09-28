#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 _src/miaobi-v4.2.html 里逐字取出目标片段，生成 src/patches/*.patch。

补丁文件格式：第一段是「原文」，单独一行 ===== 之后是「替换为」。
build.py 会校验必须恰好匹配一处，匹配不到就报错中止——不会静默失效。
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "_src" / "miaobi-v4.2.html"
OUTDIR = ROOT / "src" / "patches"
OUTDIR.mkdir(parents=True, exist_ok=True)

lines = BASE.read_text(encoding="utf-8").split("\n")


def L(a, b=None):
    """取原文第 a..b 行（1-based，含两端），保持逐字一致。"""
    b = a if b is None else b
    return "\n".join(lines[a - 1:b])


NEW_CSS = """/* ===== 妙笔 v5 新增样式 ===== */
.mb-provider-card{margin-top:14px;padding:14px;border:1px solid var(--mb-line);border-radius:12px;display:flex;flex-direction:column;gap:10px}
.mb-provider-card>header{display:flex;align-items:center;gap:8px}
.mb-provider-card>header b{font-size:13px}
.mb-provider-card>header i{width:7px;height:7px;border-radius:50%;background:#5f5f5f;flex:none}
.mb-provider-card>header i.configured{background:#3ecf8e}
.mb-provider-card>header small{margin-left:auto;font-size:11px;color:var(--mb-muted);text-align:right}
.mb-provider-actions{display:flex;justify-content:flex-end}
.mb-advanced-fields{display:flex;flex-direction:column;gap:10px}
.mb-model-group{margin-bottom:16px}
.mb-model-group-head{display:flex;align-items:center;gap:8px;padding:0 4px 6px}
.mb-model-group-head b{font-size:13px}
.mb-model-group-head small{margin-left:auto;font-size:11px;color:var(--mb-muted)}
.mb-model-option-copy em code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;background:var(--mb-input);padding:1px 5px;border-radius:4px}
.mb-reasoning{margin-top:12px;border:1px solid var(--mb-line);border-radius:10px;overflow:hidden}
.mb-reasoning-head{display:flex;align-items:baseline;gap:8px;padding:9px 12px;background:var(--mb-raised)}
.mb-reasoning-head b{font-size:12px}
.mb-reasoning-head small{margin-left:auto;font-size:11px;color:var(--mb-muted)}
.mb-reasoning-body{max-height:300px;overflow:auto;padding:10px 12px;background:var(--mb-panel)}
.mb-reasoning-body pre{margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.9;color:var(--mb-sub);font-family:inherit}
.mb-search-sources{margin-top:14px}
.mb-search-sources b{font-size:12px}
.mb-search-sources ul{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:7px}
.mb-search-sources li{font-size:12px;display:flex;gap:8px;align-items:baseline;min-width:0}
.mb-search-sources a{color:#d3a080;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mb-search-sources a:hover{text-decoration:underline}
.mb-search-sources span{font-size:11px;color:var(--mb-muted);flex:none}
.mb-answer-sources{margin-top:14px;border-top:1px solid var(--mb-line);padding-top:10px}
.mb-answer-sources b{font-size:12px}
.mb-answer-sources ul{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:7px}
.mb-answer-sources li{font-size:12px;display:flex;gap:8px;align-items:baseline;min-width:0}
.mb-answer-sources a{color:#d3a080;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mb-answer-sources a:hover{text-decoration:underline}
.mb-answer-sources span{font-size:11px;color:var(--mb-muted);flex:none}
.mb-message-images{margin-top:14px;display:flex;flex-direction:column;gap:12px}
.mb-message-images figure{margin:0;border:1px solid var(--mb-line);border-radius:12px;overflow:hidden;background:var(--mb-panel)}
.mb-message-images img{display:block;width:100%;max-height:520px;object-fit:contain;background:#1a1a1a}
.mb-message-images figcaption{display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:11px;color:var(--mb-muted)}
.mb-message-images figcaption a{margin-left:auto;color:#d3a080;text-decoration:none}
.mb-icon-btn.is-active{color:#d3a080}
"""

PATCHES = [
    # ---- 头部：标题与描述改成真实信息 ----
    ("01-meta",
     '<meta name="description" content="妙笔 API 直连工作台。单 HTML 可填写 API Key、URL 与 Model ID；无 API 不回答。"><title>妙笔 · 智谱 API 工作台</title>',
     '<meta name="description" content="妙笔 AI · 浏览器直连 DeepSeek 与智谱的多模型工作台，支持联网检索与 CogView 生图；界面标注的即真实调用模型。"><title>妙笔 AI · DeepSeek / 智谱 直连工作台</title>'),

    # ---- 追加 v5 样式 ----
    ("02-css", "\n</style></head><body>", "\n" + NEW_CSS + "</style></head><body>"),

    # ---- 运行期变量：新增 reasoning / sources；超时 310s -> 120s ----
    ("10-runtime-vars",
     L(1013, 1014),
     "        let text = '', reasoning = '', summary = '', sources = [], currentMeta = meta, ended = false, timedOut = false;\n"
     "        const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 120000);"),

    # ---- 事件分支：真实推理文本流 + 检索来源 + 图片 ----
    ("11-event-branches",
     L(1021, 1029),
     "            else if(e.type==='reasoning.start') currentMeta={...currentMeta,reasoningObserved:true,reasoningStarted:currentMeta.reasoningStarted||Date.now()};\n"
     "            else if(e.type==='reasoning.delta'){reasoning+=(e.delta||'');currentMeta={...currentMeta,reasoningObserved:true,reasoningText:reasoning};}\n"
     "            else if(e.type==='reasoning.done') currentMeta={...currentMeta,reasoningFinished:Date.now()};\n"
     "            else if(e.type==='search.results'){sources=e.results||[];currentMeta={...currentMeta,sources};}\n"
     "            else if(e.type==='image') currentMeta={...currentMeta,images:e.images||[],imageModel:e.model,imagePrompt:e.prompt};\n"
     "            else if (e.type === 'status' && e.label) {\n"
     "                if (!currentMeta.steps.some(s => s.id === e.id))\n"
     "                    currentMeta = { ...currentMeta, steps: [...currentMeta.steps, { id: e.id || (0, types_1.uid)(), label: e.label, at: Date.now() }] };\n"
     "            }"),

    # ---- 生图走独立接口 ----
    ("12-route-image",
     L(1041, 1047),
     "        try {\n"
     "            if (settings.imageMode)\n"
     "                await (0, chat_api_1.imageStream)({ prompt: prepared.body.messages.at(-1).content, imageModel: connection.readDirectConfig().imageModel, requestId: token, size: '1024x1024' }, controller.signal, event);\n"
     "            else\n"
     "                await (0, chat_api_1.chatStream)(prepared.body, controller.signal, event);\n"
     "            if (request.current?.id !== token)\n"
     "                return;\n"
     "            if (settings.imageMode) {\n"
     "                if (!currentMeta.images || !currentMeta.images.length)\n"
     "                    throw new api_1.ApiError('没有收到图片。', 502, 'EMPTY_IMAGE');\n"
     "            }\n"
     "            else if (!ended || !text.trim())\n"
     "                throw new api_1.ApiError('服务没有返回完整的可读回复。', 502, 'EMPTY_RESPONSE');\n"
     "        }"),

    # ---- 发送前的可用性检查：按所选模型的真实厂商判断 ----
    ("13-ready-check",
     L(1069),
     "        const ready=connection.modelReady(active.settings.model);\n"
     "        if(!ready.ok){setError(ready.reason+' 填写后会自动保存。');openModal('api');return;}\n"
     "        if((active.settings.imageMode||active.settings.webSearch)&&!connection.searchReady()){setError((active.settings.imageMode?'画图':'联网检索')+'由智谱提供，请先填写智谱 API Key，或关掉该开关。');openModal('api');return;}"),

    # ---- 输入框接线：联网 / 画图开关 ----
    ("14-composer-props",
     L(1183, 1184),
     L(1183) + "\n"
     "            setError(''); }, onSend: () => send(), onStop: stop, busy: !!busy && busy.cid === active.id, disabled: !!busy && busy.cid !== active.id, attachments: activeFiles, onFiles: f => { void addFiles(f); }, onRemove: id => setFiles(s => ({ ...s, [active.id]: (s[active.id] || []).filter(a => a.id !== id) })), settings: active.settings, onFeature: patch => updateSettings(patch), searchReady: connection.searchReady(), imageReady: connection.searchReady(), onSettings: () => openModal('writing'), onScenes: () => openModal('scenes'), onModel: () => openModal('service'), preview: preview, error: error, temporary: !!active.temporary, home: isHome, limit: limit });"),

    # ---- 消息里渲染图片与来源 ----
    ("15-message-media",
     L(1375, 1377),
     L(1375) + "\n" + L(1376) + "\n" + L(1377) + "\n"
     "                            (function(){ var mm = (0, types_1.replyMeta)(m); return (mm && mm.images && mm.images.length) ? React.createElement(\"div\", { className: \"mb-message-images\" }, mm.images.map(function(img, i){ return React.createElement(\"figure\", { key: i },\n"
     "                                React.createElement(\"img\", { src: img.url, alt: mm.imagePrompt || '生成的图片', loading: \"lazy\" }),\n"
     "                                React.createElement(\"figcaption\", null,\n"
     "                                    React.createElement(\"span\", null, mm.imageModel || '图片'),\n"
     "                                    React.createElement(\"a\", { href: img.url, target: \"_blank\", rel: \"noreferrer noopener\", download: 'miaobi-' + i + '.png' }, '下载'))); })) : null; })(),\n"
     "                            (function(){ var mm = (0, types_1.replyMeta)(m); return (mm && mm.sources && mm.sources.length) ? React.createElement(\"div\", { className: \"mb-answer-sources\" },\n"
     "                                React.createElement(\"b\", null, '来源'),\n"
     "                                React.createElement(\"ul\", null, mm.sources.map(function(s){ return React.createElement(\"li\", { key: s.url },\n"
     "                                    React.createElement(\"a\", { href: s.url, target: \"_blank\", rel: \"noreferrer noopener\" }, s.title || s.url),\n"
     "                                    s.site && React.createElement(\"span\", null, s.site)); }))) : null; })(),"),

    # ---- 存储校验：支持新模型清单与新增的两个开关 ----
    ("20-storage-settings",
     "return { model, effort: (0, models_1.normalizeEffort)(model, v.effort), modelEfforts: { gpt6: (0, models_1.normalizeEffort)('gpt6', v.modelEfforts?.gpt6), claude55: (0, models_1.normalizeEffort)('claude55', v.modelEfforts?.claude55) }, intent:",
     "return { model, effort: (0, models_1.normalizeEffort)(model, v.effort), modelEfforts: (0, models_1.safeModelEfforts)(v.modelEfforts), webSearch: v.webSearch === true, imageMode: v.imageMode === true, showPanel: v.showPanel !== false, intent:"),

    # ---- 用量面板：厂商名改为真实的两家 ----
    ("21-usage-provider-label",
     L(2048),
     "                React.createElement(\"span\", null, p === 'deepseek' ? 'DeepSeek' : p === 'zhipu' ? '智谱 BigModel' : p),"),

    ("22-usage-provider-option",
     L(2088),
     "                    React.createElement(\"option\", { value: \"deepseek\" }, \"全部厂商\"),"),

    ("23-usage-record-provider",
     L(2125),
     "                            (r.provider === 'deepseek' ? 'DeepSeek' : r.provider === 'zhipu' ? '智谱 BigModel' : r.provider),"),

    # ---- 超时文案与新的 2 分钟上限一致 ----
    ("16-timeout-text",
     L(1051),
     "            const message = timedOut ? '等待超过 2 分钟，已请求中止。已收到的内容保留，实际用量以服务商记录为准。可以换更快的模型（例如 DeepSeek V4 Flash 且关闭思考）重试。' : e instanceof Error ? e.message : '聊天服务暂时不可用。';"),

    # ---- done 事件里把首字延迟与总耗时接进元数据（否则详情面板显不出来） ----
    ("17-done-latency",
     L(1034, 1036),
     "            else if (e.type === 'done') {\n"
     "                ended = true;\n"
     "                currentMeta={...currentMeta,usage:e.usage??currentMeta.usage,cost:e.cost??currentMeta.cost,reasoningObserved:e.reasoningObserved===true,latency:e.latency??currentMeta.latency};"),

    # ---- 存储白名单：延迟、检索来源、图片要能落盘（否则刷新就丢） ----
    ("18-storage-meta",
     "reasoningObserved:m.reasoningObserved===true,",
     "reasoningObserved:m.reasoningObserved===true, task:isString(m.task)?m.task.slice(0,20):undefined, latency:m.latency&&typeof m.latency==='object'?{firstTokenMs:Number(m.latency.firstTokenMs)||null,totalMs:Number(m.latency.totalMs)||null}:undefined,"
     " sources:Array.isArray(m.sources)?m.sources.filter(s=>s&&isString(s.url)).slice(0,12).map(s=>({url:s.url.slice(0,600),title:String(s.title||'').slice(0,200),site:String(s.site||'').slice(0,100)})):undefined,"
     " images:Array.isArray(m.images)?m.images.filter(i=>i&&isString(i.url)).slice(0,4).map(i=>({url:i.url.slice(0,2000)})):undefined,"
     " imageModel:isString(m.imageModel)?m.imageModel.slice(0,60):undefined, imagePrompt:isString(m.imagePrompt)?m.imagePrompt.slice(0,500):undefined,"),

    # ---- meta 事件里补上厂商与任务类型 ----
    ("19-meta-branch",
     L(1018, 1019),
     "            if (e.type === 'meta')\n"
     "                currentMeta = { ...currentMeta, apiModel: e.model, provider:e.provider, vendor:e.vendor, task:e.task, requestId:e.requestId, plan:e.plan, effort:e.effort||currentMeta.effort, executionMode: e.executionMode||currentMeta.executionMode };"),

    # ---- 消息抬头必须按真实模型显示（否则 CogView 画的图会挂上聊天模型的名字） ----
    ("24-message-label",
     L(1370),
     "                                React.createElement(\"b\", null, (0, models_1.labelForMeta)((0, types_1.replyMeta)(m) || m.requestSettings || types_1.DEFAULT_SETTINGS)),"),
]


def main():
    wrote = []
    for name, old, new in PATCHES:
        # 自检：原文必须能在基底里唯一命中
        whole = "\n".join(lines)
        cnt = whole.count(old)
        if cnt != 1:
            raise SystemExit(f"[{name}] 目标片段在基底中命中 {cnt} 次，需要更精确的片段")
        path = OUTDIR / f"{name}.patch"
        path.write_text(old + "\n=====\n" + new, encoding="utf-8")
        wrote.append(name)
    print(f"已生成 {len(wrote)} 个补丁：")
    for w in wrote:
        print("  -", w)


if __name__ == "__main__":
    main()

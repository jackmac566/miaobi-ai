"components/Composer":function(module,exports,require){

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Composer;
const React = require("react");
const react_1 = require("react");
const Icon_1 = __importDefault(require("./ui/Icon"));
const ProviderLogo_1 = __importDefault(require("./ui/ProviderLogo"));
const models_1 = require("../lib/models");
const Metal=require("./ui/liquid-metal-button").default;
const catalog_1 = require("../lib/catalog");

function Composer({ value, onChange, onSend, onStop, busy, attachments, onFiles, onRemove, settings, onSettings, onScenes, onModel, preview, error, temporary, home, limit, disabled, onFeature, searchReady, imageReady }) {
    const input = (0, react_1.useRef)(null);
    const picker = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => { if (input.current) {
        input.current.style.height = 'auto';
        input.current.style.height = Math.min(home ? 190 : 150, Math.max(home ? 76 : 52, input.current.scrollHeight)) + 'px';
    } }, [value, home]);
    (0, react_1.useEffect)(() => { const handle = () => input.current?.focus(); window.addEventListener('miaobi-focus-composer', handle); return () => window.removeEventListener('miaobi-focus-composer', handle); }, []);
    const scene = (0, catalog_1.getScene)(settings.scene);
    const chars = value.length + attachments.reduce((n, a) => n + a.text.length, 0);
    const imageMode = settings.imageMode === true;
    const placeholder = imageMode
        ? '描述你想生成的画面，例如：一只坐在屋顶上看书的猫，暖色调，胶片质感'
        : scene?.tool ? `粘贴需要${scene.name}的内容，或添加文本文件…`
            : settings.intent === 'chat' ? '发送消息，或粘贴长文本、添加文件…' : '有什么想写的？也可以粘贴长文或添加文本文件…';
    return React.createElement("div", { className: `mb-composer-wrap ${home ? 'is-home' : ''}` },
        error && React.createElement("div", { className: "mb-input-error", role: "alert" },
            React.createElement(Icon_1.default, { name: "info", size: 16 }),
            React.createElement("span", null, error)),
        temporary && React.createElement("div", { className: "mb-temp-note" },
            React.createElement(Icon_1.default, { name: "temporary", size: 15 }),
            "不保存本地历史；请求内容会直接发往你所选的厂商。"),
        React.createElement("div", { className: `mb-composer ${busy ? 'is-busy' : ''}`, onDrop: e => { e.preventDefault(); if (!imageMode) onFiles(e.dataTransfer.files); }, onDragOver: e => e.preventDefault() },
            attachments.length > 0 && React.createElement("div", { className: "mb-attachments" }, attachments.map(a => React.createElement("div", { className: "mb-attachment", key: a.id },
                React.createElement("span", { className: "mb-file-icon" },
                    React.createElement(Icon_1.default, { name: "file", size: 20 })),
                React.createElement("span", null,
                    React.createElement("b", null, a.name),
                    React.createElement("small", null,
                        a.text.length.toLocaleString(),
                        " 字 · 本地文本")),
                React.createElement("button", { onClick: () => onRemove(a.id), "aria-label": `移除附件 ${a.name}` },
                    React.createElement(Icon_1.default, { name: "close", size: 14 }))))),
            React.createElement("textarea", { ref: input, id: "mb-prompt", "aria-label": "消息输入框", value: value, onChange: e => onChange(e.target.value), placeholder: placeholder, rows: home ? 3 : 2, onKeyDown: e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    e.preventDefault();
                    if (!busy && !disabled)
                        onSend();
                } } }),
            React.createElement("div", { className: "mb-composer-toolbar" },
                React.createElement("div", { className: "mb-composer-left" },
                    !imageMode && React.createElement("button", { className: "mb-icon-btn", onClick: () => picker.current?.click(), "aria-label": "添加文本文件", title: "添加文本文件 · TXT / MD / CSV / JSON" },
                        React.createElement(Icon_1.default, { name: "plus", size: 22 })),
                    React.createElement("button", { className: `mb-icon-btn ${settings.webSearch ? 'is-active' : ''}`, onClick: () => onFeature({ webSearch: !settings.webSearch, imageMode: false }), "aria-label": "联网检索", "aria-pressed": !!settings.webSearch, title: searchReady ? "联网检索 · 由智谱 web_search 提供" : "联网检索需要先填写智谱 API Key" },
                        React.createElement(Icon_1.default, { name: "search", size: 20 })),
                    React.createElement("button", { className: `mb-icon-btn ${imageMode ? 'is-active' : ''}`, onClick: () => onFeature({ imageMode: !imageMode, webSearch: false }), "aria-label": "画图", "aria-pressed": imageMode, title: imageReady ? "画图 · 由智谱 CogView 提供" : "画图需要先填写智谱 API Key" },
                        React.createElement(Icon_1.default, { name: "wand", size: 20 })),
                    !imageMode && React.createElement("button", { className: `mb-icon-btn ${settings.style !== '自然松弛' ? 'is-active' : ''}`, onClick: onSettings, "aria-label": "写作设置", title: "写作风格、篇幅与输出偏好" },
                        React.createElement(Icon_1.default, { name: "sliders", size: 20 })),
                    React.createElement("span", { className: "mb-toolbar-divider" }),
                    imageMode
                        ? React.createElement("span", { className: "mb-scene-chip" },
                            React.createElement(Icon_1.default, { name: "wand", size: 14 }),
                            React.createElement("span", null, settings.imageModel === 'cogview-4' ? 'CogView-4 画图' : 'CogView-3-Flash 画图'))
                        : React.createElement("button", { className: "mb-scene-chip", onClick: onScenes, title: scene ? `${scene.name}：${scene.instruction}` : "选择写作场景" },
                            React.createElement(Icon_1.default, { name: scene?.icon || 'spark', size: 14 }),
                            React.createElement("span", null, scene?.name || (settings.intent === 'chat' ? '自由对话' : '自由创作')),
                            React.createElement(Icon_1.default, { name: "chevron", size: 12 }))),
                React.createElement("div", { className: "mb-composer-right" },
                    !imageMode && React.createElement("button", { className: "mb-engine-btn", onClick: onModel, title: "选择模型与思考强度", "aria-label": "选择模型与思考强度" },
                        React.createElement(ProviderLogo_1.default, { model: settings.model, size: 18 }),
                        React.createElement("span", null, (0, models_1.displayName)(settings)),
                        settings.effort !== 'off' && React.createElement("b", { className: "mb-composer-effort" }, models_1.EFFORT_LABELS[settings.effort]),
                        React.createElement(Icon_1.default, { name: "chevron", size: 13 })),
                    busy ? React.createElement("button", { className: "mb-send is-stop", onClick: onStop, "aria-label": "停止生成", title: "停止生成" },
                        React.createElement(Icon_1.default, { name: "stop", size: 18 })) : React.createElement(Metal, { viewMode:"icon", className: "mb-send", onClick: onSend, disabled: disabled || (!value.trim() && !attachments.length), "aria-label": "发送消息", title: "发送消息" },
                        React.createElement(Icon_1.default, { name: "arrow", size: 21 })))),
            React.createElement("input", { ref: picker, type: "file", accept: ".txt,.md,.markdown,.csv,.json", multiple: true, hidden: true, "aria-label": "文件选择", onChange: e => { if (e.target.files)
                    onFiles(e.target.files); e.target.value = ''; } })),
        React.createElement("div", { className: "mb-composer-foot" },
            React.createElement("span", null,
                imageMode ? 'AI 生成图片 · 智谱 CogView · 链接有效期有限，请及时下载'
                    : settings.webSearch ? 'AI 生成 · 已联网检索（智谱）· 请核对来源后再引用'
                        : 'AI 生成 · ' + (0, models_1.modelOf)(settings.model).apiModel + ' · 请核对后使用'),
            React.createElement("span", null, chars > 0 ? `${chars.toLocaleString()} / ${limit.toLocaleString()} 字` : 'Enter 发送 · Shift + Enter 换行')));
}

},

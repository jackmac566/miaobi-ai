"components/ThinkingPanel":function(module,exports,require){

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k2);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ThinkingPanel;
const React = __importStar(require("react"));
const react_1 = require("react");
const Icon_1 = __importDefault(require("./ui/Icon"));
const types_1 = require("../lib/types");
const models_1 = require("../lib/models");

function secs(from, to) { return Math.max(0, (to - from) / 1000); }

function ThinkingPanel({ message }) {
    const meta = (0, types_1.replyMeta)(message), live = message.status === 'pending';
    const [open, setOpen] = (0, react_1.useState)(() => !!(meta?.summaryRequested ?? meta?.showPanel));
    const [now, setNow] = (0, react_1.useState)(Date.now());
    const id = (0, react_1.useId)();
    const box = (0, react_1.useRef)(null);
    const stick = (0, react_1.useRef)(true);

    (0, react_1.useEffect)(() => { if (!live) return; const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, [live]);
    (0, react_1.useEffect)(() => {
        if (open && box.current && stick.current && live) box.current.scrollTop = box.current.scrollHeight;
    });

    if (!meta) return null;

    const reasoning = meta.reasoningText || '';
    const isImage = meta.task === 'image';
    const thinking = meta.reasoningObserved && !meta.reasoningFinished;
    const elapsed = secs(meta.started, meta.finished || now);
    const label = isImage
        ? (live ? '正在生成图片…' : message.status === 'done' ? '图片已生成' : '图片生成未完成')
        : live
            ? (thinking ? '模型正在思考 · 推理文本实时显示' : (reasoning ? '正在接收回答' : '正在等待模型响应'))
            : message.status === 'done' ? '调用已完成'
                : message.status === 'stopped' ? '调用已停止' : '调用未完成';

    const onScroll = e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; };

    return React.createElement("div", { className: `mb-thinking-panel ${live ? 'is-live' : ''} ${open ? 'is-open' : ''}`, "data-reasoning-source": "provider-stream" },
        React.createElement("button", { className: "mb-thinking-toggle", onClick: () => setOpen(v => !v), "aria-expanded": open, "aria-controls": id, "aria-label": "展开或收起执行详情" },
            React.createElement("span", { className: `mb-thinking-orbit ${live ? 'animating' : ''}`, "aria-hidden": "true" }, live ? React.createElement(React.Fragment, null,
                React.createElement("i", null),
                React.createElement("i", null),
                React.createElement("i", null)) : React.createElement(Icon_1.default, { name: message.status === 'done' ? 'check' : 'info', size: 15 })),
            React.createElement("b", { className: live ? 'mb-shimmer-text' : '' }, label),
            React.createElement("span", { className: "mb-thinking-time", title: "从提交开始的总耗时，包含网络等待" }, elapsed.toFixed(1), "s"),
            meta.latency && meta.latency.firstTokenMs != null && React.createElement("span", { className: "mb-thinking-effort", title: "从发出请求到收到第一个 token" },
                "首字 ", (meta.latency.firstTokenMs / 1000).toFixed(1), "s"),
            !isImage && React.createElement("span", { className: "mb-thinking-effort" }, models_1.EFFORT_LABELS[meta.effort] || meta.effort),
            isImage && React.createElement("span", { className: "mb-thinking-effort" }, models_1.IMAGE_MODELS[meta.apiModel] ? models_1.IMAGE_MODELS[meta.apiModel].label : '生图'),
            React.createElement(Icon_1.default, { name: "chevron", size: 14 })),
        open && React.createElement("div", { className: "mb-thinking-content", id: id },
            React.createElement("div", { className: "mb-thinking-source" },
                React.createElement("span", { className: "mb-tiny-dot" }),
                "真实执行事件",
                React.createElement("small", null, "耗时包含网络等待，不等于纯思考时长")),
            React.createElement("ol", { className: "mb-trace-steps" }, (meta.steps || []).map((s, i) => React.createElement("li", { key: s.id },
                React.createElement("span", { className: live && i === (meta.steps || []).length - 1 ? 'current' : '' }, live && i === (meta.steps || []).length - 1 ? React.createElement("i", null) : React.createElement(Icon_1.default, { name: "check", size: 10 })),
                React.createElement("p", null, s.label),
                React.createElement("time", null, secs(meta.started, s.at).toFixed(1), "s")))),
            meta.sources && meta.sources.length > 0 && React.createElement("div", { className: "mb-search-sources" },
                React.createElement("b", null, "检索到的来源"),
                React.createElement("ul", null, meta.sources.map(s => React.createElement("li", { key: s.url },
                    React.createElement("a", { href: s.url, target: "_blank", rel: "noreferrer noopener" }, s.title || s.url),
                    s.site && React.createElement("span", null, s.site))))),
            !isImage && reasoning
                && React.createElement("div", { className: "mb-reasoning" },
                    React.createElement("div", { className: "mb-reasoning-head" },
                        React.createElement("b", null, "模型推理文本"),
                        React.createElement("small", null, `${reasoning.length.toLocaleString()} 字 · 由供应商流式返回`)),
                    React.createElement("div", { className: "mb-reasoning-body", ref: box, onScroll },
                        React.createElement("pre", null, reasoning),
                        thinking && React.createElement("i", { className: "mb-stream-cursor", "aria-hidden": "true" }))),
            !reasoning && React.createElement("p", { className: "mb-summary-empty" },
                isImage
                    ? '生图请求不涉及推理文本。图片由智谱 CogView 生成，链接有效期有限，请及时下载保存。'
                    : meta.reasoningObserved === false || meta.effort === 'off'
                        ? '本次未返回推理文本：当前模型或档位不产生思考链。切换到「思考」档可以在这里实时看到推理过程。'
                        : '本次请求没有收到推理文本，也没有替代的思考摘要——这里不编造思维链。',
                meta.requestId && React.createElement("span", { className: "mb-request-id" }, "请求 ID：", meta.requestId))));
}

},

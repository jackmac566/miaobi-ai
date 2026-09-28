"components/ModelPicker":function(module,exports,require){

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ModelPicker;
const React = require("react");
const Overlay_1 = __importDefault(require("./ui/Overlay"));
const Icon_1 = __importDefault(require("./ui/Icon"));
const ProviderLogo_1 = __importDefault(require("./ui/ProviderLogo"));
const liquid_metal_button_1 = __importDefault(require("./ui/liquid-metal-button"));
const models_1 = require("../lib/models");

function priceText(model) {
    if (!model.price) return '价格以官网为准';
    if (!model.price.input && !model.price.output) return '免费档';
    return `${model.price.currency} ${model.price.input} / ${model.price.output} 每百万 Token（入/出）`;
}

function ModelPicker({ settings, onChange, onClose, capabilities, onCheck, checking, onConfigure }) {
    const groups = [];
    for (const m of models_1.MODELS) {
        let g = groups.find(x => x.id === m.provider);
        if (!g) { g = { id: m.provider, label: models_1.PROVIDERS[m.provider].label, items: [] }; groups.push(g); }
        g.items.push(m);
    }
    return React.createElement(Overlay_1.default, { title: "模型与思考", subtitle: "列表里就是真实模型；界面名字与实际发送的 Model ID 完全一致。", onClose: onClose, className: "mb-model-overlay" },
        groups.map(g => React.createElement("section", { className: "mb-model-group", key: g.id },
            React.createElement("div", { className: "mb-model-group-head" },
                React.createElement(ProviderLogo_1.default, { model: g.items[0].id, size: 18 }),
                React.createElement("b", null, g.label),
                React.createElement("small", null, capabilities?.providers?.find(p => p.id === g.id)?.configured ? 'Key 已填写' : 'Key 未填写')),
            React.createElement("div", { className: "mb-model-list", role: "group", "aria-label": `选择 ${g.label} 模型` }, g.items.map((m) => {
                const config = capabilities?.models?.find((c) => c.id === m.id);
                const selected = settings.model === m.id;
                return React.createElement("button", { key: m.id, className: `mb-model-option ${selected ? 'selected' : ''}`, "aria-pressed": selected, onClick: () => onChange((0, models_1.switchModel)(settings, m.id)) },
                    React.createElement("span", { className: "mb-model-logo-box" }, React.createElement(ProviderLogo_1.default, { model: m.id, size: 31 })),
                    React.createElement("span", { className: "mb-model-option-copy" },
                        React.createElement("b", null, m.label),
                        React.createElement("small", null, m.description),
                        React.createElement("em", null, "Model ID：", React.createElement("code", null, m.apiModel), " · ", priceText(m)),
                        React.createElement("em", null, config ? (config.configured ? 'Key 已填写，可直接调用' : `尚未填写 ${g.label} 的 API Key`) : '未连接到配置接口')),
                    React.createElement("span", { className: "mb-radio-mark" }, selected && React.createElement(Icon_1.default, { name: "check", size: 13 })));
            })))),
        React.createElement("div", { className: "mb-effort-heading" },
            React.createElement("span", null, React.createElement(Icon_1.default, { name: "sliders", size: 16 }), "思考强度"),
            React.createElement("b", null, models_1.EFFORT_LABELS[settings.effort] || settings.effort)),
        React.createElement("div", { className: "mb-effort-options", role: "group", "aria-label": "思考强度" }, (0, models_1.effortsFor)(settings.model).map((e, i) => React.createElement("button", { key: e, "aria-pressed": settings.effort === e, className: settings.effort === e ? 'selected' : '', onClick: () => onChange({ effort: e, modelEfforts: { ...settings.modelEfforts, [settings.model]: e } }) },
            React.createElement("span", { className: "mb-effort-bars", "aria-hidden": "true" }, [0, 1, 2, 3, 4].map(b => React.createElement("i", { key: b, className: b < (e === 'off' ? 1 : i + 1) ? 'filled' : '' }))),
            React.createElement("span", null, models_1.EFFORT_LABELS[e])))),
        React.createElement("p", { className: "mb-effort-hint" }, models_1.EFFORT_HINTS[settings.effort]),
        React.createElement("div", { className: "mb-setting-line mb-summary-setting" },
            React.createElement("div", null,
                React.createElement("b", null, "默认展开执行详情"),
                React.createElement("small", null, "展开后可看到真实请求步骤、首字延迟、以及模型返回的推理文本。不编造思维链。")),
            React.createElement("button", { className: `mb-toggle ${settings.showSummary ? 'on' : ''}`, role: "switch", "aria-label": "默认展开执行详情", "aria-checked": settings.showSummary, onClick: () => onChange({ showSummary: !settings.showSummary }) },
                React.createElement("i", null))),
        React.createElement("div", { className: "mb-model-mapping" },
            React.createElement(Icon_1.default, { name: "shield", size: 15 }),
            React.createElement("p", null,
                "当前选择：", (0, models_1.displayName)(settings),
                "。实际调用 ", React.createElement("code", null, (0, models_1.modelOf)(settings.model).apiModel),
                "，由 ", models_1.PROVIDERS[(0, models_1.modelOf)(settings.model).provider].label, " 提供。")),
        React.createElement("footer", { className: "mb-model-footer" },
            React.createElement("button", { className: "mb-text-btn", disabled: checking, onClick: onCheck },
                React.createElement(Icon_1.default, { name: "refresh", size: 14 }),
                checking ? '检查中…' : '刷新连接状态'),
            React.createElement("button", { className: "mb-secondary-btn", onClick: onConfigure }, "API 设置"),
            React.createElement(liquid_metal_button_1.default, { onClick: onClose }, "完成")));
}

},

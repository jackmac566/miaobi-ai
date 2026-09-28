"lib/types":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replyMeta = exports.messageText = exports.DEFAULT_SETTINGS = void 0;
exports.uid = uid;
exports.newConversation = newConversation;
const models_1 = require("./models");
exports.DEFAULT_SETTINGS = {
    model: 'ds-fast',
    effort: 'off',
    modelEfforts: (0, models_1.safeModelEfforts)({}),
    intent: 'chat',
    showSummary: true,
    scene: 'auto',
    style: '自然松弛',
    length: '标准 · 150—300字',
    intensity: '标准',
    preference: '',
    audience: '',
    requirements: '',
    webSearch: false,
    imageMode: false,
};
const messageText = (m) => m.variants?.[m.variant ?? 0] ?? m.text;
exports.messageText = messageText;
function uid() { return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
function newConversation(temporary = false, settings = exports.DEFAULT_SETTINGS) {
    return { id: uid(), title: temporary ? '临时对话' : '新对话', created: Date.now(), updated: Date.now(), messages: [], temporary, settings: { ...settings } };
}
const replyMeta = (m) => m.status === 'pending' ? m.liveMeta : m.variantMeta?.[m.variant ?? 0] ?? m.liveMeta;
exports.replyMeta = replyMeta;

},

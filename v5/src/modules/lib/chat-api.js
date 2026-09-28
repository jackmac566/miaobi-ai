"lib/chat-api":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeChatRequest = makeChatRequest;
exports.consumeSSE = consumeSSE;
exports.chatStream = chatStream;
exports.imageStream = imageStream;
exports.getChatCapabilities = getChatCapabilities;
const api_1 = require("./api");
const types_1 = require("./types");
const models_1 = require("./models");
/** 当前这条输入永远不截断；更早的完整轮次可能被丢弃，并会给出提示。 */
function makeChatRequest(messages, settings, limit = 20000) {
    const last = messages.at(-1);
    if (!last || last.role !== 'user')
        throw new api_1.ApiError('请先输入一条消息。');
    const contentOf = (m) => (0, types_1.messageText)(m) + (m.attachments?.map(a => `\n\n【用户提供的文本附件：${a.name}】\n${a.text}\n【附件结束】`).join('') || '');
    const current = contentOf(last);
    const rawChars = last.text.length + (last.attachments || []).reduce((n, a) => n + a.text.length, 0);
    if (!current.trim())
        throw new api_1.ApiError('消息不能为空。');
    if (rawChars > limit)
        throw new api_1.ApiError(`本条消息与附件共 ${rawChars.toLocaleString()} 字，超过 ${limit.toLocaleString()} 字限制。请缩短内容后发送。`);
    const controlChars = settings.requirements.length + settings.audience.length;
    if (controlChars > 2000)
        throw new api_1.ApiError('额外要求与目标读者合计过长。');
    const prior = [];
    let turn = [];
    for (const m of messages.slice(0, -1)) {
        if (m.role === 'user') {
            if (turn.length && turn.at(-1)?.role === 'assistant')
                prior.push(turn);
            turn = [{ role: 'user', content: contentOf(m) }];
        }
        else if (m.status === 'done' && (0, types_1.messageText)(m).trim() && turn.length) {
            turn.push({ role: 'assistant', content: (0, types_1.messageText)(m) });
        }
    }
    if (turn.length && turn.at(-1)?.role === 'assistant')
        prior.push(turn);
    let total = current.length + controlChars;
    const keep = [];
    for (const pair of prior.slice().reverse()) {
        const n = pair.reduce((a, b) => a + b.content.length, 0);
        if (keep.length >= 12 || total + n > 58000)
            break;
        keep.unshift(pair);
        total += n;
    }
    const selected = (0, models_1.modelOf)(settings.model).id;
    const body = {
        model: selected,
        effort: (0, models_1.normalizeEffort)(selected, settings.effort),
        intent: settings.intent || 'chat',
        messages: [...keep.flat(), { role: 'user', content: current }],
        webSearch: settings.webSearch === true,
        searchQuery: current.slice(0, 400),
    };
    /* 写作控制信息只在写作模式下携带，避免普通对话白白变长、变慢。 */
    if (body.intent !== 'chat' || (settings.scene && settings.scene !== 'auto')) {
        body.writing = { scene: settings.scene, style: settings.style, length: settings.length, preference: settings.preference, intensity: settings.intensity, audience: settings.audience, requirements: settings.requirements };
    }
    if (new TextEncoder().encode(JSON.stringify(body)).length > 256000)
        throw new api_1.ApiError('请求体过大，请减少附件内容。');
    return { body, omitted: prior.length - keep.length };
}
/** UTF-8 安全的逐行 SSE 解析；兼容 CRLF、注释行与跨 chunk 边界。 */
async function consumeSSE(stream, onEvent, signal) {
    const reader = stream.getReader(), decoder = new TextDecoder();
    let buffer = '', data = [];
    let done = false;
    const dispatch = () => { if (!data.length)
        return; const raw = data.join('\n'); data = []; if (raw === '[DONE]')
        return; let e; try {
        e = JSON.parse(raw);
    }
    catch {
        throw new api_1.ApiError('流式回复格式异常，请重新尝试。');
    } if (!e || typeof e.type !== 'string')
        throw new api_1.ApiError('流式事件缺少类型。'); if (e.type === 'error')
        throw new api_1.ApiError(e.message || '生成中断。', 502, e.code || 'UPSTREAM_ERROR'); if (e.type === 'done')
        done = true; onEvent(e); };
    const line = (l) => { if (l.endsWith('\r'))
        l = l.slice(0, -1); if (!l) {
        dispatch();
        return;
    } if (l.startsWith('data:'))
        data.push(l.slice(5).replace(/^ /, '')); };
    const abort = () => { void reader.cancel().catch(() => { }); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
        while (true) {
            if (signal?.aborted)
                throw new DOMException('Aborted', 'AbortError');
            const part = await reader.read();
            if (part.done)
                break;
            buffer += decoder.decode(part.value, { stream: true });
            if (buffer.length > 2000000)
                throw new api_1.ApiError('单个流式事件过大。');
            let i;
            while ((i = buffer.indexOf('\n')) !== -1) {
                line(buffer.slice(0, i));
                buffer = buffer.slice(i + 1);
            }
        }
        buffer += decoder.decode();
        if (buffer)
            line(buffer);
        dispatch();
        if (signal?.aborted)
            throw new DOMException('Aborted', 'AbortError');
        if (!done)
            throw new api_1.ApiError('连接提前结束，回复尚未完整生成。可以保留已收到的部分或重试。', 502, 'INCOMPLETE_STREAM');
    }
    finally {
        signal?.removeEventListener('abort', abort);
        await reader.cancel().catch(() => { });
        reader.releaseLock();
    }
}
async function chatStream(body, signal, onEvent) {
    const r = await require('./connection').apiFetch('/api/chat', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    if (!r.ok) {
        const error = await r.json().catch(() => ({}));
        throw new api_1.ApiError(error.error || `聊天接口返回 ${r.status}，请检查服务配置。`, r.status, error.code);
    }
    if (!r.body || !r.headers.get('content-type')?.includes('text/event-stream'))
        throw new api_1.ApiError('聊天接口没有返回流式数据。');
    await consumeSSE(r.body, onEvent, signal);
}
async function imageStream(body, signal, onEvent) {
    const r = await require('./connection').apiFetch('/api/image', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    if (!r.ok) {
        const error = await r.json().catch(() => ({}));
        throw new api_1.ApiError(error.error || `生图接口返回 ${r.status}。`, r.status, error.code);
    }
    if (!r.body || !r.headers.get('content-type')?.includes('text/event-stream'))
        throw new api_1.ApiError('生图接口没有返回流式数据。');
    await consumeSSE(r.body, onEvent, signal);
}
async function getChatCapabilities(signal) {
    const r = await require('./connection').apiFetch('/api/chat/capabilities', { credentials: 'same-origin', cache: 'no-store', signal });
    if (!r.ok)
        throw new api_1.ApiError('聊天服务未连接。');
    const data = await r.json();
    if (data.version !== 3 || !Array.isArray(data.models))
        throw new api_1.ApiError('聊天服务协议不匹配。');
    return data;
}

},

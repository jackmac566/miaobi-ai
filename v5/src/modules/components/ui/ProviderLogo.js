"components/ui/ProviderLogo":function(module,exports,require){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ProviderLogo;
const React = require("react");
const models_1 = require("../../lib/models");
/** 厂商标识用自绘字母徽标，不使用其它公司的品牌图形，避免误认。 */
const BRAND = {
    deepseek: { bg: '#4D6BFE', fg: '#FFFFFF', mark: 'DS' },
    zhipu: { bg: '#0E7490', fg: '#E6FEFF', mark: 'GLM' },
};
function ProviderLogo({ model, size = 24 }) {
    /* 生图模型的返回值和聊天 Model ID 不是一套，这里也要能认出厂商，
       否则一张 CogView 生成的图会被挂上聊天模型的厂商标。 */
    const img = (0, models_1.imageModelOf)(model);
    const provider = img ? img.provider : (0, models_1.modelOf)(model).provider;
    const brand = BRAND[provider] || BRAND.deepseek;
    const r = size * 0.26;
    const fs = brand.mark.length > 2 ? size * 0.3 : size * 0.42;
    return React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": "true", className: `mb-provider-logo provider-${provider}` },
        React.createElement("rect", { x: 0, y: 0, width: 24, height: 24, rx: 24 * (r / size), fill: brand.bg }),
        React.createElement("text", { x: 12, y: 12.6, textAnchor: "middle", dominantBaseline: "central", fill: brand.fg, fontSize: 24 * (fs / size), fontWeight: 600, fontFamily: 'ui-sans-serif,system-ui,sans-serif', letterSpacing: brand.mark.length > 2 ? '-0.4' : '0' }, brand.mark));
}

},

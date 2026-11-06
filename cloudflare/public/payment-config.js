// 人工收款配置（仅部署方修改，切勿把收款码图片提交到公开 Git 仓库）
// 当前配置：仅微信个人收款码，人工核对到账后开通会员。
// 图片位置：cloudflare/public/payment/wechat.png（已被 .gitignore 排除）。
// 修改此文件后需重新执行 npm run deploy:cloudflare 才会生效。
window.__MIAOBI_STATIC_MODE__ = true;
window.__MIAOBI_PAYMENT__ = {
  enabled: true,
  contact: "付款后请将支付截图与你的登录邮箱发送至 shikanghou4@gmail.com，站长核对到账后为你开通会员",
  note: "个人收款码没有自动回调：权益由站长核对真实到账后人工开通；请保留支付凭证。",
  methods: [
    { id: "wechat", name: "微信支付", qr: "/payment/wechat.png", crop: "wechat" },
  ],
};

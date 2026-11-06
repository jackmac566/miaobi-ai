// 人工收款配置（仅部署方修改，切勿把收款码图片提交到公开 Git 仓库）
// 启用步骤：
//   1. 把自己的微信/支付宝收款码图片分别保存为
//      cloudflare/public/payment/wechat.png 和 alipay.png；
//   2. 把下方 enabled 改为 true；
//   3. 把 contact 改成你希望用户联系你的方式（微信、邮箱等）；
//   4. 在 methods 里取消注释微信 / 支付宝条目（或按同样格式新增其他方式）；
//   5. 重新执行 npm run deploy:cloudflare。
// 注意：个人收款码没有支付回调，付款、开通与退款都必须人工核对，保留凭证。
window.__MIAOBI_STATIC_MODE__ = true;
window.__MIAOBI_PAYMENT__ = {
  enabled: false,
  contact: "",
  note: "个人收款码没有自动回调：权益由站长核对真实到账后人工开通；请保留支付凭证。",
  // 付款方式示例（放好图片后取消注释）：
  // { id: "wechat", name: "微信支付", qr: "/payment/wechat.png", crop: "wechat" },
  // { id: "alipay", name: "支付宝", qr: "/payment/alipay.png", crop: "alipay" },
  methods: [],
};
